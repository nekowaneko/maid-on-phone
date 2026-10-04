// core/failure.js 的單元測試：六種 kind 的判定順序、撤回旗標、以及台詞組字。
// 台詞與表情一律從 config/fallback-lines.json 讀進來比對，
// 測試檔本身不寫死任何台詞或表情名稱。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FAILURE_KINDS, classifyFailure, shouldRetract, buildFallbackText } from '../core/failure.js'

// 常數定義
const FALLBACK = JSON.parse(readFileSync(new URL('../config/fallback-lines.json', import.meta.url), 'utf8'))
const EMOTION = JSON.parse(readFileSync(new URL('../config/emotion-map.json', import.meta.url), 'utf8'))

// NETWORK_GUARD：純函式層不該有任何對外請求，這裡一併把門關上
let networkCalls = 0
const NETWORK_GUARD = () => {
  networkCalls += 1
  throw new Error('測試期間不得對外發出任何請求')
}
globalThis.fetch = NETWORK_GUARD

test('六種 kind 的名稱與順序固定', () => {
  assert.deepEqual(FAILURE_KINDS, ['blocked', 'quota', 'capped', 'upstream', 'empty', 'unknown'])
})

test('capped：自訂每日上限優先於其他所有訊號', () => {
  assert.deepEqual(classifyFailure({ capped: true }), { kind: 'capped', detail: 'self:daily' })
  // 就算同時帶著其他訊號，capped 仍然排第一
  const both = classifyFailure({ capped: true, status: 429, blockReason: 'SAFETY' })
  assert.equal(both.kind, 'capped')
})

test('blocked：blockReason 有值就是輸入被擋', () => {
  const result = classifyFailure({ status: null, blockReason: 'SAFETY', finishReason: null, sawText: false })
  assert.equal(result.kind, 'blocked')
  assert.equal(result.detail, 'prompt:SAFETY')
})

test('blocked：finishReason 屬於安全類就是輸出被砍', () => {
  for (const reason of ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII']) {
    const result = classifyFailure({ status: null, blockReason: null, finishReason: reason, sawText: true })
    assert.equal(result.kind, 'blocked')
    assert.equal(result.detail, `output:${reason}`)
  }
})

test('blocked：blockReason 排在 finishReason 前面', () => {
  const result = classifyFailure({ blockReason: 'SAFETY', finishReason: 'SPII' })
  assert.equal(result.detail, 'prompt:SAFETY')
})

test('安全類清單以外的 finishReason 不算失敗', () => {
  for (const reason of ['MAX_TOKENS', 'STOP']) {
    const result = classifyFailure({ status: null, blockReason: null, finishReason: reason, sawText: true })
    assert.notEqual(result.kind, 'blocked')
    assert.equal(result.kind, 'unknown')
  }
})

test('quota：HTTP 429', () => {
  assert.deepEqual(classifyFailure({ status: 429, sawText: false }), { kind: 'quota', detail: 'http:429' })
})

test('upstream：HTTP 5xx', () => {
  assert.equal(classifyFailure({ status: 500 }).kind, 'upstream')
  assert.deepEqual(classifyFailure({ status: 503 }), { kind: 'upstream', detail: 'http:503' })
})

test('unknown：其餘非 2xx 的狀態碼', () => {
  assert.deepEqual(classifyFailure({ status: 400 }), { kind: 'unknown', detail: 'http:400' })
  assert.equal(classifyFailure({ status: 404 }).kind, 'unknown')
})

test('empty：沒有狀態碼、也沒有理由，而且一個字都沒收到', () => {
  assert.deepEqual(classifyFailure({ status: null, sawText: false }), { kind: 'empty', detail: 'empty' })
})

test('unknown：什麼訊號都沒有時的最後一格', () => {
  assert.deepEqual(classifyFailure({}), { kind: 'unknown', detail: 'unknown' })
  assert.equal(classifyFailure({ status: 200, sawText: true }).kind, 'unknown')
})

test('shouldRetract：已經送過文字時要撤回', () => {
  assert.equal(shouldRetract({ sawText: true }), true)
})

test('shouldRetract：還沒送過文字時不撤回', () => {
  assert.equal(shouldRetract({ sawText: false }), false)
  assert.equal(shouldRetract({}), false)
  assert.equal(shouldRetract(undefined), false)
})

test('buildFallbackText：六種 kind 都組得出「[表情] 台詞」', () => {
  for (const kind of FAILURE_KINDS) {
    const line = FALLBACK.lines[kind]
    assert.equal(buildFallbackText(FALLBACK, kind), `[${line.emotion}] ${line.text}`)
    // 表情必須是 emotion-map.json 認得的鍵，否則前端會退回預設表情
    assert.ok(Object.hasOwn(EMOTION.emotionMap, line.emotion))
  }
})

test('buildFallbackText：認不得的 kind 退回 defaultKind', () => {
  const fallback = FALLBACK.lines[FALLBACK.defaultKind]
  assert.equal(buildFallbackText(FALLBACK, '這個鍵不存在'), `[${fallback.emotion}] ${fallback.text}`)
})

test('buildFallbackText：設定檔壞掉時回空字串，不丟例外', () => {
  assert.equal(buildFallbackText(undefined, 'quota'), '')
  assert.equal(buildFallbackText({}, 'quota'), '')
})

test('全程沒有任何對外請求被發出', () => {
  assert.equal(networkCalls, 0)
})

// 光看狀態碼分不出「地區不支援」與「請求格式錯誤」——兩者都是 400。
// detail 帶上上游的理由代號，翻 log 時才不必從頭查起。
test('detail 帶上上游的理由代號，光看狀態碼分不出的兩種 400 就分得開了', () => {
  assert.equal(classifyFailure({ status: 400, reason: 'FAILED_PRECONDITION' }).detail, 'http:400/FAILED_PRECONDITION')
  assert.equal(classifyFailure({ status: 400, reason: 'INVALID_ARGUMENT' }).detail, 'http:400/INVALID_ARGUMENT')
  // 沒有代號就只寫狀態碼，不要多出一個空的分隔符
  assert.equal(classifyFailure({ status: 400 }).detail, 'http:400')
  assert.equal(classifyFailure({ status: 400, reason: '' }).detail, 'http:400')
})

test('輸入被擋與輸出被砍的優先序高於狀態碼', () => {
  assert.equal(classifyFailure({ status: 400, blockReason: 'SAFETY' }).kind, 'blocked')
  assert.equal(classifyFailure({ status: 400, finishReason: 'PROHIBITED_CONTENT' }).kind, 'blocked')
  assert.equal(classifyFailure({ status: 400, capped: true }).kind, 'capped')
})
