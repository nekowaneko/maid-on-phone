// W-A 契約驗證（M4.2 §4.6）：連線探測打的 /api/usage 與 connectEvent 對得起來，
// 而且設定檔指到的每一張表情圖都真的存在、是 300×349 的 PNG。
// 只替換外部服務（語言模型、資料庫）；handlers.js、call-state.js 一律用真的，不得替換。
// 表情圖是使用者本機才有的素材，缺圖就失敗，不得放寬、跳過或造假。

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createHandler } from '../worker/handlers.js'
import { streamCompletion as stubStream } from '../worker/llm-client.stub.js'
import { createStore } from '../worker/store.stub.js'
import { CALL_EVENTS, connectEvent } from '../core/call-state.js'

// 常數定義
const SECRET = 'test-only-secret'
const SECRET_HEADER = 'x-app-secret'
const USAGE_URL = 'https://example.com/api/usage'
const HTTP_OK = 200
const HTTP_UNAUTHORIZED = 401
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // 測試用的比對基準，不是假圖
const IHDR_WIDTH_OFFSET = 16
const IHDR_HEIGHT_OFFSET = 20
const FACE_WIDTH = 300
const FACE_HEIGHT = 349
const readConfig = (name) => readFileSync(new URL(`../config/${name}`, import.meta.url), 'utf8')

// 組出最小但完整的相依，設定檔直接從 config/ 讀進來；外部服務全走 stub
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

// 讀 PNG 檔頭：回傳簽章是否正確與 IHDR 的寬高；讀不到檔案就丟例外，測試失敗
const readPngHeader = (path) => {
  const bytes = readFileSync(path)
  return {
    signatureOk: bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    width: bytes.readUInt32BE(IHDR_WIDTH_OFFSET),
    height: bytes.readUInt32BE(IHDR_HEIGHT_OFFSET)
  }
}

test('W-A：帶正確密鑰打 /api/usage → 200 → connectEvent 為 connected', async () => {
  const handle = createHandler(buildDeps())
  const response = await handle(new Request(USAGE_URL, { method: 'GET', headers: { [SECRET_HEADER]: SECRET } }))
  assert.equal(response.status, HTTP_OK)
  assert.equal(connectEvent({ hasSecret: true, status: response.status }), CALL_EVENTS.CONNECTED)
})

test('W-A：不帶密鑰與帶錯密鑰打 /api/usage → 401 → connectEvent 為 connect-failed', async () => {
  const handle = createHandler(buildDeps())
  const missing = await handle(new Request(USAGE_URL, { method: 'GET' }))
  assert.equal(missing.status, HTTP_UNAUTHORIZED)
  assert.equal(connectEvent({ hasSecret: true, status: missing.status }), CALL_EVENTS.CONNECT_FAILED)
  const wrong = await handle(new Request(USAGE_URL, { method: 'GET', headers: { [SECRET_HEADER]: `${SECRET}X` } }))
  assert.equal(wrong.status, HTTP_UNAUTHORIZED)
  assert.equal(connectEvent({ hasSecret: true, status: wrong.status }), CALL_EVENTS.CONNECT_FAILED)
})

test('W-A：emotionMap 的每個值都是 assets/character/frames 下真的存在的 300×349 PNG', () => {
  const config = JSON.parse(readConfig('emotion-map.json'))
  const files = [...new Set(Object.values(config.emotionMap))]
  assert.ok(files.length > 0)
  for (const file of files) {
    const path = new URL(`../${config.assetRoot}/${file}`, import.meta.url)
    assert.ok(existsSync(path), `缺表情圖：${config.assetRoot}/${file}（使用者本機素材，見 BLOCKERS.md「缺表情圖」）`)
    const header = readPngHeader(path)
    assert.ok(header.signatureOk, `${file} 不是 PNG`)
    assert.equal(header.width, FACE_WIDTH, `${file} 寬度`)
    assert.equal(header.height, FACE_HEIGHT, `${file} 高度`)
  }
})

test('W-A：call.json 的眨眼圖存在且為 300×349 PNG', () => {
  const config = JSON.parse(readConfig('emotion-map.json'))
  const call = JSON.parse(readConfig('call.json'))
  const path = new URL(`../${config.assetRoot}/${call.blink.file}`, import.meta.url)
  assert.ok(existsSync(path), `缺眨眼圖：${config.assetRoot}/${call.blink.file}（使用者本機素材，見 BLOCKERS.md「缺表情圖」）`)
  const header = readPngHeader(path)
  assert.ok(header.signatureOk, `${call.blink.file} 不是 PNG`)
  assert.equal(header.width, FACE_WIDTH)
  assert.equal(header.height, FACE_HEIGHT)
})
