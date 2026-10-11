// M4.4 規格範例表（docs/M4.4-EXPENSIVE-PLAN.md §4.6）中 JS 規格測試列（S10、S11），凍結後不得修改。
// S01～S09 為 Kotlin 規格測試（M44SpecTest.kt）；S12 由 verify.sh 的 V77 以 git diff 驗證。
// 這兩列都讀 DrinkSettingsActivity.kt 的原始碼，比對位置與順序。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 常數定義
const SETTINGS_KT = new URL('../../../../app/src/main/java/com/accompany/pet/DrinkSettingsActivity.kt', import.meta.url)
const LABELS_IN_ORDER = ['訂閱名稱', '月費', '每月額度', '入帳金額', '每天詢問時間'] // 開關之後的五個欄位

// 讀原始碼並統一換行（Windows 檔案是 CRLF）
const readSource = () => readFileSync(SETTINGS_KT, 'utf8').replace(/\r\n/g, '\n')

// 取出某個私有函式的本體（從宣告到下一個同層 private fun 之前）
const functionBody = (source, name) => {
  const start = source.indexOf(`private fun ${name}(`)
  assert.ok(start >= 0, `找不到 ${name}`)
  const next = source.indexOf('\n    private fun ', start + 1)
  return source.slice(start, next < 0 ? source.length : next)
}

test('M44-S10 不送開關那一步', () => {
  const source = readSource()
  const body = functionBody(source, 'saveSettings')
  const returnAt = body.indexOf('return@put')
  const callAt = body.indexOf('saveEnabled()')
  assert.ok(returnAt >= 0, 'saveSettings 缺少 return@put')
  assert.ok(callAt > returnAt, 'saveEnabled() 必須出現在 return@put 之後')
  const calls = source.split('\n').filter((line) => line.includes('saveEnabled()') && !line.includes('fun saveEnabled'))
  assert.equal(calls.length, 1, 'saveEnabled() 只能被呼叫一次（在 saveSettings 內）')
})

test('M44-S11 開關、訂閱名稱、月費、每月額度、入帳金額、每天詢問時間', () => {
  const body = functionBody(readSource(), 'buildLayout')
  const switchAt = body.search(/addSwitchCard\(/)
  assert.ok(switchAt >= 0, 'buildLayout 缺少 addSwitchCard(')
  let previous = switchAt
  for (const label of LABELS_IN_ORDER) {
    const at = body.search(new RegExp(`addField\([^\n]*"${label}"`))
    assert.ok(at >= 0, `buildLayout 缺少欄位 ${label}`)
    assert.ok(at > previous, `${label} 的位置必須在前一個欄位之後`)
    previous = at
  }
})
