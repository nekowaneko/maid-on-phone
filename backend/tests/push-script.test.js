// M1.6 推播原文（script 欄位）的輔助測試：補規格表沒有逐一列出的邊界，讓突變測試有足夠的斷言可以殺突變。
// 規格本身在 tests/spec/m16/push.test.js，這支可以自由增修。全程走 Stub，不對外連線。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler } from '../worker/handlers.js'
import { createStore } from '../worker/store.stub.js'
import { buildFcmMessage, PUSH_FORMAT_MESSAGE, PUSH_TOO_LONG_MESSAGE, PUSH_NOT_CONFIGURED_MESSAGE } from '../core/push.js'

// 常數定義
const SECRET = 'test-only-secret'
const ORIGIN = 'http://localhost'
const ACCOUNT_TEXT = JSON.stringify({ project_id: 'p', client_email: 'e', private_key: 'k' })
const EMOTION_CONFIG = JSON.parse(readFileSync(new URL('../config/emotion-map.json', import.meta.url), 'utf8'))

// 全程不得對外連線
globalThis.fetch = () => {
  throw new Error('測試期間不得對外發出任何請求')
}

// 功能函數定義

// 會記下每一則送出訊息的假推播客戶端
const recordingPusher = () => {
  const sent = []
  const pusher = async (message) => {
    sent.push(message)
    return { ok: true, status: 200 }
  }
  return { sent, pusher }
}

// 只含推播所需欄位的最小相依（含表情設定）
const pushDeps = (pusher, extra = {}) => ({
  secret: SECRET,
  store: createStore({}),
  now: () => 0,
  pusher,
  pushConfig: { serviceAccount: ACCOUNT_TEXT, deviceToken: 'tok' },
  randomText: () => 'r',
  emotionConfig: EMOTION_CONFIG,
  ...extra
})

// 打一次推播端點
const callPush = (deps, body) =>
  createHandler(deps)(
    new Request(`${ORIGIN}/api/push`, {
      method: 'POST',
      headers: { 'x-app-secret': SECRET },
      body: JSON.stringify(body)
    })
  )

// 送一則並回傳 { response, sent }
const pushOnce = async (body, extra) => {
  const rec = recordingPusher()
  const response = await callPush(pushDeps(rec.pusher, extra), body)
  return { response, sent: rec.sent }
}

test('buildFcmMessage 沒給第 4 個參數時 data 只有 id、text（與 M1.5 相同）', () => {
  assert.deepEqual(buildFcmMessage('tok', 'a', '你好'), {
    message: { token: 'tok', data: { id: 'a', text: '你好' }, android: { priority: 'high' } }
  })
})

test('buildFcmMessage 第 4 個參數為非空字串時 data 多帶 script', () => {
  assert.deepEqual(buildFcmMessage('tok', 'a', '你好', '[smile]你好').message.data, {
    id: 'a',
    text: '你好',
    script: '[smile]你好'
  })
})

test('buildFcmMessage 第 4 個參數為空字串、null 或非字串時不帶 script', () => {
  for (const script of ['', null, undefined, 3, {}]) {
    const data = buildFcmMessage('tok', 'a', '你好', script).message.data
    assert.deepEqual(Object.keys(data).sort(), ['id', 'text'], `script=${String(script)}`)
  }
})

test('不含標籤的推播 data 只有 id、text，text 為 trim 後原文', async () => {
  const { response, sent } = await pushOnce({ text: '  該喝水了  ' })
  assert.equal(response.status, 200)
  assert.deepEqual(sent[0].message.data, { id: 'push-0-r', text: '該喝水了' })
})

test('不在表情清單裡的標籤也算標籤：剝掉並帶 script', async () => {
  const { sent } = await pushOnce({ text: '[happy]你好' })
  assert.deepEqual(sent[0].message.data, { id: 'push-0-r', text: '你好', script: '[happy]你好' })
})

test('全形括號的標籤一樣剝掉', async () => {
  const { sent } = await pushOnce({ text: '［smile］你好' })
  assert.equal(sent[0].message.data.text, '你好')
  assert.equal(sent[0].message.data.script, '［smile］你好')
})

test('非法標籤（含大寫或數字）原樣保留，視為不含標籤', async () => {
  const { sent } = await pushOnce({ text: '[Smile]你好[1]' })
  assert.deepEqual(sent[0].message.data, { id: 'push-0-r', text: '[Smile]你好[1]' })
})

test('沒閉合的方括號原樣保留，視為不含標籤', async () => {
  const { sent } = await pushOnce({ text: '你好 [smile' })
  assert.deepEqual(sent[0].message.data, { id: 'push-0-r', text: '你好 [smile' })
})

test('剝完標籤後的前後空白會 trim，script 保留 trim 後的原文', async () => {
  const { sent } = await pushOnce({ text: ' [pout] 真是的 [smile] ' })
  assert.deepEqual(sent[0].message.data, { id: 'push-0-r', text: '真是的', script: '[pout] 真是的 [smile]' })
})

test('標籤寫在最後也剝掉', async () => {
  const { sent } = await pushOnce({ text: '晚安[smile]' })
  assert.equal(sent[0].message.data.text, '晚安')
  assert.equal(sent[0].message.data.script, '晚安[smile]')
})

test('有給 id 時原樣保留，script 一併帶上', async () => {
  const { response, sent } = await pushOnce({ text: '[smile]嗨', id: 'mine' })
  assert.deepEqual(sent[0].message.data, { id: 'mine', text: '嗨', script: '[smile]嗨' })
  assert.deepEqual(await response.json(), { ok: true, id: 'mine' })
})

test('只有多個標籤與空白時回 400 格式錯誤且不送出', async () => {
  const { response, sent } = await pushOnce({ text: '[pout] [smile]  ' })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: PUSH_FORMAT_MESSAGE })
  assert.equal(sent.length, 0)
})

test('長度以原文計：含標籤共 501 字回太長，即使剝完不到 500 字', async () => {
  const { response, sent } = await pushOnce({ text: '[smile]' + 'a'.repeat(494) })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: PUSH_TOO_LONG_MESSAGE })
  assert.equal(sent.length, 0)
})

test('長度以原文計：含標籤共 500 字可以送出', async () => {
  const { response, sent } = await pushOnce({ text: '[smile]' + 'a'.repeat(493) })
  assert.equal(response.status, 200)
  assert.equal(sent[0].message.data.text, 'a'.repeat(493))
})

test('只有標籤時先回格式錯誤，不檢查推播是否已設定', async () => {
  const { response } = await pushOnce({ text: '[smile]' }, { pushConfig: {} })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: PUSH_FORMAT_MESSAGE })
})

test('有台詞但推播未設定時回 503，不送出', async () => {
  const { response, sent } = await pushOnce({ text: '[smile]嗨' }, { pushConfig: {} })
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: PUSH_NOT_CONFIGURED_MESSAGE })
  assert.equal(sent.length, 0)
})

test('沒有注入表情設定時一樣能剝標籤（預設表情為 undefined 也不出錯）', async () => {
  const { sent } = await pushOnce({ text: '[smile]嗨' }, { emotionConfig: undefined })
  assert.deepEqual(sent[0].message.data, { id: 'push-0-r', text: '嗨', script: '[smile]嗨' })
})
