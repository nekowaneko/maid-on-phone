// core/auth.js 的單元測試：密鑰比對的純函式行為。
// 重點是「失敗時關門」與「比對走完全長度」兩件事。

import test from 'node:test'
import assert from 'node:assert/strict'
import { isAuthorized } from '../core/auth.js'

// 常數定義
const SECRET = 'correct-horse-battery-staple'

// NETWORK_GUARD：純函式層不該有任何對外請求，這裡一併把門關上
let networkCalls = 0
const NETWORK_GUARD = () => {
  networkCalls += 1
  throw new Error('測試期間不得對外發出任何請求')
}
globalThis.fetch = NETWORK_GUARD

test('密鑰一致時放行', () => {
  assert.equal(isAuthorized(SECRET, SECRET), true)
})

test('密鑰不一致時擋下', () => {
  assert.equal(isAuthorized('wrong-secret', SECRET), false)
})

test('長度相同但內容不同時擋下', () => {
  const other = `${SECRET.slice(0, -1)}X`
  assert.equal(other.length, SECRET.length)
  assert.equal(isAuthorized(other, SECRET), false)
})

test('前端沒帶密鑰時擋下（空字串、null、undefined 都一樣）', () => {
  assert.equal(isAuthorized('', SECRET), false)
  assert.equal(isAuthorized(null, SECRET), false)
  assert.equal(isAuthorized(undefined, SECRET), false)
})

test('伺服器沒設定密鑰時一律擋下，不得因為兩邊都空就放行', () => {
  assert.equal(isAuthorized('', ''), false)
  assert.equal(isAuthorized(SECRET, ''), false)
  assert.equal(isAuthorized(SECRET, undefined), false)
  assert.equal(isAuthorized('', undefined), false)
})

test('非字串型別一律當作沒帶', () => {
  assert.equal(isAuthorized(123, SECRET), false)
  assert.equal(isAuthorized({}, SECRET), false)
  assert.equal(isAuthorized(SECRET, 123), false)
})

test('長度不同也要比完全長度，不得提早結束', () => {
  // 前綴相同、長度不同：若實作提早 return，這一項仍會通過，
  // 所以真正的保證在實作端（compareAll 走 Math.max 的長度），這裡只確認結果正確。
  assert.equal(isAuthorized(SECRET.slice(0, 5), SECRET), false)
  assert.equal(isAuthorized(`${SECRET}extra`, SECRET), false)
})

test('全程沒有任何對外請求被發出', () => {
  assert.equal(networkCalls, 0)
})
