// 失敗分類與 fallback 組字：把三個來源的訊號（HTTP 狀態碼、輸入被擋的理由、
// 輸出被砍的理由）收斂成一個 kind，再從設定檔取出對應的台詞。
//
// 本檔案屬於純函式層，不讀檔也不連線（架構約束 A1），
// 設定一律由呼叫端傳進來。它也永遠不認識任何表情名稱：
// 表情是內容，只存在 config/fallback-lines.json 裡（架構約束 A5、A7）。

// 常數定義
const KIND_BLOCKED = 'blocked'
const KIND_QUOTA = 'quota'
const KIND_CAPPED = 'capped'
const KIND_UPSTREAM = 'upstream'
const KIND_EMPTY = 'empty'
const KIND_UNKNOWN = 'unknown'

export const FAILURE_KINDS = [KIND_BLOCKED, KIND_QUOTA, KIND_CAPPED, KIND_UPSTREAM, KIND_EMPTY, KIND_UNKNOWN]

// 安全類 finishReason 的封閉清單。清單以外的（例如 MAX_TOKENS、STOP）不算失敗。
// 語言模型客戶端也用這一份判斷該不該丟出錯誤，避免兩邊各記一份而走鐘。
export const BLOCKING_FINISH_REASONS = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII']

const SELF_CAP_DETAIL = 'self:daily'
const PROMPT_PREFIX = 'prompt:'
const OUTPUT_PREFIX = 'output:'
const HTTP_PREFIX = 'http:'
const QUOTA_STATUS = 429
const SERVER_ERROR_STATUS = 500
const REASON_SEPARATOR = '/' // detail 裡狀態碼與理由代號的分隔符
const OK_STATUS_MIN = 200
const OK_STATUS_MAX = 300
const EMPTY_TEXT = ''

// 功能函數定義

// 狀態碼是不是成功的 2xx；沒有狀態碼（串流已經開始才失敗）不算失敗
const isOkStatus = (status) => status >= OK_STATUS_MIN && status < OK_STATUS_MAX

// 輸出被砍的理由是不是安全類
const isBlockingFinishReason = (finishReason) =>
  typeof finishReason === 'string' && BLOCKING_FINISH_REASONS.includes(finishReason)

// detail 是給翻 log 的人看的。狀態碼常常不足以判斷發生什麼事——
// 地區不支援與請求格式錯誤都是 400，差別只在上游回的理由代號，
// 所以有代號就一起寫進去，例如 http:400/FAILED_PRECONDITION。
const httpDetail = (status, reason) => {
  const base = HTTP_PREFIX + status
  if (typeof reason !== 'string' || reason.length === 0) return base
  return base + REASON_SEPARATOR + reason
}

// 判定順序固定，不得調換：自訂上限 → 輸入被擋 → 輸出被擋 → 額度 → 上游 → 其他狀態碼 → 空回應
export const classifyFailure = (signal) => {
  const status = typeof signal?.status === 'number' ? signal.status : null
  const blockReason = signal?.blockReason
  const finishReason = signal?.finishReason
  const reason = signal?.reason
  if (signal?.capped === true) return { kind: KIND_CAPPED, detail: SELF_CAP_DETAIL }
  if (typeof blockReason === 'string' && blockReason.length > 0) {
    return { kind: KIND_BLOCKED, detail: PROMPT_PREFIX + blockReason }
  }
  if (isBlockingFinishReason(finishReason)) return { kind: KIND_BLOCKED, detail: OUTPUT_PREFIX + finishReason }
  if (status === QUOTA_STATUS) return { kind: KIND_QUOTA, detail: httpDetail(status, reason) }
  if (status !== null && status >= SERVER_ERROR_STATUS) {
    return { kind: KIND_UPSTREAM, detail: httpDetail(status, reason) }
  }
  if (status !== null && !isOkStatus(status)) return { kind: KIND_UNKNOWN, detail: httpDetail(status, reason) }
  if (signal?.sawText === false) return { kind: KIND_EMPTY, detail: KIND_EMPTY }
  return { kind: KIND_UNKNOWN, detail: KIND_UNKNOWN }
}

// 只有已經送過文字給前端，才需要叫前端把畫面清乾淨
export const shouldRetract = (signal) => signal?.sawText === true

// 從設定檔取出這個 kind 的台詞，組成「[表情] 台詞」。找不到就用 defaultKind。
export const buildFallbackText = (fallbackConfig, kind) => {
  const lines = fallbackConfig?.lines ?? {}
  const line = lines[kind] ?? lines[fallbackConfig?.defaultKind]
  if (!line) return EMPTY_TEXT
  return `[${line.emotion}] ${line.text}`
}
