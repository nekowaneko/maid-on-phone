// W-A 契約驗證（M4.4 §4.7）：設定頁的欄位對應 ↔ 後端真的驗證訊息、Activity 的接線、資源有沒有接上。
// drink.js 一律用真的，不得替換；這支測試不需要任何外部服務。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { validateDrinkSettings } from '../core/drink.js'

// 常數定義
const read = (url) => readFileSync(url, 'utf8').split('\r\n').join('\n') // 統一換行，Windows 檔案才切得準
const ROOT = new URL('../../', import.meta.url)
const ERROR_KT = read(new URL('core/src/main/kotlin/com/accompany/pet/core/drink/SettingsError.kt', ROOT))
const SETTINGS_KT = read(new URL('app/src/main/java/com/accompany/pet/DrinkSettingsActivity.kt', ROOT))
const DRINK_JS = read(new URL('backend/core/drink.js', ROOT))
const RES = new URL('app/src/main/res/', ROOT)
const COLORS_XML = read(new URL('values/colors.xml', RES))
const VALID = { subscriptionName: '星巴克咖啡月租', monthlyFee: 990, resistValue: 100, monthlyQuota: 20, askTime: '20:00' }
const BAD_CASES = [
  { field: 'NAME', patch: { subscriptionName: '   ' } },
  { field: 'FEE', patch: { monthlyFee: 0 } },
  { field: 'RESIST', patch: { resistValue: -1 } },
  { field: 'QUOTA', patch: { monthlyQuota: 301 } },
  { field: 'ASK', patch: { askTime: '25:99' } }
]

// 功能函數定義

// 從 Kotlin 原始碼取出 SettingsField 成員與 label
const kotlinLabels = () => Object.fromEntries([...ERROR_KT.matchAll(/^\s*([A-Z]+)\("([^"]+)"\),?$/gm)].map((m) => [m[1], m[2]]))

// 取出某個私有函式的本體（到下一個同層 private fun 之前）
const bodyOf = (name) => {
  const start = SETTINGS_KT.indexOf(`private fun ${name}(`)
  assert.ok(start >= 0, `找不到 ${name}`)
  const next = SETTINGS_KT.indexOf('\n    private fun ', start + 1)
  return SETTINGS_KT.slice(start, next < 0 ? SETTINGS_KT.length : next)
}

test('W-A① 五種壞資料：真的 validateDrinkSettings 的訊息開頭之後，恰好等於 SettingsField 的 label', () => {
  const labels = kotlinLabels()
  assert.deepEqual(Object.keys(labels).sort(), ['ASK', 'FEE', 'NAME', 'QUOTA', 'RESIST'])
  const prefixKotlin = ERROR_KT.match(/const val SETTINGS_ERROR_PREFIX = "([^"]+)"/)[1]
  const prefixJs = DRINK_JS.match(/const SETTINGS_ERROR_PREFIX = '([^']+)'/)[1]
  assert.equal(prefixKotlin, prefixJs)
  for (const { field, patch } of BAD_CASES) {
    const result = validateDrinkSettings({ ...VALID, ...patch })
    assert.equal(result.ok, false, field)
    assert.ok(result.error.startsWith(prefixJs), result.error)
    assert.equal(result.error.slice(prefixJs.length), labels[field], `${field} 的 label 與後端不一致`)
  }
  assert.equal(validateDrinkSettings(VALID).ok, true)
})

test('W-A② 兩個儲存回呼都呼叫 settingsFieldOf；儲存與載入開頭都清紅框；標紅與監聽都存在', () => {
  assert.ok(bodyOf('saveSettings').includes('settingsFieldOf('), 'saveSettings 缺少 settingsFieldOf(')
  assert.ok(bodyOf('saveEnabled').includes('settingsFieldOf('), 'saveEnabled 缺少 settingsFieldOf(')
  assert.ok(bodyOf('saveSettings').indexOf('clearMark()') > 0, 'saveSettings 缺少 clearMark()')
  assert.ok(bodyOf('loadSettings').indexOf('clearMark()') > 0, 'loadSettings 缺少 clearMark()')
  assert.ok(SETTINGS_KT.includes('markField('))
  assert.ok(SETTINGS_KT.includes('TextWatcher') || SETTINGS_KT.includes('addTextChangedListener'))
  // 結果訊息原樣放進狀態列：顯示用的函式把 message 直接指給 status.text
  assert.match(bodyOf('showStatus'), /status\.text = text/)
  assert.match(bodyOf('showResult'), /showStatus\(message,/)
})

test('W-A③ Activity 引用的資源都存在，M4.4 新增的資源都存在且被引用', () => {
  const declared = new Set([...COLORS_XML.matchAll(/<color name="([^"]+)"/g)].map((m) => m[1]))
  for (const m of SETTINGS_KT.matchAll(/R\.drawable\.(\w+)/g)) {
    assert.ok(existsSync(new URL(`drawable/${m[1]}.xml`, RES)) || existsSync(new URL(`drawable/${m[1]}.jpg`, RES)), `drawable ${m[1]} 不存在`)
  }
  for (const m of SETTINGS_KT.matchAll(/R\.color\.(\w+)/g)) {
    assert.ok(declared.has(m[1]) || existsSync(new URL(`color/${m[1]}.xml`, RES)), `color ${m[1]} 不存在`)
  }
  for (const name of ['switch_track_tint', 'switch_thumb_tint']) {
    assert.ok(existsSync(new URL(`color/${name}.xml`, RES)), name)
    assert.ok(SETTINGS_KT.includes(`R.color.${name}`), `${name} 沒被 Activity 引用`)
  }
})

test('W-A④ viewOf 對 RESIST 回傳入帳金額那一欄，其他欄位也各自對應', () => {
  const body = bodyOf('viewOf')
  const expected = { NAME: 'nameBox', FEE: 'feeBox', RESIST: 'resistBox', QUOTA: 'quotaBox', ASK: 'askBox' }
  for (const [member, box] of Object.entries(expected)) {
    assert.ok(body.includes(`SettingsField.${member} -> ${box}`), `${member} 應對應 ${box}`)
  }
  // resistBox 確實包的是入帳金額的輸入框，且該列標籤是「入帳金額」
  assert.match(SETTINGS_KT, /resistBox = inputBox\(resistInput,/)
  assert.match(SETTINGS_KT, /addField\(resistCard, "入帳金額",[^\n]*resistBox\)/)
})

test('W-A⑤ 儲存流程沒有退化：設定 body 仍是五個欄位、不含 enabled，開關在第二步', () => {
  const saveBody = bodyOf('saveSettings')
  for (const key of ['FIELD_NAME', 'FIELD_FEE', 'FIELD_RESIST', 'FIELD_QUOTA', 'FIELD_ASK']) assert.ok(saveBody.includes(key), key)
  assert.ok(!saveBody.includes('"enabled"') && !saveBody.includes('ENABLED_PATH'))
  assert.ok(saveBody.indexOf('WorkerApi.put(SETTINGS_PATH') >= 0)
  assert.ok(saveBody.indexOf('return@put') < saveBody.indexOf('saveEnabled()'))
  assert.ok(bodyOf('saveEnabled').includes('WorkerApi.put(ENABLED_PATH'))
  assert.ok(!SETTINGS_KT.includes('SharedPreferences'))
})
