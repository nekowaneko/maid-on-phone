// 小檔案（人設）的結構驗證：存檔之前先擋一次，避免不小心存進一份空的或缺章節的人設。
//
// 本檔案屬於純函式層，不讀檔也不連線（架構約束 A1），
// 驗證規則由呼叫端把 config/persona-schema.json 解析後傳進來。
// 字數一律以「去掉所有空白後的字元數」計算，與第一批次 D02 的算法一致。

// 常數定義
const BLANK_MESSAGE = '小檔案不能是空白的。'
const MISSING_PREFIX = '缺少必要章節：'
const WHITESPACE_PATTERN = /\s/g
const EMPTY_TEXT = ''

// 功能函數定義

// 去掉所有空白之後還剩幾個字
const countChars = (text) => text.replace(WHITESPACE_PATTERN, EMPTY_TEXT).length

// 回傳 { ok, errors }；errors 是給使用者看的繁體中文訊息陣列
export const validatePersona = (text, schema) => {
  const errors = []
  // 非字串或整份都是空白：後面幾項就不必再檢查了，錯誤訊息只會更難讀
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, errors: [BLANK_MESSAGE] }
  }
  const sections = Array.isArray(schema?.requiredSections) ? schema.requiredSections : []
  for (const section of sections) {
    if (!text.includes(section)) errors.push(MISSING_PREFIX + section)
  }
  const count = countChars(text)
  const min = schema?.minChars
  const max = schema?.maxChars
  if (typeof min === 'number' && count < min) {
    errors.push(`內容太短：目前 ${count} 字，至少要 ${min} 字。`)
  }
  if (typeof max === 'number' && count > max) {
    errors.push(`內容太長：目前 ${count} 字，最多 ${max} 字。`)
  }
  return { ok: errors.length === 0, errors }
}
