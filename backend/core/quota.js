// 時區切日與用量彙總：把「今天」這件事算清楚，並把計數整理成前端要顯示的形狀。
//
// 本檔案屬於純函式層，不讀檔也不連線（架構約束 A1），設定由呼叫端傳進來。
// 刻意不用 Intl 或 toLocaleDateString：它們的行為隨執行環境而變，
// 在 workerd 與 Node 下可能給出不同結果，那會讓跨日的判定變成擲骰子。

// 常數定義
const MINUTE_MS = 60000
const DAY_MS = 86400000
const DATE_PAD = 2
const MONTH_OFFSET = 1 // getUTCMonth() 從 0 起算
const PAD_CHAR = '0'
const DATE_SEPARATOR = '-'
const PERCENT_BASE = 100

// 功能函數定義

// 補零成固定寬度，讓日期永遠是 YYYY-MM-DD
const pad = (value, width) => String(value).padStart(width, PAD_CHAR)

// 把 UTC 時間平移到指定時區之後，再取 UTC 的年月日。
// 平移過的時刻只用來讀年月日，不代表任何真實時刻。
export const zonedDateKey = (epochMs, utcOffsetMinutes) => {
  const shifted = new Date(epochMs + (Number(utcOffsetMinutes) || 0) * MINUTE_MS)
  const year = shifted.getUTCFullYear()
  const month = pad(shifted.getUTCMonth() + MONTH_OFFSET, DATE_PAD)
  const day = pad(shifted.getUTCDate(), DATE_PAD)
  return `${year}${DATE_SEPARATOR}${month}${DATE_SEPARATOR}${day}`
}

// 下一次跨日是什麼時候（毫秒時間戳）。用來告訴使用者計數幾點會歸零。
export const nextResetMs = (epochMs, utcOffsetMinutes) => {
  const offsetMs = (Number(utcOffsetMinutes) || 0) * MINUTE_MS
  const shifted = epochMs + offsetMs
  const sinceMidnight = ((shifted % DAY_MS) + DAY_MS) % DAY_MS
  return epochMs + (DAY_MS - sinceMidnight)
}

// 只認有限的數字，其餘（null、undefined、NaN）一律當作「沒有這個值」
const toNumberOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

// 兩種 null 各有意義，都不得自行代入預設數字：
//   上限是 null → 使用者還沒去查官方數字，只顯示已用量；
//   已用量是 null → 這一項我們量不到（例如每分鐘 token 數），連已用量都不顯示。
const summarizeOne = (used, limit) => {
  const got = toNumberOrNull(used)
  const cap = toNumberOrNull(limit)
  if (got === null || cap === null) return { used: got, limit: cap, remaining: null, percent: null }
  return {
    used: got,
    limit: cap,
    remaining: Math.max(0, cap - got),
    percent: cap === 0 ? null : Math.round((got / cap) * PERCENT_BASE)
  }
}

// counters 是實際數到的量，limits 是各項上限（都允許為 null）
export const summarizeUsage = (counters, limits) => ({
  estimated: true, // 這是我們自己記的估計值，不是供應商的官方數字
  rpm: summarizeOne(counters?.rpm, limits?.rpm),
  rpd: summarizeOne(counters?.rpd, limits?.rpd),
  // 每分鐘 token 數量不到：request_log 只有時間戳，token 只有每日累計，
  // 硬要湊一個數字出來會比不顯示更糟。上限照樣列出來供對照。
  tpm: summarizeOne(counters?.tpm ?? null, limits?.tpm),
  selfCap: summarizeOne(counters?.rpd, limits?.selfCap),
  promptTokens: Number(counters?.promptTokens) || 0,
  outputTokens: Number(counters?.outputTokens) || 0
})
