// 推播的輔助測試：補規格表沒有逐一列出的邊界，讓突變測試有足夠的斷言可以殺突變。
// 規格本身在 tests/spec/m15/，這支可以自由增修。

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandler } from '../worker/handlers.js'
import { createStore } from '../worker/store.stub.js'
import { createFcmStub } from '../worker/fcm-client.stub.js'
import {
  validatePushPayload,
  newPushId,
  buildFcmMessage,
  isPushConfigured,
  MAX_PUSH_TEXT_LENGTH,
  PUSH_NOT_CONFIGURED_MESSAGE,
  PUSH_FORMAT_MESSAGE,
  PUSH_TOO_LONG_MESSAGE,
  PUSH_FAILED_MESSAGE
} from '../core/push.js'

// 常數定義
const SECRET = 'test-only-secret'
const ORIGIN = 'http://localhost'
const ACCOUNT = { project_id: 'p', client_email: 'e', private_key: 'k' }
const ACCOUNT_TEXT = JSON.stringify(ACCOUNT)

// 全程不得對外連線
globalThis.fetch = () => {
  throw new Error('測試期間不得對外發出任何請求')
}

// 只含推播所需欄位的最小相依
const pushDeps = (pusher, extra = {}) => ({
  secret: SECRET,
  store: createStore({}),
  now: () => 0,
  pusher,
  pushConfig: { serviceAccount: ACCOUNT_TEXT, deviceToken: 'tok' },
  randomText: () => 'r',
  ...extra
})

