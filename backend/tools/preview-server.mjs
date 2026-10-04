// 本機預覽伺服器：把專案根目錄當靜態檔案發出去，/api/ 底下的請求一律轉交
// worker/handlers.js 處理。存在的理由是 `wrangler dev` 在本專案會因為
// [assets] directory = "./" 監看整個根目錄而不斷重載（見 DECISIONS.md D21），
// 調前端版面與節奏時等不到一個穩定的伺服器。
//
// 這支只用 Node 標準庫，沒有任何相依套件，也完全不連外、不消耗 API 額度。
// 它跟線上 Worker 共用同一份路由邏輯（架構約束 A10），自己不實作任何
// /api/ 路徑的行為，所以預覽看到的行為跟部署後是同一套。
// 語言模型走 worker/llm-client.stub.js，設定檔用 node:fs 直接讀 config/。
//
// 用法：
//   npm run preview                 預設 8899 埠，每個片段間隔 80 毫秒
//   npm run preview -- --port 9000  換一個埠
//   npm run preview -- --delay 300  放慢串流，模擬回得比較慢的情況
//
// 手機要連進來的話，用終端機印出來的區網網址（手機打 localhost 是連到手機自己）。

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { networkInterfaces } from 'node:os'
import { createHandler } from '../worker/handlers.js'
import { streamCompletion as stubStream } from '../worker/llm-client.stub.js'
import { createStore } from '../worker/store.stub.js'

// 常數定義
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY_PATH = '/web/index.html'
const API_PREFIX = '/api/'
const ROOT_PATH = '/'
const DEFAULT_PORT = 8899
const DEFAULT_DELAY_MS = 80 // 每個串流片段之間的間隔
const LISTEN_HOST = '0.0.0.0' // 綁全介面，手機才連得到
// 本機預覽專用的固定密鑰。它只在本機、只搭 Stub，不是真憑證，
// 啟動時印在終端機上讓你複製貼上，密鑰輸入流程本身也就一起驗到了。
const PREVIEW_SECRET = 'preview-only-secret'
const EMPTY_TEXT = ''
const PARENT_PATH_PATTERN = /^(\.\.[/\\])+/
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}
const FALLBACK_CONTENT_TYPE = 'application/octet-stream'

// 功能函數定義

// 讀取 --port 9000 這種形式的參數，沒給就用預設值
const readArg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

// 設定檔用 node:fs 讀進來，跟線上 Worker 用 wrangler 模組規則帶入的是同一批內容
const readConfigText = (name) => readFileSync(join(PROJECT_ROOT, 'config', name), 'utf8')
const readConfigJson = (name) => JSON.parse(readConfigText(name))

// 組出交給路由層的相依。少傳一個欄位這支就會壞，所以它同時是 deps 完整性的哨兵。
const buildDeps = () => ({
  emotionConfig: readConfigJson('emotion-map.json'),
  gapConfig: readConfigJson('time-gap-tiers.json'),
  fallbackConfig: readConfigJson('fallback-lines.json'),
  quotaConfig: readConfigJson('quota.json'),
  personaSchema: readConfigJson('persona-schema.json'),
  messageSchema: readConfigJson('message.json'),
  personaText: readConfigText('persona.md'),
  templateText: readConfigText('prompt-template.md'),
  secret: PREVIEW_SECRET,
  store: createStore({}),
  streamer: (messages) => stubStream(messages, {})
})

const handleApi = createHandler(buildDeps())

// 把 node 的請求換成路由層看得懂的標準 Request
const toWebRequest = async (request, origin) => {
  const parts = []
  for await (const part of request) {
    parts.push(part)
  }
  const body = parts.length > 0 ? Buffer.concat(parts) : undefined
  return new Request(new URL(request.url, origin), {
    method: request.method,
    headers: request.headers,
    body
  })
}

// 把路由層回傳的標準 Response 寫回 node 的回應。
// 每寫出一段就等一下，讓逐字顯示的節奏在本機看得出來。
const writeWebResponse = async (result, response, delayMs) => {
  response.writeHead(result.status, Object.fromEntries(result.headers))
  if (!result.body) {
    response.end()
    return
  }
  const reader = result.body.getReader()
  let reading = true
  while (reading) {
    const { value, done } = await reader.read()
    if (done) {
      reading = false
      continue
    }
    response.write(Buffer.from(value))
    await sleep(delayMs)
  }
  response.end()
}

// 發送靜態檔案；路徑一律關在專案根目錄裡面
const serveFile = async (path, response) => {
  const safe = normalize(decodeURIComponent(path)).replace(PARENT_PATH_PATTERN, EMPTY_TEXT)
  try {
    const body = await readFile(join(PROJECT_ROOT, safe))
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(safe)] ?? FALLBACK_CONTENT_TYPE })
    response.end(body)
  } catch (error) {
    response.writeHead(404, { 'content-type': CONTENT_TYPES['.html'] })
    response.end('找不到這個檔案。')
  }
}

// 列出可以從手機連進來的區網網址
const listAddresses = (port) => {
  const groups = Object.values(networkInterfaces()).flat()
  const lan = groups
    .filter((item) => item?.family === 'IPv4' && !item.internal)
    .map((item) => `http://${item.address}:${port}${ENTRY_PATH}`)
  return [`http://localhost:${port}${ENTRY_PATH}`, ...lan]
}

// 只做分派：/api/ 與根路徑交給路由層，其餘一律當靜態檔案發出去
const handleRequest = async (request, response) => {
  const origin = `http://${request.headers.host ?? 'localhost'}`
  const path = new URL(request.url, origin).pathname
  if (path.startsWith(API_PREFIX) || path === ROOT_PATH) {
    const result = await handleApi(await toWebRequest(request, origin))
    await writeWebResponse(result, response, readArg('delay', DEFAULT_DELAY_MS))
    console.log(`  ${request.method} ${path} → ${result.status}`)
    return
  }
  await serveFile(path, response)
}

const port = readArg('port', DEFAULT_PORT)
createServer(handleRequest).listen(port, LISTEN_HOST, () => {
  console.log('預覽伺服器就緒（Stub 腳本，不連外、不消耗 API 額度）：')
  listAddresses(port).forEach((url) => console.log(`  ${url}`))
  console.log(`本機預覽密鑰（第一次開啟時貼進畫面上的輸入框）：${PREVIEW_SECRET}`)
  console.log('加上 ?debug=1 可看到目前階段與節奏參數，例如 ?debug=1&hold=5000')
  console.log('手機請用上面的區網網址，並確認跟這台電腦在同一個 Wi-Fi。')
})
