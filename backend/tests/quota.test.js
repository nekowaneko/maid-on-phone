// core/quota.js 的單元測試：時區切日與用量彙總。
//
// 跨日測試涵蓋三個時刻：臺北午夜前一分鐘、臺北午夜後一分鐘、跨月的那一天。
// 全部用固定的時間戳，不讀系統時鐘，所以幾點跑都得到同樣的結果。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { zonedDateKey, nextResetMs, summarizeUsage } from '../core/quota.js'

// 常數定義
const QUOTA = JSON.parse(readFileSync(new URL('../config/quota.json', import.meta.url), 'utf8'))
const TAIPEI_OFFSET = QUOTA.utcOffsetMinutes // 480，UTC+8，臺灣沒有日光節約時間
const MINUTE_MS = 60000
// 臺北時間 2026-03-11 00:00 整，等於 UTC 2026-03-10 16:00
const TAIPEI_MIDNIGHT = Date.UTC(2026, 2, 10, 16, 0, 0)
// 臺北時間 2026-04-01 00:00 整，用來驗跨月
const TAIPEI_MONTH_TURN = Date.UTC(2026, 2, 31, 16, 0, 0)

// NETWORK_GUARD：純函式層不該有任何對外請求，這裡一併把門關上
let networkCalls = 0
const NETWORK_GUARD = () => {
  networkCalls += 1
  throw new Error('測試期間不得對外發出任何請求')
}
globalThis.fetch = NETWORK_GUARD

test('跨日：臺北午夜前一分鐘還算前一天', () => {
  assert.equal(zonedDateKey(TAIPEI_MIDNIGHT - MINUTE_MS, TAIPEI_OFFSET), '2026-03-10')
})

test('跨日：臺北午夜後一分鐘已經是新的一天', () => {
  assert.equal(zonedDateKey(TAIPEI_MIDNIGHT + MINUTE_MS, TAIPEI_OFFSET), '2026-03-11')
})

test('跨日：跨月那一天的月份與日期都要跟著翻', () => {
  assert.equal(zonedDateKey(TAIPEI_MONTH_TURN - MINUTE_MS, TAIPEI_OFFSET), '2026-03-31')
  assert.equal(zonedDateKey(TAIPEI_MONTH_TURN + MINUTE_MS, TAIPEI_OFFSET), '2026-04-01')
})

test('跨日：跨年那一刻也要翻對', () => {
  const yearTurn = Date.UTC(2026, 11, 31, 16, 0, 0) // 臺北時間 2027-01-01 00:00
  assert.equal(zonedDateKey(yearTurn - MINUTE_MS, TAIPEI_OFFSET), '2026-12-31')
  assert.equal(zonedDateKey(yearTurn + MINUTE_MS, TAIPEI_OFFSET), '2027-01-01')
})

test('同一個 UTC 時刻在臺北與 UTC 可能屬於不同的一天', () => {
  // UTC 2026-03-10 16:30 在臺北已經是 3/11 凌晨了
  const moment = Date.UTC(2026, 2, 10, 16, 30, 0)
  assert.equal(zonedDateKey(moment, 0), '2026-03-10')
  assert.equal(zonedDateKey(moment, TAIPEI_OFFSET), '2026-03-11')
})

test('日期一律補零成 YYYY-MM-DD', () => {
  const key = zonedDateKey(Date.UTC(2026, 0, 4, 0, 0, 0), TAIPEI_OFFSET)
  assert.equal(key, '2026-01-04')
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/)
})

test('nextResetMs：算得出下一次臺北午夜', () => {
  assert.equal(nextResetMs(TAIPEI_MIDNIGHT - MINUTE_MS, TAIPEI_OFFSET), TAIPEI_MIDNIGHT)
  // 剛過午夜一分鐘的話，下一次歸零是隔天午夜
  assert.equal(nextResetMs(TAIPEI_MIDNIGHT + MINUTE_MS, TAIPEI_OFFSET), TAIPEI_MIDNIGHT + 24 * 60 * MINUTE_MS)
})

test('nextResetMs：歸零時刻換算回日期就是隔天', () => {
  const at = nextResetMs(TAIPEI_MIDNIGHT + MINUTE_MS, TAIPEI_OFFSET)
  assert.equal(zonedDateKey(at, TAIPEI_OFFSET), '2026-03-12')
})

test('summarizeUsage：一律標明這是自記估計值', () => {
  const summary = summarizeUsage({ rpm: 1, rpd: 2 }, { rpm: 10, rpd: 100 })
  assert.equal(summary.estimated, true)
})

test('summarizeUsage：上限有數字時算得出剩餘與比例', () => {
  const summary = summarizeUsage({ rpm: 3, rpd: 25 }, { rpm: 15, rpd: 500, selfCap: 200 })
  assert.deepEqual(summary.rpm, { used: 3, limit: 15, remaining: 12, percent: 20 })
  assert.deepEqual(summary.rpd, { used: 25, limit: 500, remaining: 475, percent: 5 })
  // 自訂上限跟 rpd 數的是同一批請求，只是門檻不同
  assert.deepEqual(summary.selfCap, { used: 25, limit: 200, remaining: 175, percent: 13 })
})

test('summarizeUsage：上限是 null 時只回已用量，不自行代入數字', () => {
  const summary = summarizeUsage({ rpm: 4, rpd: 7 }, { rpm: null, rpd: null, tpm: null, selfCap: null })
  assert.deepEqual(summary.rpm, { used: 4, limit: null, remaining: null, percent: null })
  assert.deepEqual(summary.rpd, { used: 7, limit: null, remaining: null, percent: null })
  assert.equal(summary.selfCap.limit, null)
  assert.equal(summary.selfCap.percent, null)
})

test('summarizeUsage：量不到的項目連已用量都回 null', () => {
  // 每分鐘 token 數在現行 schema 下量不到，不得湊一個 0 出來充數
  const summary = summarizeUsage({ rpm: 1, rpd: 1 }, { tpm: 250000 })
  assert.deepEqual(summary.tpm, { used: null, limit: 250000, remaining: null, percent: null })
})

test('summarizeUsage：已用量超過上限時剩餘停在 0，不變成負數', () => {
  const summary = summarizeUsage({ rpd: 250 }, { rpd: 200 })
  assert.equal(summary.rpd.remaining, 0)
  assert.equal(summary.rpd.percent, 125)
})

test('summarizeUsage：token 用量原樣帶出來', () => {
  const summary = summarizeUsage({ rpd: 1, promptTokens: 120, outputTokens: 30 }, {})
  assert.equal(summary.promptTokens, 120)
  assert.equal(summary.outputTokens, 30)
})

test('summarizeUsage：計數缺漏時不丟例外', () => {
  const summary = summarizeUsage(undefined, undefined)
  assert.equal(summary.estimated, true)
  assert.equal(summary.rpm.used, null)
  assert.equal(summary.promptTokens, 0)
})

test('全程沒有任何對外請求被發出', () => {
  assert.equal(networkCalls, 0)
})
