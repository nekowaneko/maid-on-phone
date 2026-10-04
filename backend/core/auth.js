// 存取授權：比對前端帶來的密鑰與 Worker 環境變數裡的密鑰。
// 本檔案屬於純函式層，不讀檔也不連線，兩個值都由呼叫端傳進來（架構約束 A1）。

// 常數定義
const EMPTY_TEXT = ''

// 功能函數定義

// 逐字元比對，長度不同直接判否；不提早跳出，避免用回應時間反推密鑰內容
const compareAll = (left, right) => {
  let diff = left.length === right.length ? 0 : 1
  const limit = Math.max(left.length, right.length)
  for (let index = 0; index < limit; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

// 沒設定密鑰或前端沒帶密鑰時一律不放行（失敗時關門，不是開門）
export const isAuthorized = (provided, expected) => {
  const got = typeof provided === 'string' ? provided : EMPTY_TEXT
  const want = typeof expected === 'string' ? expected : EMPTY_TEXT
  if (got.length === 0 || want.length === 0) return false
  return compareAll(got, want)
}
