// 檢查網頁程式用到的 id 都存在於 index.html（M4.2 V59）。
// 用法：node backend/tools/check-dom-ids.mjs [index.html 路徑]
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'web')
const SCRIPTS = ['app.js', 'call.js', 'background.js']
const indexPath = process.argv[2] ?? join(webDir, 'index.html')

// 程式動態建立的 id（不在 index.html 內）；每筆註明來源行。目前沒有。
const DYNAMIC_IDS = new Set([])

const html = readFileSync(indexPath, 'utf8')
const present = new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]))

const missing = []
for (const file of SCRIPTS) {
  const lines = readFileSync(join(webDir, file), 'utf8').split('\n')
  lines.forEach((line, i) => {
    const ids = [
      ...[...line.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
      ...[...line.matchAll(/querySelector(?:All)?\(\s*['"]#([\w-]+)[^'"]*['"]\s*\)/g)].map((m) => m[1]),
    ]
    for (const id of ids) {
      if (!present.has(id) && !DYNAMIC_IDS.has(id)) missing.push(`${file}:${i + 1} 缺 #${id}`)
    }
  })
}

if (missing.length > 0) {
  console.error(`index.html 缺少 ${missing.length} 個程式用到的 id：\n${missing.join('\n')}`)
  process.exit(1)
}
console.log('check-dom-ids：所有 id 齊全')
