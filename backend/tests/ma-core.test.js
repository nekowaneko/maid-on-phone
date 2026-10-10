// 盤前均線核心純函式單元測試
// 涵蓋 M4-S01～M4-S06、M4-S16 及輔助純函式功能驗證。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  roundTo,
  averageLast,
  classify,
  computeStock,
  descFor,
  countKinds,
  isTradingDay,
  prevTradingDay,
  buildMaPayload,
  validateWatchInput
} from '../core/ma.js'

const contract = JSON.parse(readFileSync(new URL('../config/ma-contract.json', import.meta.url), 'utf8'))
const lines = JSON.parse(readFileSync(new URL('../config/ma-lines.json', import.meta.url), 'utf8'))

test('M4-S01 遞增收盤價計算為多頭排列 U', () => {
  const closes = Array.from({ length: 60 }, (_, i) => i + 1)
  const result = computeStock(closes, contract)
  assert.equal(result.kind, 'U')
  assert.deepEqual(result.ma, [58, 50.5, 30.5])
  assert.equal(descFor(result.kind, lines), '5 > 20 > 60，三條線依序往上排。')
})

test('M4-S02 遞減收盤價計算為空頭排列 D', () => {
  const closes = Array.from({ length: 60 }, (_, i) => 60 - i)
  const result = computeStock(closes, contract)
  assert.equal(result.kind, 'D')
  assert.deepEqual(result.ma, [3, 10.5, 30.5])
  assert.equal(descFor(result.kind, lines), '60 > 20 > 5，三條線依序往下排。')
})

test('M4-S03 前 40 天 100、中間 15 天 130、最後 5 天 110 計算為轉弱 W', () => {
  const closes = [
    ...Array(40).fill(100),
    ...Array(15).fill(130),
    ...Array(5).fill(110)
  ]
  const result = computeStock(closes, contract)
  assert.equal(result.kind, 'W')
  assert.deepEqual(result.ma, [110, 125, 108.33])
  assert.equal(descFor(result.kind, lines), '5 日線跌破 20 日線，短線轉弱。')
})

test('M4-S04 排列 20 > 60 > 5 為明顯轉弱 V', () => {
  const kind = classify(10, 30, 20, contract)
  assert.equal(kind, 'V')
  assert.equal(descFor(kind, lines), '5 日線跌破 20 日線與 60 日線，短線明顯轉弱。')
})

test('M4-S05 任兩條均線數值相等判定為糾結 T', () => {
  assert.equal(classify(50, 50, 40, contract), 'T')
  assert.equal(classify(50, 40, 50, contract), 'T')
  assert.equal(classify(40, 50, 50, contract), 'T')
  assert.equal(descFor('T', lines), '均線糾結，方向未明。')
})

test('M4-S06 資料未滿 60 筆判定為資料不足 N', () => {
  const closes = Array(40).fill(50)
  const result = computeStock(closes, contract)
  assert.equal(result.kind, 'N')
  assert.equal(result.ma, null)
  assert.equal(descFor(result.kind, lines), '上市未滿 60 個交易日，資料不足。')
})

test('M4-S16 六種由高到低排列對應正確種類與描述', () => {
  // 5 > 20 > 60 -> U
  assert.equal(classify(30, 20, 10, contract), 'U')
  // 60 > 20 > 5 -> D
  assert.equal(classify(10, 20, 30, contract), 'D')
  // 20 > 5 > 60 -> W
  assert.equal(classify(20, 30, 10, contract), 'W')
  // 20 > 60 > 5 -> V
  assert.equal(classify(10, 30, 20, contract), 'V')
  // 5 > 60 > 20 -> S
  const kindS = classify(30, 10, 20, contract)
  assert.equal(kindS, 'S')
  assert.equal(descFor(kindS, lines), '5 日線站上 20 日線與 60 日線，20 日線仍在最下，短線轉強。')
  // 60 > 5 > 20 -> B
  const kindB = classify(20, 10, 30, contract)
  assert.equal(kindB, 'B')
  assert.equal(descFor(kindB, lines), '5 日線站上 20 日線，仍在 60 日線下方，築底回升。')
})

