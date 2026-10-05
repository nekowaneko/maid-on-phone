// 照抄自 cost_down（戒飲存）commit 9fc08b2 的 tests/ledger.test.js，只改了 import 路徑；不得修改
// 雙帳統計測試（含雙帳分離與防灌水）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  moneySpentInMonth, kcalInMonth, treatedInMonth, drankCupsInMonth, resistCupsInMonth
} from '../core/ledger.js'

// ===== 常數定義 =====

// 斷網樁：測試期間任何真實網路請求都直接拋錯（驗收項 V10）
globalThis.fetch = () => { throw new Error('驗收期間禁止發出真實網路請求') }

const MONTH = '2026-08'

const logs = [
  { date: '2026-08-01', slot: 'lunch',     type: 'drink',  drinkId: 1, price: 65, kcal: 650, source: 'model' },
  { date: '2026-08-02', slot: 'afternoon', type: 'drink',  drinkId: 2, price: 35, kcal: 180, source: 'model' },
  { date: '2026-08-03', slot: 'dinner',    type: 'drink',  drinkId: 1, price: 0,  kcal: 650, source: 'model' },  // 別人請客
  { date: '2026-08-04', slot: 'morning',   type: 'drink',  drinkId: 1, price: 0,  kcal: 570, source: 'ai' },     // 別人請客
  { date: '2026-08-05', slot: 'afternoon', type: 'resist' },
  { date: '2026-08-06', slot: 'latenight', type: 'resist' },
  { date: '2026-07-31', slot: 'lunch',     type: 'drink',  drinkId: 1, price: 65, kcal: 650, source: 'model' }   // 上個月
]

// ===== 測試 =====

test('[V16] price === 0 的紀錄不計入省錢帳', () => {
  assert.equal(moneySpentInMonth(logs, MONTH), 100)  // 65 + 35，兩筆請客不計
  const onlyTreated = logs.filter((log) => log.price === 0)
  assert.equal(moneySpentInMonth(onlyTreated, MONTH), 0)
})

test('[V16] price === 0 的紀錄仍計入熱量帳', () => {
  assert.equal(kcalInMonth(logs, MONTH), 650 + 180 + 650 + 570)
  const onlyTreated = logs.filter((log) => log.price === 0)
  assert.equal(kcalInMonth(onlyTreated, MONTH), 1220)
  assert.ok(kcalInMonth(onlyTreated, MONTH) > 0, '請客的熱量被漏算了，這正是要修的自欺問題')
})

test('[V16] 雙向斷言：同一批請客紀錄在兩本帳上的結果相反', () => {
  const treatedOnly = [{ date: '2026-08-10', type: 'drink', drinkId: 1, price: 0, kcal: 500 }]
  assert.equal(moneySpentInMonth(treatedOnly, MONTH), 0)
  assert.equal(kcalInMonth(treatedOnly, MONTH), 500)
})

test('treatedInMonth 單獨統計請客的杯數與熱量（自欺缺口）', () => {
  assert.deepEqual(treatedInMonth(logs, MONTH), { cups: 2, kcal: 1220 })
  assert.deepEqual(treatedInMonth(logs, '2026-07'), { cups: 0, kcal: 0 })
})

test('[K1] drankCupsInMonth 把請客的杯數也算進去（防灌水優先）', () => {
  assert.equal(drankCupsInMonth(logs, MONTH), 4)  // 含兩筆請客
  assert.ok(
    drankCupsInMonth(logs, MONTH) > logs.filter((l) => l.price > 0 && l.date.startsWith(MONTH)).length,
    '請客的紀錄被排除在飲用杯數之外，防灌水機制會被繞過'
  )
})

test('[K1] 防灌水公式：喝了會吃掉忍住的入帳額度，含請客的杯數', () => {
  const monthlyQuota = 5
  const savedCups = Math.min(
    resistCupsInMonth(logs, MONTH),
    Math.max(0, monthlyQuota - drankCupsInMonth(logs, MONTH))
  )
  assert.equal(resistCupsInMonth(logs, MONTH), 2)
  assert.equal(savedCups, 1)  // 基準 5 − 已喝 4 ＝ 只剩 1 杯可入帳

  // 若錯把請客排除在飲用杯數外，可入帳杯數會變成 2，等於憑空多賺一杯
  const wrongDrank = logs.filter((l) => l.type === 'drink' && l.price > 0 && l.date.startsWith(MONTH)).length
  const wrongSaved = Math.min(resistCupsInMonth(logs, MONTH), Math.max(0, monthlyQuota - wrongDrank))
  assert.notEqual(wrongSaved, savedCups)
})

test('月份切分正確，不會把別的月份算進來', () => {
  assert.equal(moneySpentInMonth(logs, '2026-07'), 65)
  assert.equal(kcalInMonth(logs, '2026-07'), 650)
  assert.equal(drankCupsInMonth(logs, '2026-07'), 1)
  assert.equal(drankCupsInMonth(logs, '2026-09'), 0)
})

test('忍住紀錄不計入任何一本帳', () => {
  const resistOnly = [{ date: '2026-08-01', slot: 'lunch', type: 'resist' }]
  assert.equal(moneySpentInMonth(resistOnly, MONTH), 0)
  assert.equal(kcalInMonth(resistOnly, MONTH), 0)
  assert.equal(drankCupsInMonth(resistOnly, MONTH), 0)
  assert.equal(resistCupsInMonth(resistOnly, MONTH), 1)
})

test('相容 v1 未遷移資料：無 type 但有 drinkId 者視為喝了', () => {
  const v1Logs = [{ date: '2026-08-01', drinkId: 1 }]
  assert.equal(drankCupsInMonth(v1Logs, MONTH), 1)
  assert.equal(kcalInMonth(v1Logs, MONTH), 0)  // v1 沒有 kcal 欄位，遷移後才會有值
})

test('空資料與非陣列輸入不拋錯', () => {
  assert.equal(moneySpentInMonth([], MONTH), 0)
  assert.equal(kcalInMonth(undefined, MONTH), 0)
  assert.equal(drankCupsInMonth(null, MONTH), 0)
  assert.equal(resistCupsInMonth(undefined, MONTH), 0)
  assert.deepEqual(treatedInMonth(undefined, MONTH), { cups: 0, kcal: 0 })
})

test('price 或 kcal 為字串或缺漏時不會汙染統計', () => {
  const messy = [
    { date: '2026-08-01', type: 'drink', drinkId: 1, price: '65', kcal: '650' },
    { date: '2026-08-02', type: 'drink', drinkId: 1 }
  ]
  assert.equal(moneySpentInMonth(messy, MONTH), 65)
  assert.equal(kcalInMonth(messy, MONTH), 650)
  assert.equal(drankCupsInMonth(messy, MONTH), 2)
})