// 打一次推播端點
const callPush = (deps, method, body) =>
  createHandler(deps)(
    new Request(`${ORIGIN}/api/push`, {
      method,
      headers: { 'x-app-secret': SECRET },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  )

test('訊息常數與規格一致', () => {
  assert.equal(MAX_PUSH_TEXT_LENGTH, 500)
  assert.equal(PUSH_NOT_CONFIGURED_MESSAGE, '尚未設定推播')
  assert.equal(PUSH_FORMAT_MESSAGE, '請求格式不正確：缺少 text 欄位。')
  assert.equal(PUSH_TOO_LONG_MESSAGE, '訊息太長了。')
  assert.equal(PUSH_FAILED_MESSAGE, '推播送出失敗')
})

test('validatePushPayload：非字串、空白、null 主體都是格式錯誤', () => {
  for (const payload of [null, undefined, {}, { text: 1 }, { text: '' }, { text: ' \n\t ' }, { text: ['a'] }]) {
    assert.deepEqual(validatePushPayload(payload), { ok: false, reason: 'format' }, JSON.stringify(payload))
  }
})

test('validatePushPayload：前後空白修剪後回傳，沒給 id 為 null', () => {
  assert.deepEqual(validatePushPayload({ text: '  該喝水了 ' }), { ok: true, text: '該喝水了', id: null })
})

test('validatePushPayload：id 為非空字串才保留，空字串與非字串都當成沒給', () => {
  assert.equal(validatePushPayload({ text: 'a', id: 'abc' }).id, 'abc')
  assert.equal(validatePushPayload({ text: 'a', id: '' }).id, null)
  assert.equal(validatePushPayload({ text: 'a', id: 5 }).id, null)
})

test('validatePushPayload：以字元計長度，500 個表情符號可以、501 個太長', () => {
  assert.equal(validatePushPayload({ text: '😺'.repeat(500) }).ok, true)
  assert.deepEqual(validatePushPayload({ text: '😺'.repeat(501) }), { ok: false, reason: 'too_long' })
})

test('validatePushPayload：長度以修剪後計算', () => {
  assert.equal(validatePushPayload({ text: ` ${'a'.repeat(500)} ` }).ok, true)
})

test('newPushId：時間以 36 進位表示並接上亂數', () => {
  assert.equal(newPushId(36, 'xy'), 'push-10-xy')
  assert.equal(newPushId(0, 'r'), 'push-0-r')
})

test('buildFcmMessage：結構完全等於規格', () => {
  assert.deepEqual(buildFcmMessage('tok', 'i', 't'), {
    message: { token: 'tok', data: { id: 'i', text: 't' }, android: { priority: 'high' } }
  })
})

test('isPushConfigured：三個欄位與推播代碼都要有', () => {
  assert.equal(isPushConfigured(ACCOUNT_TEXT, 'tok'), true)
  assert.equal(isPushConfigured(ACCOUNT_TEXT, ''), false)
  assert.equal(isPushConfigured(ACCOUNT_TEXT, '   '), false)
  assert.equal(isPushConfigured(ACCOUNT_TEXT, undefined), false)
  assert.equal(isPushConfigured(undefined, 'tok'), false)
  assert.equal(isPushConfigured('null', 'tok'), false)
  assert.equal(isPushConfigured('"字串"', 'tok'), false)
  assert.equal(isPushConfigured('123', 'tok'), false)
  // 不是字串的輸入一律不接受，即使轉成字串後剛好是合法的 JSON（陣列會被 JSON.parse 轉成字串）
  assert.equal(isPushConfigured([ACCOUNT_TEXT], 'tok'), false)
  for (const field of Object.keys(ACCOUNT)) {
    assert.equal(isPushConfigured(JSON.stringify({ ...ACCOUNT, [field]: '' }), 'tok'), false, field)
    const { [field]: _removed, ...rest } = ACCOUNT
    assert.equal(isPushConfigured(JSON.stringify(rest), 'tok'), false, field)
  }
})

test('推播端點：非 POST 回 405 且不送出', async () => {
  const stub = createFcmStub()
  const response = await callPush(pushDeps(stub.sendFcm), 'GET')
  assert.equal(response.status, 405)
  assert.equal(stub.callCount(), 0)
})

test('推播端點：格式錯誤優先於未設定（先檢查內容再檢查設定）', async () => {
  const stub = createFcmStub()
  const deps = pushDeps(stub.sendFcm, { pushConfig: { serviceAccount: '', deviceToken: '' } })
  const response = await callPush(deps, 'POST', { text: ' ' })
  assert.equal(response.status, 400)
})

test('推播端點：沒有 pushConfig 時回 503', async () => {
  const stub = createFcmStub()
  const response = await callPush(pushDeps(stub.sendFcm, { pushConfig: undefined }), 'POST', { text: 'a' })
  assert.equal(response.status, 503)
})

test('推播端點：客戶端丟例外時回 502 UNKNOWN，只呼叫一次', async () => {
  let calls = 0
  const pusher = async () => {
    calls += 1
    throw new Error('boom')
  }
  const response = await callPush(pushDeps(pusher), 'POST', { text: 'a' })
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { ok: false, error: '推播送出失敗', code: 'UNKNOWN' })
  assert.equal(calls, 1)
})

test('推播端點：客戶端回失敗但沒有代碼時用 UNKNOWN', async () => {
  const response = await callPush(pushDeps(async () => ({ ok: false, status: 500 })), 'POST', { text: 'a' })
  assert.equal((await response.json()).code, 'UNKNOWN')
})

test('推播端點：回應不含推播代碼與服務帳戶內容', async () => {
  const stub = createFcmStub({ fail: true })
  const text = await (await callPush(pushDeps(stub.sendFcm), 'POST', { text: 'a' })).text()
  assert.ok(!text.includes('tok'))
  assert.ok(!text.includes('client_email'))
})

test('推播端點：沒注入 randomText 時用 randomUUID 前 8 碼', async () => {
  const stub = createFcmStub()
  const response = await callPush(pushDeps(stub.sendFcm, { randomText: undefined }), 'POST', { text: 'a' })
  assert.match((await response.json()).id, /^push-0-[0-9a-f]{8}$/)
})

test('fcm-client.stub：成功時累計訊息名稱，失敗時不記入', async () => {
  const ok = createFcmStub()
  assert.deepEqual(await ok.sendFcm({ a: 1 }), { ok: true, name: 'projects/stub/messages/1' })
  assert.equal(ok.sent.length, 1)
  const bad = createFcmStub({ fail: true })
  assert.deepEqual(await bad.sendFcm({ a: 1 }), { ok: false, status: 404, code: 'UNREGISTERED' })
  assert.equal(bad.sent.length, 0)
  assert.equal(bad.callCount(), 1)
})