test('roundTo 與 averageLast 計算精度與空值處理', () => {
  assert.equal(roundTo(108.333333, 2), 108.33)
  assert.equal(roundTo(50.5, 2), 50.5)
  assert.equal(roundTo(0, 2), 0)
  assert.equal(averageLast([10, 20, 30], 3), 20)
  assert.equal(averageLast([10, 20], 3), null)
  assert.equal(averageLast([], 1), null)
})

test('countKinds 只計入有效 kind 且正確分群', () => {
  const items = [
    { code: '2330', kind: 'U' },
    { code: '2454', kind: 'D' },
    { code: '2317', kind: 'W' },
    { code: '2412', kind: 'T' },
    { code: '2603', kind: 'N' },
    { code: '9999', pending: true },
    { code: '8888', failed: true },
    { code: '7777' }
  ]
  const counts = countKinds(items)
  assert.deepEqual(counts, { u: 1, d: 1, m: 3 })
})

test('isTradingDay 與 prevTradingDay 假日與交易日推算', () => {
  const closed = ['2026-10-09', '2026-10-10'] // 假設 10/09 放假，10/10 是週六
  // 2026-10-10 週六
  assert.equal(isTradingDay('2026-10-10', closed), false)
  // 2026-10-11 週日
  assert.equal(isTradingDay('2026-10-11', closed), false)
  // 2026-10-09 休市日
  assert.equal(isTradingDay('2026-10-09', closed), false)
  // 2026-10-08 週四 交易日
  assert.equal(isTradingDay('2026-10-08', closed), true)

  // 從 2026-10-12（週一）往前推最近交易日為 2026-10-08
  assert.equal(prevTradingDay('2026-10-12', closed), '2026-10-08')

  // 若連續 16 天皆非交易日應丟例外
  const allClosed = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)
  assert.throws(() => prevTradingDay('2026-10-20', allClosed), /NO_PREV_TRADING_DAY/)
})

test('buildMaPayload 產出維持固定鍵值順序', () => {
  const jsonStr = buildMaPayload('2026-10-10', '2026-10-08', { u: 3, d: 2, m: 1 }, 'ok')
  assert.equal(jsonStr, '{"date":"2026-10-10","asOf":"2026-10-08","u":3,"d":2,"m":1,"status":"ok"}')
})

test('validateWatchInput 完整驗證各種錯誤與通過情形', () => {
  const rows = [
    { code: '2330', name: '台積電' },
    { code: '2454', name: '聯發科' },
    { code: '2412', name: '中華電' }
  ]
  const active = ['2330']

  // 格式錯誤（空字串或過長）
  assert.deepEqual(validateWatchInput('', rows, active, 10, contract), { ok: false, error: 'format' })
  assert.deepEqual(validateWatchInput('   ', rows, active, 10, contract), { ok: false, error: 'format' })
  assert.deepEqual(validateWatchInput('A'.repeat(45), rows, active, 10, contract), { ok: false, error: 'format' })

  // 查無標的
  assert.deepEqual(validateWatchInput('9999', rows, active, 10, contract), { ok: false, error: 'notFound' })
  assert.deepEqual(validateWatchInput('鴻海', rows, active, 10, contract), { ok: false, error: 'notFound' })

  // 重複追蹤
  assert.deepEqual(validateWatchInput('2330', rows, active, 10, contract), { ok: false, error: 'duplicate', code: '2330', name: '台積電' })
  assert.deepEqual(validateWatchInput('台積電', rows, active, 10, contract), { ok: false, error: 'duplicate', code: '2330', name: '台積電' })

  // 超過上限
  assert.deepEqual(validateWatchInput('2412', rows, ['2330'], 1, contract), { ok: false, error: 'limit', code: '2412', name: '中華電' })

  // 成功（代號匹配）
  assert.deepEqual(validateWatchInput('2412', rows, active, 10, contract), { ok: true, code: '2412', name: '中華電' })
  // 成功（名稱匹配）
  assert.deepEqual(validateWatchInput('聯發科', rows, active, 10, contract), { ok: true, code: '2454', name: '聯發科' })
})
