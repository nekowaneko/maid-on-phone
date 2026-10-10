// V32 檢查：ma-lines.json 與 ma-glossary.json 的句子（取每個字串值的前 12 個字當樣本）不得寫死在程式裡。
// 說明、描述、台詞、錯誤訊息只能從設定檔讀（docs/M4-EXPENSIVE-PLAN.md A45）。

import { readFileSync, existsSync } from 'node:fs'

// 常數定義
const CONFIG_FILES = ['backend/config/ma-lines.json', 'backend/config/ma-glossary.json']
const CODE_FILES = [
  'backend/core/ma.js',
  'backend/worker/handlers.js',
  'backend/worker/twse-client.js',
  'backend/web/ma.js',
  'backend/web/ma-render.js',
  'app/src/main/assets/pet/ma-view.js'
]
const SAMPLE_LENGTH = 12

// 功能函數定義

// 取出 JSON 裡所有夠長的字串值
const collectStrings = (value, out = []) => {
  if (typeof value === 'string') {
    if (value.length >= SAMPLE_LENGTH) out.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out)
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (!key.startsWith('_')) collectStrings(item, out)
    }
  }
  return out
}

const samples = []
for (const file of CONFIG_FILES) {
  if (!existsSync(file)) continue
  for (const text of collectStrings(JSON.parse(readFileSync(file, 'utf8')))) samples.push([file, text.slice(0, SAMPLE_LENGTH)])
}

let hits = 0
for (const file of CODE_FILES) {
  if (!existsSync(file)) continue
  const source = readFileSync(file, 'utf8')
  for (const [from, sample] of samples) {
    if (source.includes(sample)) {
      console.error(`${file} 含 ${from} 的句子：${sample}`)
      hits += 1
    }
  }
}
process.exit(hits === 0 ? 0 : 1)
