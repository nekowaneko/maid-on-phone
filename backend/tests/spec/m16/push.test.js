// M1.6 規格範例表（docs/M1.6-EXPENSIVE-PLAN.md §4.5）中推播路由的各列，凍結後不得修改。
// 相依全部走 Stub：推播客戶端用 fcm-client.stub.js，全程不得對外連線。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler } from '../../../worker/handlers.js'
import { streamCompletion as stubStream } from '../../../worker/llm-client.stub.js'
import { createStore } from '../../../worker/store.stub.js'
import { createFcmStub } from '../../../worker/fcm-client.stub.js'

// 常數定義
const SECRET = 'test-only-secret'
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

// 推播路由全程不該碰到網路
globalThis.fetch = () => {
  throw new Error('測試期間不得對外發出任何請求')
}

// 組出一份完整的相依
const buildDeps = (stub) => ({
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
  pusher: (message) => stub.sendFcm(message, SERVICE_ACCOUNT),
  pushConfig: { serviceAccount: SERVICE_ACCOUNT, deviceToken: DEVICE_TOKEN },
  randomText: () => 'r1'
})

// 送出一次推播請求
const postPush = (handle, body) =>
  handle(
    new Request(`${ORIGIN}${PUSH_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SECRET_HEADER]: SECRET },
      body: JSON.stringify(body)
    })
  )

test('M16-S01 帶表情標籤的推播送到手機時有編號、去掉方括號的顯示用文字與原文三個欄位', async () => {
  const stub = createFcmStub()
  const handle = createHandler(buildDeps(stub))
  const response = await postPush(handle, { text: '[pout]真拿主人沒辦法。[smile]水記得喝。' })
  assert.equal(response.status, 200)
  assert.equal(stub.sent.length, 1)
  const data = stub.sent[0].message.data
  assert.deepEqual(Object.keys(data).sort(), ['id', 'script', 'text'])
  assert.equal(data.text, '真拿主人沒辦法。水記得喝。')
  assert.equal(data.script, '[pout]真拿主人沒辦法。[smile]水記得喝。')
  assert.equal((await response.json()).id, data.id)
})

test('M16-S02 內容只有標籤沒有台詞時回覆格式錯誤且不送出推播', async () => {
  const stub = createFcmStub()
  const handle = createHandler(buildDeps(stub))
  const response = await postPush(handle, { text: '[smile]' })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: '請求格式不正確：缺少 text 欄位。' })
  assert.equal(stub.sent.length, 0)
})
