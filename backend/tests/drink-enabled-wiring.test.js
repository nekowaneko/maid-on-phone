// W-A 契約驗證（M4.3 §4.7）：後端路由與錯誤文字 ↔ Kotlin 常數、Kotlin 呼叫的網頁方法 ↔ 網頁定義、
// 設定畫面的儲存流程 ↔ 後端不得被改動的設定處理，最後用真的 createHandler／runScheduled 走完一整輪開關。
// 只替換外部服務（語言模型、資料庫、推播、時間）；handlers.js、drink.js 一律用真的，不得替換。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler, runScheduled } from '../worker/handlers.js'
import { createStore } from '../worker/store.stub.js'
import { createFcmStub } from '../worker/fcm-client.stub.js'

// 常數定義
const SECRET = 'test-only-secret'
const SECRET_HEADER = 'x-app-secret'
const ORIGIN = 'http://localhost'
const DEVICE_TOKEN = 'test-only-device-token'
const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'test-only-project',
  client_email: 'test-only@test-only-project.iam.gserviceaccount.example',
  private_key: 'test-only-private-key'
})
const ENABLED_PATH = '/api/drink/enabled'
const HTTP_OK = 200
const HTTP_FORBIDDEN = 403
const APP_DIR = new URL('../../app/src/main/', import.meta.url)
const read = (url) => readFileSync(url, 'utf8').split('\r\n').join('\n') // 統一換行，Windows 檔案才切得準
const HANDLERS = read(new URL('../worker/handlers.js', import.meta.url))
const DRINK_KT = read(new URL('../../core/src/main/kotlin/com/accompany/pet/core/drink/Drink.kt', import.meta.url))
const OVERLAY_KT = read(new URL('java/com/accompany/pet/OverlayService.kt', APP_DIR))
const SETTINGS_KT = read(new URL('java/com/accompany/pet/DrinkSettingsActivity.kt', APP_DIR))
const INDEX_HTML = read(new URL('assets/pet/index.html', APP_DIR))
const readConfig = (name) => readFileSync(new URL(`../config/${name}`, import.meta.url), 'utf8')

// 全程不該碰到網路
globalThis.fetch = () => {
  throw new Error('測試期間不得對外發出任何請求')
}

// 功能函數定義

// 台北時間轉成毫秒
const tpe = (local) => Date.parse(`${local}:00+08:00`)

// 取 Kotlin 字串常數的值
const ktString = (name) => DRINK_KT.match(new RegExp(`const val ${name} = "([^"]*)"`))?.[1]

// 取 Kotlin 整數常數的值
const ktInt = (name) => Number(DRINK_KT.match(new RegExp(`const val ${name} = (\\d+)`))?.[1])

// 取 handlers.js 的常數值（字串或數字）
const jsConst = (name) => {
  const m = HANDLERS.match(new RegExp(`const ${name} = (?:'([^']*)'|(\\d+))`))
  return m?.[1] ?? Number(m?.[2])
}

// 取出一個 Kotlin 函式本體（從 "fun name" 到下一個縮排四格的 "    }"）
const ktFunction = (source, name) => {
  const start = source.indexOf(`fun ${name}`)
  assert.ok(start >= 0, `找不到 fun ${name}`)
  const end = source.indexOf('\n    }\n', start)
  return source.slice(start, end)
}

// 組出完整的相依與可調整的時鐘；外部服務全走 stub
const setup = () => {
  const fcm = createFcmStub()
  const clock = { now: tpe('2026-10-07T15:10') }
  const deps = {
    emotionConfig: JSON.parse(readConfig('emotion-map.json')),
    gapConfig: JSON.parse(readConfig('time-gap-tiers.json')),
    fallbackConfig: JSON.parse(readConfig('fallback-lines.json')),
    quotaConfig: JSON.parse(readConfig('quota.json')),
    personaSchema: JSON.parse(readConfig('persona-schema.json')),
    messageSchema: JSON.parse(readConfig('message.json')),
    personaText: readConfig('persona.md'),
    templateText: readConfig('prompt-template.md'),
    drinkModel: JSON.parse(readConfig('drink-model.json')),
    starbucksTable: JSON.parse(readConfig('starbucks.json')),
    drinkDefaults: JSON.parse(readConfig('drink-defaults.json')),
    drinkLines: JSON.parse(readConfig('drink-lines.json')),
    drinkPrompts: { parse: '【解析】', script: '【台詞】' },
    sleep: async () => {},
    secret: SECRET,
    store: createStore({}),
    streamer: () => ({
      [Symbol.asyncIterator]: async function* () {
        throw new Error('stub：此測試不應呼叫語言模型')
      }
    }),
    now: () => clock.now,
    pusher: (message) => fcm.sendFcm(message, SERVICE_ACCOUNT),
    pushConfig: { serviceAccount: SERVICE_ACCOUNT, deviceToken: DEVICE_TOKEN },
    randomText: () => 'r1'
  }
  const handle = createHandler(deps)
  const call = async (method, path, body) => {
    const init = { method, headers: { [SECRET_HEADER]: SECRET } }
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const response = await handle(new Request(`${ORIGIN}${path}`, init))
    const text = await response.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { status: response.status, json }
  }
  const run = async (local) => {
    clock.now = tpe(local)
    await runScheduled(deps, clock.now)
  }
  return { deps, fcm, clock, call, run }
}

