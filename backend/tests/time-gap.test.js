// core/time-gap.js 的單元測試：分級表查找、提示句產生、時間戳換算。
// 級距值一律從 config/time-gap-tiers.json 讀入，不在測試裡重寫一份。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pickTier, buildTimeGapHint, minutesBetween } from '../core/time-gap.js'

// 常數定義
const GAP_CONFIG = JSON.parse(readFileSync(new URL('../config/time-gap-tiers.json', import.meta.url), 'utf8'))
const TIERS = GAP_CONFIG.tiers
const FIRST_TIER = TIERS[0]
const LAST_TIER = TIERS[TIERS.length - 1]
const MINUTES_PER_DAY = 1440

test('pickTier 取得第一級：分鐘數落在第一個上限之內', () => {
  assert.equal(pickTier(FIRST_TIER.maxMinutes - 1, TIERS).key, FIRST_TIER.key)
})

test('pickTier 邊界值落在該級距之內（採用小於等於）', () => {
  assert.equal(pickTier(FIRST_TIER.maxMinutes, TIERS).key, FIRST_TIER.key)
})

test('pickTier 超過第一級上限就落到第二級', () => {
  assert.equal(pickTier(FIRST_TIER.maxMinutes + 1, TIERS).key, TIERS[1].key)
})

test('pickTier 極大分鐘數落到無上限的最後一級', () => {
  assert.equal(pickTier(MINUTES_PER_DAY * 3650, TIERS).key, LAST_TIER.key)
})

test('pickTier 對負數與非數字都當作剛剛才聊過', () => {
  assert.equal(pickTier(-5, TIERS).key, FIRST_TIER.key)
  assert.equal(pickTier(Number.NaN, TIERS).key, FIRST_TIER.key)
  assert.equal(pickTier(undefined, TIERS).key, FIRST_TIER.key)
})

test('pickTier 對空分級表回傳 null', () => {
  assert.equal(pickTier(10, []), null)
  assert.equal(pickTier(10, undefined), null)
})

test('分級表最後一項必須是無上限，否則極大值會查無資料', () => {
  assert.equal(LAST_TIER.maxMinutes, null)
})

test('buildTimeGapHint 回傳該級距的提示句', () => {
  assert.equal(buildTimeGapHint(0, TIERS), FIRST_TIER.hint)
  assert.equal(buildTimeGapHint(MINUTES_PER_DAY * 30, TIERS), LAST_TIER.hint)
})

test('buildTimeGapHint 查無級距時回傳空字串而非 undefined', () => {
  assert.equal(buildTimeGapHint(10, []), '')
  // 級距存在但沒寫 hint 也不能吐出 undefined
  assert.equal(buildTimeGapHint(10, [{ maxMinutes: null, key: 'broken' }]), '')
})

test('minutesBetween 把毫秒間隔換算成分鐘', () => {
  const start = 1700000000000
  assert.equal(minutesBetween(start, start + 90 * 60000), 90)
})

test('minutesBetween 對顛倒或無效的時間戳回傳 0', () => {
  const start = 1700000000000
  assert.equal(minutesBetween(start + 60000, start), 0)
  assert.equal(minutesBetween(null, Number.NaN), 0)
  assert.equal(minutesBetween(undefined, start), 0)
})
