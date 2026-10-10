// M4 追加的規格範例列 M4-S18～S22（突變測試建議列，使用者 2026-10-10 採用），凍結後不得修改。
// 全部呼叫 core/ma.js 的純函式，不需要任何 Stub。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { averageLast, computeStock, countKinds, prevTradingDay, validateWatchInput, buildMaPayload } from '../../../core/ma.js'

// 常數定義
const DAY_MS = 24 * 60 * 60 * 1000
const readConfig = (name) => readFileSync(new URL(`../../../config/${name}`, import.meta.url), 'utf8')
const CONTRACT = JSON.parse(readConfig('ma-contract.json'))

// 功能函數定義

// 基準日往前 offset 天的日期
const daysBefore = (baseKey, offset) => new Date(Date.parse(`${baseKey}T00:00:00Z`) - offset * DAY_MS).toISOString().slice(0, 10)

test('M4-S18 加入標的的輸入長度邊界：1 字與 40 字不是格式錯誤，41 字與空白才是', () => {
  const longName = '長'.repeat(40)
  const rows = [
    { code: '2330', name: '台積電' },
    { code: '9', name: '九' },
    { code: '9999', name: longName }
  ]
  assert.deepEqual(validateWatchInput('九', rows, [], 10, CONTRACT), { ok: true, code: '9', name: '九' })
  assert.deepEqual(validateWatchInput(longName, rows, [], 10, CONTRACT), { ok: true, code: '9999', name: longName })
  assert.deepEqual(validateWatchInput('字', rows, [], 10, CONTRACT), { ok: false, error: 'notFound' })
  assert.deepEqual(validateWatchInput('7'.repeat(40), rows, [], 10, CONTRACT), { ok: false, error: 'notFound' })
  assert.deepEqual(validateWatchInput('7'.repeat(41), rows, [], 10, CONTRACT), { ok: false, error: 'format' })
  assert.deepEqual(validateWatchInput('', rows, [], 10, CONTRACT), { ok: false, error: 'format' })
  assert.deepEqual(validateWatchInput('   ', rows, [], 10, CONTRACT), { ok: false, error: 'format' })
  assert.deepEqual(validateWatchInput(null, rows, [], 10, CONTRACT), { ok: false, error: 'format' })
  assert.deepEqual(validateWatchInput('  2330  ', rows, [], 10, CONTRACT), { ok: true, code: '2330', name: '台積電' })
})

test('M4-S19 往前找前一個交易日：連續休市剛好 15 天找得到，16 天丟錯', () => {
  const base = '2026-10-30' // 星期五；往前 15 天是 2026-10-15（星期四）
  const closed14 = Array.from({ length: 14 }, (_, i) => daysBefore(base, i + 1))
  assert.equal(prevTradingDay(base, closed14), '2026-10-15')
  const closed15 = Array.from({ length: 15 }, (_, i) => daysBefore(base, i + 1))
  assert.throws(() => prevTradingDay(base, closed15), { message: 'NO_PREV_TRADING_DAY' })
  // 一般情況：星期一的前一個交易日是上週五；中間有休市日就再往前
  assert.equal(prevTradingDay('2026-10-12', []), '2026-10-09')
  assert.equal(prevTradingDay('2026-10-12', ['2026-10-09']), '2026-10-08')
})

test('M4-S20 檔數統計：剛加入尚未納入與這檔資料沒拿到的項目都不計入', () => {
  const items = [
    { code: 'a', kind: 'U' },
    { code: 'b', kind: 'D' },
    { code: 'c', kind: 'W' },
    { code: 'd', kind: 'U', pending: true },
    { code: 'e', kind: 'D', failed: true },
    { code: 'f', pending: true },
    { code: 'g', failed: true },
    { code: 'h' },
    null
  ]
  assert.deepEqual(countKinds(items), { u: 1, d: 1, m: 1 })
  assert.deepEqual(countKinds([]), { u: 0, d: 0, m: 0 })
  assert.deepEqual(countKinds(), { u: 0, d: 0, m: 0 })
})

test('M4-S21 收盤價不合格：平均回傳 null，整檔算資料不足，不丟例外也不出現 NaN', () => {
  assert.equal(averageLast([1, 2, 3], 0), null)
  assert.equal(averageLast([1, 2, 3], -1), null)
  assert.equal(averageLast([1, 2], 3), null)
  assert.equal(averageLast('abc', 1), null)
  assert.equal(averageLast([1, 'x', 3], 3), null)
  assert.equal(averageLast([1, 2, 3], 3), 2)
  const bad = Array.from({ length: 59 }, (_, i) => i + 1).concat(['x'])
  assert.deepEqual(computeStock(bad, CONTRACT), { kind: 'N', ma: null })
  assert.deepEqual(computeStock(null, CONTRACT), { kind: 'N', ma: null })
  assert.deepEqual(computeStock(undefined, CONTRACT), { kind: 'N', ma: null })
})

test('M4-S22 找不到前一個交易日的錯誤訊息固定，推播 ma 欄位缺值時填空字串與 0', () => {
  const everyDay = Array.from({ length: 20 }, (_, i) => daysBefore('2026-10-14', i + 1))
  assert.throws(() => prevTradingDay('2026-10-14', everyDay), (error) => error instanceof Error && error.message === 'NO_PREV_TRADING_DAY')
  assert.deepEqual(JSON.parse(buildMaPayload('2026-10-14', '2026-10-13', { u: 1, d: 2, m: 3 }, 'ok')), { date: '2026-10-14', asOf: '2026-10-13', u: 1, d: 2, m: 3, status: 'ok' })
  const empty = buildMaPayload(undefined, undefined, undefined, undefined)
  assert.deepEqual(JSON.parse(empty), { date: '', asOf: '', u: 0, d: 0, m: 0, status: '' })
  assert.deepEqual(Object.keys(JSON.parse(empty)), CONTRACT.push.keys)
})