const draft = {
  name: '珍珠奶茶', starbucksId: null, baseId: 'milktea', sizeId: 'L', sugarLevelId: 'half',
  iceId: 'none', toppingIds: ['boba'], price: null
}

test('W-A：Kotlin 的路徑、403 與提示文字和 handlers.js 的路由、錯誤文字一致（A70）', () => {
  assert.equal(ktString('ENABLED_PATH'), `/api/drink/${'enabled'}`)
  assert.match(HANDLERS, /enabled: \{ \[GET_METHOD\]: handleDrinkEnabledRead/) // 路由名稱 enabled
  const disabledError = jsConst('DRINK_DISABLED_ERROR')
  assert.equal(disabledError, '戒飲記錄已關閉')
  assert.ok(ktString('DRINK_DISABLED_MESSAGE').startsWith(disabledError))
  assert.equal(ktInt('STATUS_DISABLED'), jsConst('HTTP_FORBIDDEN'))
  assert.equal(ktInt('STATUS_DISABLED'), HTTP_FORBIDDEN)
})

test('W-A：OverlayService 呼叫的 setDrinkEnabled 與 index.html 定義的同名，三個按鈕 id 存在', () => {
  assert.match(OVERLAY_KT, /window\.pet\.setDrinkEnabled&&window\.pet\.setDrinkEnabled\(\$flag\)/)
  assert.match(INDEX_HTML, /\bsetDrinkEnabled: function \(on\)/)
  for (const id of ['mic', 'resist', 'history']) assert.ok(INDEX_HTML.includes(`id="${id}"`), `缺 #${id}`)
  assert.ok(OVERLAY_KT.includes('ENABLED_PATH'))
  assert.ok(OVERLAY_KT.includes('drinkUiEnabled('))
})

test('W-A：設定畫面先 PUT 設定、成功後才 PUT 開關，且設定 body 不含 enabled（A62、M43-S15）', () => {
  const save = ktFunction(SETTINGS_KT, 'saveSettings')
  assert.ok(save.includes('WorkerApi.put(SETTINGS_PATH'))
  assert.ok(!save.includes('ENABLED_PATH'), '第一步不可送開關')
  assert.ok(!save.includes('"enabled"'), '設定 body 不得含 enabled')
  assert.ok(save.includes('saveEnabled()'), '設定成功後才呼叫第二步')
  assert.ok(save.indexOf('return@put') < save.indexOf('saveEnabled()'), '設定失敗要先返回')
  const second = ktFunction(SETTINGS_KT, 'saveEnabled')
  assert.ok(second.includes('WorkerApi.put(ENABLED_PATH'))
  assert.ok(second.includes('"enabled"'))
})

test('W-A：打開 → 記一筆 → 關閉（寫入被擋、詢問不發、統計仍可讀）→ 打開 → 恢復', async () => {
  const env = setup()
  assert.deepEqual((await env.call('GET', ENABLED_PATH)).json, { enabled: true })
  const saved = await env.call('POST', '/api/drink/confirm', { draft })
  assert.equal(saved.status, HTTP_OK)
  assert.equal(saved.json.kind, 'saved')

  assert.equal((await env.call('PUT', ENABLED_PATH, { enabled: false })).status, HTTP_OK)
  const blocked = await env.call('POST', '/api/drink/confirm', { draft })
  assert.equal(blocked.status, HTTP_FORBIDDEN)
  assert.ok(ktString('DRINK_DISABLED_MESSAGE').startsWith(blocked.json.error))
  await env.run('2026-10-08T15:00')
  assert.equal(env.fcm.sent.length, 0, '關閉時不發詢問')
  const stats = await env.call('GET', '/api/drink/stats')
  assert.equal(stats.status, HTTP_OK)
  assert.equal((await env.call('GET', '/api/drink/export')).json.logs.length, 1)

  assert.equal((await env.call('PUT', ENABLED_PATH, { enabled: true })).status, HTTP_OK)
  assert.equal((await env.call('POST', '/api/drink/confirm', { draft })).status, HTTP_OK)
  await env.run('2026-10-09T15:00')
  assert.equal(env.fcm.sent.length, 1, '重新打開後恢復詢問')
  assert.equal((await env.call('GET', '/api/drink/export')).json.logs.length, 2)
})
