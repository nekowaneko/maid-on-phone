// M1.5 規格範例表（docs/M1.5-EXPENSIVE-PLAN.md §4.5）中推播路由的各列，凍結後不得修改。
// 相依全部走 Stub：推播客戶端用 fcm-client.stub.js，全程不得對外連線。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler } from '../../../worker/handlers.js'
import { streamCompletion as stubStream } from '../../../worker/llm-client.stub.js'
import { createStore } from '../../../worker/store.stub.js'
import { createFcmStub } from '../../../worker/fcm-client.stub.js'
import { PUSH_FORMAT_MESSAGE } from '../../../core/push.js'

// 常數定義
const SECRET = 'test-only-secret'
const WRONG_SECRET = 'test-only-secretX'
const SECRET_HEADER = 'x-app-secret'
const ORIGIN = 'http://localhost'
const PUSH_PATH = '/api/push'
const FIXED_NOW = 1800000000000 // 固定時間，不讀系統時鐘
const DEVICE_TOKEN = 'test-only-device-token'
const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'test-only-project',
  client_email: 'test-only@test-only-project.iam.gserviceaccount.example',
  private_key: 'test-only-private-key'
})
const readConfig = (name) => readFileSync(new URL(`../../../config/${name}`, import.meta.url), 'utf8')

// NETWORK_GUARD：推播路由全程不該碰到網路，走的是 Stub 客戶端
let networkCalls = 0
const NETWORK_GUARD = () => {
  networkCalls += 1
  throw new Error('測試期間不得對外發出任何請求')
}
globalThis.fetch = NETWORK_GUARD

// 組出一份完整的相依；推播相關欄位可由各測試覆寫
const buildDeps = ({ stub, serviceAccount = SERVICE_ACCOUNT, deviceToken = DEVICE_TOKEN, randomTexts = ['r1'] }) => {
  let index = 0
  return {
    emotionConfig: JSON.parse(readConfig('emotion-map.json')),
    gapConfig: JSON.parse(readConfig('time-gap-tiers.json')),
    fallbackConfig: JSON.parse(readConfig('fallback-lines.json')),
    quotaConfig: JSON.parse(readConfig('quota.json')),
    personaSchema: JSON.parse(readConfig('persona-schema.json')),
    messageSchema: JSON.parse(readConfig('message.json')),
    personaText: readConfig('persona.md'),
    templateText: readConfig('prompt-template.md'),
    secret: SECRET,
    store: createStore({}),
    streamer: (messages) => stubStream(messages, {}),
    now: () => FIXED_NOW,
    pusher: (message) => stub.sendFcm(message, serviceAccount),
    pushConfig: { serviceAccount, deviceToken },
    randomText: () => randomTexts[index++ % randomTexts.length]
  }
}

// 送出一次推播請求；body 為字串時原樣送出（用來測不是 JSON 的主體）
const postPush = (handle, body, headers = { [SECRET_HEADER]: SECRET }) =>
  handle(
    new Request(`${ORIGIN}${PUSH_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  )

test('M15-S01 沒帶存取密鑰或密鑰錯誤時回覆未授權且不送出推播', async () => {
  const stub = createFcmStub()
  const handle = createHandler(buildDeps({ stub }))
  const missing = await postPush(handle, { text: '該喝水了' }, {})
  const wrong = await postPush(handle, { text: '該喝水了' }, { [SECRET_HEADER]: WRONG_SECRET })
  assert.equal(missing.status, 401)
  assert.equal(wrong.status, 401)
  assert.deepEqual(await missing.json(), { error: '未授權。' })
  assert.deepEqual(await wrong.json(), { error: '未授權。' })
  assert.equal(stub.sent.length, 0)
})

test('M15-S02 還沒設定推播代碼或服務帳戶時回覆尚未設定推播且不送出', async () => {
  const cases = [
    { deviceToken: '' },
    { serviceAccount: '' },
    { serviceAccount: '這不是 JSON' }
  ]
  for (const overrides of cases) {
    const stub = createFcmStub()
    const handle = createHandler(buildDeps({ stub, ...overrides }))
    const response = await postPush(handle, { text: '該喝水了' })
    assert.equal(response.status, 503, JSON.stringify(overrides))
    assert.deepEqual(await response.json(), { error: '尚未設定推播' })
    assert.equal(stub.sent.length, 0)
    assert.equal(stub.callCount(), 0)
  }
})

test('M15-S07 送出的推播只含 id 與 text、沒有通知欄位、優先順序為高，回覆成功與編號', async () => {
  const stub = createFcmStub()
  const handle = createHandler(buildDeps({ stub }))
  const response = await postPush(handle, { text: '該喝水了' })
  assert.equal(stub.sent.length, 1)
  const message = stub.sent[0].message
  assert.deepEqual(Object.keys(message.data).sort(), ['id', 'text'])
  assert.equal(message.data.text, '該喝水了')
  assert.equal(message.notification, undefined)
  assert.equal(message.android.priority, 'high')
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.id, message.data.id)
})

test('M15-S08 沒指定編號連送兩次，兩次各自產生不同的新編號', async () => {
  const stub = createFcmStub()
  const handle = createHandler(buildDeps({ stub, randomTexts: ['aaaa1111', 'bbbb2222'] }))
  const first = await (await postPush(handle, { text: '該喝水了' })).json()
  const second = await (await postPush(handle, { text: '該喝水了' })).json()
  assert.notEqual(first.id, second.id)
  assert.ok(first.id.startsWith('push-'))
  assert.ok(second.id.startsWith('push-'))
})

test('M15-S09 指定編號 abc 時推播的 id 就是 abc', async () => {
  const stub = createFcmStub()
  const handle = createHandler(buildDeps({ stub }))
  const response = await postPush(handle, { text: '該喝水了', id: 'abc' })
  assert.equal(stub.sent[0].message.data.id, 'abc')
  assert.equal((await response.json()).id, 'abc')
})

test('M15-S10 內容空白、缺少內容或主體不是 JSON 時回覆格式錯誤且不送出', async () => {
  const stub = createFcmStub()
  const handle = createHandler(buildDeps({ stub }))
  for (const body of [{ text: '   ' }, {}, '這不是 JSON']) {
    const response = await postPush(handle, body)
    assert.equal(response.status, 400, JSON.stringify(body))
    assert.deepEqual(await response.json(), { error: PUSH_FORMAT_MESSAGE })
  }
  assert.equal(stub.sent.length, 0)
})

test('M15-S11 內容超過 500 字時回覆訊息太長了且不送出，剛好 500 字可以送出', async () => {
  const stub = createFcmStub()
  const handle = createHandler(buildDeps({ stub }))
  const tooLong = await postPush(handle, { text: '喝'.repeat(501) })
  assert.equal(tooLong.status, 400)
  assert.deepEqual(await tooLong.json(), { error: '訊息太長了。' })
  assert.equal(stub.sent.length, 0)
  const exact = await postPush(handle, { text: '喝'.repeat(500) })
  assert.equal(exact.status, 200)
})

test('M15-S12 Google 回覆錯誤時回覆失敗並附上錯誤代碼且不自動重試', async () => {
  const stub = createFcmStub({ fail: true })
  const handle = createHandler(buildDeps({ stub }))
  const response = await postPush(handle, { text: '該喝水了' })
  assert.equal(response.status, 502)
  const body = await response.json()
  assert.equal(body.ok, false)
  assert.equal(body.code, 'UNREGISTERED')
  assert.equal(stub.callCount(), 1)
  assert.equal(networkCalls, 0)
})
