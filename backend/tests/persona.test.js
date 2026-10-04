// core/persona.js 的單元測試：小檔案存檔前的四種驗證結果。
// 四種結果各有專項測試：缺章節、過短、過長、正常。
// 驗證規則直接讀 config/persona-schema.json，測試不另外寫死一份規則。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validatePersona } from '../core/persona.js'

// 常數定義
const readConfig = (name) => readFileSync(new URL(`../config/${name}`, import.meta.url), 'utf8')
const SCHEMA = JSON.parse(readConfig('persona-schema.json'))
const DEFAULT_PERSONA = readConfig('persona.md')
const FILLER = '喵'

// NETWORK_GUARD：純函式層不該有任何對外請求，這裡一併把門關上
let networkCalls = 0
const NETWORK_GUARD = () => {
  networkCalls += 1
  throw new Error('測試期間不得對外發出任何請求')
}
globalThis.fetch = NETWORK_GUARD

// 組一份章節齊全、字數可控的小檔案
const buildPersona = (charCount) => {
  const head = SCHEMA.requiredSections.join('\n\n')
  const need = Math.max(0, charCount - head.replace(/\s/g, '').length)
  return `${head}\n\n${FILLER.repeat(need)}`
}

test('正常：章節齊全且字數在範圍內就通過', () => {
  const result = validatePersona(buildPersona(SCHEMA.minChars + 50), SCHEMA)
  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
})

test('正常：預設的 config/persona.md 本身必須通過驗證', () => {
  // 它是「一鍵還原」的還原點，如果它自己不合格，還原之後就存不回去了
  const result = validatePersona(DEFAULT_PERSONA, SCHEMA)
  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
})

test('缺章節：少了任何一個必要章節都要被擋下來', () => {
  for (const missing of SCHEMA.requiredSections) {
    const kept = SCHEMA.requiredSections.filter((section) => section !== missing)
    const text = `${kept.join('\n\n')}\n\n${FILLER.repeat(SCHEMA.minChars)}`
    const result = validatePersona(text, SCHEMA)
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((message) => message.includes(missing)))
  }
})

test('缺章節：全部缺光時每一個章節各報一次', () => {
  const result = validatePersona(FILLER.repeat(SCHEMA.minChars), SCHEMA)
  assert.equal(result.ok, false)
  assert.equal(result.errors.length, SCHEMA.requiredSections.length)
})

test('過短：字數不足 minChars 要被擋下來', () => {
  const result = validatePersona(buildPersona(SCHEMA.minChars - 1), SCHEMA)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((message) => message.includes('太短')))
})

test('過長：字數超過 maxChars 要被擋下來', () => {
  const result = validatePersona(buildPersona(SCHEMA.maxChars + 1), SCHEMA)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((message) => message.includes('太長')))
})

test('字數以去掉所有空白後的字元數計算', () => {
  // 剛好踩在下限上：塞再多空白也不會讓它變成合格
  const exact = buildPersona(SCHEMA.minChars)
  assert.equal(validatePersona(exact, SCHEMA).ok, true)
  const padded = `${buildPersona(SCHEMA.minChars - 1)}\n\n${' '.repeat(500)}`
  assert.equal(validatePersona(padded, SCHEMA).ok, false)
})

test('空白或非字串一律擋下，且只回一句話', () => {
  for (const bad of ['', '   \n\t  ', null, undefined, 123, {}]) {
    const result = validatePersona(bad, SCHEMA)
    assert.equal(result.ok, false)
    assert.equal(result.errors.length, 1)
  }
})

test('錯誤訊息一律是繁體中文字串', () => {
  const result = validatePersona(FILLER, SCHEMA)
  assert.ok(result.errors.length > 0)
  for (const message of result.errors) {
    assert.equal(typeof message, 'string')
    assert.match(message, /[一-鿿]/)
  }
})

test('規則缺漏時不丟例外：沒有 schema 就只檢查空白', () => {
  assert.equal(validatePersona('隨便寫點什麼', undefined).ok, true)
  assert.equal(validatePersona('', undefined).ok, false)
})

test('全程沒有任何對外請求被發出', () => {
  assert.equal(networkCalls, 0)
})
