// M4.3 輔助測試：戒飲記錄開關的純函式邊界（isDrinkEnabled、parseDrinkEnabled、shouldAsk 的 enabled 參數）

import test from 'node:test'
import assert from 'node:assert/strict'
import { isDrinkEnabled, parseDrinkEnabled, shouldAsk, validateDrinkSettings } from '../core/drink.js'

// 常數定義
const ENABLED_ERROR = '設定值不正確：啟用戒飲記錄'
const ASK_INPUT = { hour: 15, askTime: '15:00', askedOn: null, todayKey: '2026-10-07', logs: [] }

test('isDrinkEnabled：只有字串 false 才算關閉', () => {
  assert.equal(isDrinkEnabled('false'), false)
  for (const stored of ['true', null, undefined, '', 'False', 'FALSE', 'no', '0', false, 0]) {
    assert.equal(isDrinkEnabled(stored), true, `輸入 ${String(stored)} 應為開啟`)
  }
})

test('parseDrinkEnabled：布林值合格', () => {
  assert.deepEqual(parseDrinkEnabled({ enabled: true }), { ok: true, enabled: true })
  assert.deepEqual(parseDrinkEnabled({ enabled: false }), { ok: true, enabled: false })
})

test('parseDrinkEnabled：非布林或非物件一律不合格', () => {
  const bad = [{ enabled: 'true' }, { enabled: 'false' }, { enabled: 1 }, { enabled: 0 }, { enabled: null }, {}, null, undefined, 'x', 5, [], [true]]
  for (const payload of bad) {
    assert.deepEqual(parseDrinkEnabled(payload), { ok: false, error: ENABLED_ERROR })
  }
})

test('shouldAsk：enabled 預設為開，既有呼叫不受影響', () => {
  assert.equal(shouldAsk(ASK_INPUT), true)
  assert.equal(shouldAsk({ ...ASK_INPUT, enabled: true }), true)
  assert.equal(shouldAsk({ ...ASK_INPUT, enabled: undefined }), true)
})

test('shouldAsk：enabled 恰為 false 時一律不問', () => {
  assert.equal(shouldAsk({ ...ASK_INPUT, enabled: false }), false)
})

test('validateDrinkSettings：回傳不含 enabled（A62）', () => {
  const checked = validateDrinkSettings({
    subscriptionName: '戒飲存',
    monthlyFee: 199,
    resistValue: 50,
    monthlyQuota: 8,
    askTime: '15:00',
    enabled: false
  })
  assert.equal(checked.ok, true)
  assert.equal(Object.hasOwn(checked.settings, 'enabled'), false)
})
