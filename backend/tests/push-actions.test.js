// M2 推播 actions 欄位（core/push.js 的第 5 個參數）的輔助測試：只有非空字串才加進 data，其餘與 M1.6 逐字相同。
// 可以自由增修。純函式，不連線。

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFcmMessage } from '../core/push.js'

// 常數定義
const TOKEN = 'tok'

// 功能函數定義

test('actions 為非空字串時 data 加上 actions，順序在 script 之後', () => {
  const message = buildFcmMessage(TOKEN, 'id-1', '文字', '[pout]文字', 'resist,speak')
  assert.deepEqual(message, {
    message: {
      token: TOKEN,
      data: { id: 'id-1', text: '文字', script: '[pout]文字', actions: 'resist,speak' },
      android: { priority: 'high' }
    }
  })
  assert.deepEqual(Object.keys(message.message.data), ['id', 'text', 'script', 'actions'])
})

test('沒有 script 也可以只帶 actions', () => {
  assert.deepEqual(buildFcmMessage(TOKEN, 'id-2', '文字', null, 'resist').message.data, { id: 'id-2', text: '文字', actions: 'resist' })
})

test('actions 沒給、空字串或不是字串時，與四個參數的結果逐字相同', () => {
  const plain = JSON.stringify(buildFcmMessage(TOKEN, 'id-3', '文字', '[smile]文字'))
  for (const actions of [undefined, null, '', 0, ['resist'], { a: 1 }]) {
    assert.equal(JSON.stringify(buildFcmMessage(TOKEN, 'id-3', '文字', '[smile]文字', actions)), plain)
  }
  assert.deepEqual(buildFcmMessage(TOKEN, 'id-4', '文字').message.data, { id: 'id-4', text: '文字' })
})
