// 路由層的授權行為（架構約束 A8）：/api/* 一律要密鑰，根路徑與其餘路徑不受影響。
//
// 這支測的是 worker/handlers.js 的 createHandler，不是 worker/index.js。
// index.js 用 wrangler 的 Text 模組規則 import 了 .md，在 Node 下載不動
// （見 DECISIONS.md D11），所以路由層才被抽成可注入的一層。
// 相依全部走 Stub：不需要 D1、不需要 wrangler、不消耗任何額度。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler } from '../worker/handlers.js'
import { streamCompletion as stubStream } from '../worker/llm-client.stub.js'
import { createStore } from '../worker/store.stub.js'

// 常數定義
const SECRET = 'test-only-secret'
const WRONG_SECRET = 'test-only-secretX'
const SECRET_HEADER = 'x-app-secret'
const ORIGIN = 'http://localhost'
const CHAT_PATH = '/api/chat'
const PERSONA_PATH = '/api/persona'
const UNAUTHORIZED_BODY = { error: '未授權。' }
const readConfig = (name) => readFileSync(new URL(`../config/${name}`, import.meta.url), 'utf8')

// NETWORK_GUARD：路由層全程不該碰到網路，走的是 Stub 客戶端
let networkCalls = 0
const NETWORK_GUARD = () => {
  networkCalls += 1
  throw new Error('測試期間不得對外發出任何請求')
}
globalThis.fetch = NETWORK_GUARD

// 組出一份最小但完整的相依，設定檔直接從 config/ 讀進來
const buildDeps = () => ({
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
  streamer: (messages) => stubStream(messages, {})
})

const handle = createHandler(buildDeps())

// 送出一次對話請求，headers 由各測試自行決定要不要帶密鑰
const postChat = (headers) =>
  handle(
    new Request(`${ORIGIN}${CHAT_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ message: '早安', history: [], minutesSinceLastSeen: 0 })
    })
  )

// 帶著正確密鑰、自訂 message 內容打一次對話端點
const chatWithMessage = (message) =>
  handle(
    new Request(`${ORIGIN}${CHAT_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SECRET_HEADER]: SECRET },
      body: JSON.stringify({ message, history: [], minutesSinceLastSeen: 0 })
    })
  )

// 帶著正確密鑰打小檔案端點；body 只有 PUT 用得到
const personaBody = (method, payload) =>
  new Request(`${ORIGIN}${PERSONA_PATH}`, {
    method,
    headers: { 'content-type': 'application/json', [SECRET_HEADER]: SECRET },
    body: payload === undefined ? undefined : JSON.stringify(payload)
  })

// 用共用的處理函式打一次小檔案端點
const personaRequest = (method, payload) => handle(personaBody(method, payload))

test('未帶密鑰打 /api/chat 回 401', async () => {
  const response = await postChat({})
  assert.equal(response.status, 401)
})

test('帶錯密鑰打 /api/chat 回 401', async () => {
  const response = await postChat({ [SECRET_HEADER]: WRONG_SECRET })
  assert.equal(response.status, 401)
})

test('401 的主體只有一句制式訊息，不含任何內部細節', async () => {
  const missing = await (await postChat({})).json()
  const wrong = await (await postChat({ [SECRET_HEADER]: WRONG_SECRET })).json()
  // 沒帶與帶錯的回應必須一模一樣，否則可以拿它來判斷密鑰對了幾分
  assert.deepEqual(missing, UNAUTHORIZED_BODY)
  assert.deepEqual(wrong, UNAUTHORIZED_BODY)
  assert.deepEqual(Object.keys(missing), ['error'])
  const text = JSON.stringify(missing)
  assert.ok(!text.includes(SECRET))
  assert.ok(!text.includes(SECRET_HEADER))
  assert.ok(!text.includes('stack'))
})

test('帶對密鑰打 /api/chat 才會拿到 SSE 串流', async () => {
  const response = await postChat({ [SECRET_HEADER]: SECRET })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/event-stream/)
  const body = await response.text()
  assert.ok(body.includes('"type":"delta"'))
  assert.ok(body.includes('"type":"done"'))
})

test('根路徑不受授權影響，沒帶密鑰也要導向入口頁', async () => {
  const response = await handle(new Request(`${ORIGIN}/`))
  assert.equal(response.status, 302)
  assert.match(response.headers.get('location'), /\/web\/index\.html$/)
})

test('非 /api/ 的其他路徑不會回 401', async () => {
  const response = await handle(new Request(`${ORIGIN}/web/style.css`))
  assert.notEqual(response.status, 401)
  assert.equal(response.status, 404)
})

