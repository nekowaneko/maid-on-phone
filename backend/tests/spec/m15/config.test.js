// M1.5 規格範例表（docs/M1.5-EXPENSIVE-PLAN.md §4.5）中 Worker B 設定檔的那一列，凍結後不得修改。
// 只讀 backend/wrangler.toml 與 accompany_bot 的 wrangler.toml（存在時），不連線。

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

// 常數定義
const PET_MAID_TOML = new URL('../../../wrangler.toml', import.meta.url)
const ACCOMPANY_TOML = 'C:/Users/Dominic/Desktop/ml_demo/accompany-assiment/wrangler.toml'

// 全程不得對外連線
globalThis.fetch = () => {
  throw new Error('測試期間不得對外發出任何請求')
}

// 取出 toml 中某個鍵的字串值（只認 key = "value" 這種寫法）
const readTomlValue = (text, key) => {
  const matched = text.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm'))
  return matched ? matched[1] : null
}

test('M15-S03 Worker B 名稱與資料庫名稱和 accompany_bot 不同', () => {
  const text = readFileSync(PET_MAID_TOML, 'utf8')
  const name = readTomlValue(text, 'name')
  const databaseName = readTomlValue(text, 'database_name')
  assert.equal(name, 'pet-maid-api')
  assert.equal(databaseName, 'pet-maid-db')
  assert.notEqual(name, 'neko-companion')
  assert.notEqual(databaseName, 'datastore')
  if (existsSync(ACCOMPANY_TOML)) {
    const other = readFileSync(ACCOMPANY_TOML, 'utf8')
    assert.notEqual(readTomlValue(text, 'database_id'), readTomlValue(other, 'database_id'))
  }
})
