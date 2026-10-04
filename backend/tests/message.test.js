// core/message.js 的單元測試：字數怎麼算、什麼時候提醒、什麼時候擋下。
// 限制值一律從 config/message.json 讀，不寫死在測試裡——改設定檔就該直接反映，
// 不必連帶改測試（比照 V34 對背景圖上限的要求）。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { countMessage, describeMessage, isMessageAcceptable } from '../core/message.js'

const SCHEMA = JSON.parse(readFileSync(new URL('../config/message.json', import.meta.url), 'utf8'))
const MAX = SCHEMA.maxChars
const 剛好 = 'あ'.repeat(MAX)
const 超過 = 'あ'.repeat(MAX + 1)

test('依碼點計數，emoji 不會被算成兩個字', () => {
  // '👧' 的 String.length 是 2，使用者看到的卻是一個字
  assert.equal('👧'.length, 2)
  assert.equal(countMessage('👧'), 1)
  assert.equal(countMessage('早安'), 2)
  assert.equal(countMessage(''), 0)
})

test('不是字串一律當成零個字，不會拋例外', () => {
  for (const value of [undefined, null, 123, {}, []]) {
    assert.equal(countMessage(value), 0)
  }
})

test('沒超過上限：不擋、不提醒', () => {
  const state = describeMessage('早安', SCHEMA)
  assert.equal(state.used, 2)
  assert.equal(state.max, MAX)
  assert.equal(state.isOver, false)
  assert.equal(state.isWarning, false)
  assert.equal(state.overBy, 0)
  assert.equal(isMessageAcceptable('早安', SCHEMA), true)
})

test('剛好等於上限：收下，不算超過', () => {
  const state = describeMessage(剛好, SCHEMA)
  assert.equal(state.used, MAX)
  assert.equal(state.isOver, false)
  assert.equal(state.overBy, 0)
  assert.equal(isMessageAcceptable(剛好, SCHEMA), true)
})

test('超過上限：擋下，並算得出超出幾個字', () => {
  const state = describeMessage(超過, SCHEMA)
  assert.equal(state.isOver, true)
  assert.equal(state.overBy, 1)
  assert.equal(state.isWarning, true, '超過上限當然也要提醒')
  assert.equal(isMessageAcceptable(超過, SCHEMA), false)
})

test('到達提醒門檻就開始提醒，門檻由設定檔的 warnAtPercent 決定', () => {
  const warnAt = Math.ceil((MAX * SCHEMA.warnAtPercent) / 100)
  assert.equal(describeMessage('あ'.repeat(warnAt - 1), SCHEMA).isWarning, false)
  assert.equal(describeMessage('あ'.repeat(warnAt), SCHEMA).isWarning, true)
})

test('空字串不收，只有空白也一樣（呼叫端會先 trim）', () => {
  assert.equal(describeMessage('', SCHEMA).isEmpty, true)
  assert.equal(isMessageAcceptable('', SCHEMA), false)
  assert.equal(isMessageAcceptable('   '.trim(), SCHEMA), false)
})

// 設定檔讀不回來時不該把使用者鎖死：寧可不設限，也不要變成什麼都送不出去
test('上限沒設或不合理時視為不設限，照樣收下', () => {
  for (const schema of [undefined, null, {}, { maxChars: 0 }, { maxChars: -1 }, { maxChars: 1.5 }]) {
    const state = describeMessage(超過, schema)
    assert.equal(state.max, null)
    assert.equal(state.isOver, false)
    assert.equal(state.isWarning, false)
    assert.equal(isMessageAcceptable(超過, schema), true)
  }
})
