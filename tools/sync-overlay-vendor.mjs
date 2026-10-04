// 把聊天網頁的串流解析程式（backend/core/stream-parser.js）照抄一份給懸浮窗角色頁用。
// 角色頁從 file:// 開，不能用 ES module，所以只做兩件事：去掉每行開頭的 `export `、外層包一個掛全域的函式。
// 其餘原始碼逐字保留（架構約束 A25），兩邊永遠是同一份。
// 用法：node tools/sync-overlay-vendor.mjs          → 產生 vendor 檔
//       node tools/sync-overlay-vendor.mjs --check  → 只比對，不一致時印出檔名並以非零結束

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 常數定義
const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const SOURCE_PATH = fileURLToPath(new URL('../backend/core/stream-parser.js', import.meta.url))
const TARGET_PATH = fileURLToPath(new URL('../app/src/main/assets/pet/vendor/stream-parser.js', import.meta.url))
const HEADER_LINE = '// 此檔由 tools/sync-overlay-vendor.mjs 產生，不得手改'
const WRAP_OPEN = '(function (root) {'
const WRAP_CLOSE = '})(this)'
const EXPORT_PATTERN = /^export /gm
const CRLF_PATTERN = /\r\n/g
const GLOBAL_NAME = 'PetStreamParser'
const EXPORTED_NAMES = ['createParserState', 'feedChunk', 'finalize', 'cuesReadyAt', 'feedAll', 'extractSseEvents']
const CHECK_FLAG = '--check'

// 功能函數定義

// 統一換行為 LF
const toLf = (text) => text.replace(CRLF_PATTERN, '\n')

// 由原始碼組出 vendor 檔內容（只去掉 export 並包一層）
export const buildVendor = (source) => {
  const body = toLf(source).replace(EXPORT_PATTERN, '')
  const trimmedBody = body.endsWith('\n') ? body : `${body}\n`
  const exportLine = `root.${GLOBAL_NAME} = { ${EXPORTED_NAMES.join(', ')} }`
  return [HEADER_LINE, WRAP_OPEN, `${trimmedBody}${exportLine}`, WRAP_CLOSE, ''].join('\n')
}

// 顯示用的相對路徑
const shortPath = (path) => relative(REPO_ROOT, path).replace(/\\/g, '/')

// 比對模式：vendor 檔不存在或內容不同時回傳 false
const checkVendor = (expected) => {
  if (!existsSync(TARGET_PATH)) {
    console.error(`vendor 檔不存在：${shortPath(TARGET_PATH)}`)
    return false
  }
  const actual = toLf(readFileSync(TARGET_PATH, 'utf8'))
  if (actual !== expected) {
    console.error(`vendor 檔與來源不一致：${shortPath(TARGET_PATH)}（來源：${shortPath(SOURCE_PATH)}）`)
    return false
  }
  console.log(`vendor 檔一致：${shortPath(TARGET_PATH)}`)
  return true
}

// 產生模式：寫出 vendor 檔（一律 LF）
const writeVendor = (expected) => {
  mkdirSync(dirname(TARGET_PATH), { recursive: true })
  writeFileSync(TARGET_PATH, expected, 'utf8')
  console.log(`已產生：${shortPath(TARGET_PATH)}`)
}

// 進入點：依參數決定產生或比對
const main = (args) => {
  const expected = buildVendor(readFileSync(SOURCE_PATH, 'utf8'))
  if (args.includes(CHECK_FLAG)) return checkVendor(expected) ? 0 : 1
  writeVendor(expected)
  return 0
}

// 比較兩個路徑是否指向同一檔案（Windows 不分大小寫）
const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()

// 只有直接執行時才跑（被測試 import 時不動檔案）
if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
  process.exitCode = main(process.argv.slice(2))
}