test('預檢請求不帶自訂標頭也要放行，且允許 x-app-secret', async () => {
  const response = await handle(new Request(`${ORIGIN}${CHAT_PATH}`, { method: 'OPTIONS' }))
  assert.equal(response.status, 204)
  assert.match(response.headers.get('access-control-allow-headers'), /x-app-secret/)
})

test('/api/ 底下的未知路徑同樣要先過授權', async () => {
  const blocked = await handle(new Request(`${ORIGIN}/api/whatever`))
  assert.equal(blocked.status, 401)
  const allowed = await handle(new Request(`${ORIGIN}/api/whatever`, { headers: { [SECRET_HEADER]: SECRET } }))
  assert.equal(allowed.status, 404)
})

test('伺服器沒設定密鑰時一律關門，不得變成人人都進得來', async () => {
  const openHandle = createHandler({ ...buildDeps(), secret: undefined })
  const response = await openHandle(new Request(`${ORIGIN}${CHAT_PATH}`, { method: 'POST', body: '{}' }))
  assert.equal(response.status, 401)
})

test('小檔案端點同樣要先過授權', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = await handle(new Request(`${ORIGIN}${PERSONA_PATH}`, { method, body: method === 'PUT' ? '{}' : undefined }))
    assert.equal(response.status, 401)
  }
})

test('GET 小檔案：沒存過時回預設值並標明 isDefault', async () => {
  const body = await (await personaRequest('GET')).json()
  assert.equal(body.isDefault, true)
  assert.equal(body.text, readConfig('persona.md'))
  assert.equal(body.updatedAt, null)
})

test('PUT 小檔案：驗證通過就存起來，之後讀到的是新的那一份', async () => {
  const deps = buildDeps()
  const own = createHandler(deps)
  const text = `${JSON.parse(readConfig('persona-schema.json')).requiredSections.join('\n\n')}\n\n${'喵'.repeat(200)}`
  const saved = await own(personaBody('PUT', { text }))
  assert.equal(saved.status, 200)
  const body = await (await own(personaBody('GET'))).json()
  assert.equal(body.isDefault, false)
  assert.equal(body.text, text)
  assert.equal(typeof body.updatedAt, 'string')
})

test('PUT 小檔案：驗證不過回 400 與繁體中文的 errors 陣列，且不寫進去', async () => {
  const deps = buildDeps()
  const own = createHandler(deps)
  const response = await own(personaBody('PUT', { text: '太短了' }))
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.ok(Array.isArray(body.errors))
  assert.ok(body.errors.length > 0)
  assert.match(body.errors[0], /[一-鿿]/)
  // 存檔失敗就不該留下任何東西
  assert.equal(await deps.store.readSetting('persona'), null)
})

test('DELETE 小檔案：一鍵還原之後回到 config/persona.md', async () => {
  const own = createHandler(buildDeps())
  const text = `${JSON.parse(readConfig('persona-schema.json')).requiredSections.join('\n\n')}\n\n${'喵'.repeat(200)}`
  await own(personaBody('PUT', { text }))
  const reset = await own(personaBody('DELETE'))
  assert.equal(reset.status, 200)
  const body = await (await own(personaBody('GET'))).json()
  assert.equal(body.isDefault, true)
  assert.equal(body.text, readConfig('persona.md'))
})

test('小檔案端點不接受的方法回 405，不是 404', async () => {
  const response = await personaRequest('POST')
  assert.equal(response.status, 405)
})

test('全程沒有任何對外請求被發出', () => {
  assert.equal(networkCalls, 0)
})

// 輸入框改成可以換行之後，「只有空白與換行」變得很容易送出，
// 而它對模型來說跟空訊息沒有兩樣。前端會先修剪，但路由層不能倚賴前端。
test('只有空白與換行的訊息一律擋下，不送給模型', async () => {
  for (const message of ['\n\n', '   ', ' \r\n \t ', '\n \n']) {
    const response = await chatWithMessage(message)
    assert.equal(response.status, 400, JSON.stringify(message) + ' 應該被擋下')
  }
})

test('前後有空白的正常訊息會被修剪後收下', async () => {
  const response = await chatWithMessage('  早安  ')
  assert.equal(response.status, 200)
})

test('超過設定檔上限的訊息回 400，並附上實際字數與上限', async () => {
  const max = JSON.parse(readConfig('message.json')).maxChars
  const response = await chatWithMessage('あ'.repeat(max + 1))
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: '訊息太長了。', used: max + 1, max })
})

test('剛好等於上限的訊息收下', async () => {
  const max = JSON.parse(readConfig('message.json')).maxChars
  assert.equal((await chatWithMessage('あ'.repeat(max))).status, 200)
})
