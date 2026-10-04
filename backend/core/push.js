// 推播的純函式：檢查請求內容、產生編號、組出 FCM 訊息、判斷是否已設定。
// 本檔案屬於純函式層，不讀檔也不連線，所有值都由呼叫端傳進來（架構約束 A1、A18）。
// 文字原樣送出，不經過人設改寫（docs/M1.5-EXPENSIVE-PLAN.md §10）。
// M1.6：標籤剝除由 handlers.js 組合 stream-parser.js 完成，本檔不 import 其他 core 模組（架構約束 A29）。

// 常數定義
export const MAX_PUSH_TEXT_LENGTH = 500
export const PUSH_NOT_CONFIGURED_MESSAGE = '尚未設定推播'
export const PUSH_FORMAT_MESSAGE = '請求格式不正確：缺少 text 欄位。'
export const PUSH_TOO_LONG_MESSAGE = '訊息太長了。'
export const PUSH_FAILED_MESSAGE = '推播送出失敗'
const PUSH_ID_PREFIX = 'push-'
const ID_RADIX = 36
const HIGH_PRIORITY = 'high' // 純資料推播要高優先順序，App 被收掉時才叫得醒
const REQUIRED_ACCOUNT_FIELDS = ['project_id', 'client_email', 'private_key']

// 功能函數定義

// 是否為 trim 後非空的字串
const isFilledText = (value) => typeof value === 'string' && value.trim().length > 0

// 以 Unicode 字元計算長度，中文與表情符號都算一個字
const countChars = (text) => Array.from(text).length

// 檢查推播請求內容：text 須為非空字串且不超過 500 字；id 有給（非空字串）就原樣保留
export const validatePushPayload = (payload) => {
  const raw = payload?.text
  if (!isFilledText(raw)) return { ok: false, reason: 'format' }
  const text = raw.trim()
  if (countChars(text) > MAX_PUSH_TEXT_LENGTH) return { ok: false, reason: 'too_long' }
  const id = typeof payload.id === 'string' && payload.id.length > 0 ? payload.id : null
  return { ok: true, text, id }
}

// 產生新編號：時間（36 進位）加上一段亂數文字
export const newPushId = (nowMs, randomText) => `${PUSH_ID_PREFIX}${nowMs.toString(ID_RADIX)}-${randomText}`

// 組出推播的 data：script 為非空字串時才多帶 script 欄位（架構約束 A27，不含標籤時與 M1.5 逐字相同）
const buildPushData = (id, text, script) =>
  typeof script === 'string' && script.length > 0 ? { id, text, script } : { id, text }

// 組出 FCM HTTP v1 的訊息：只有 token、data（id、text，必要時加 script）與高優先順序，沒有 notification
export const buildFcmMessage = (deviceToken, id, text, script) => ({
  message: {
    token: deviceToken,
    data: buildPushData(id, text, script),
    android: { priority: HIGH_PRIORITY }
  }
})

// 解析服務帳戶 JSON；不是字串或解析失敗回傳 null（解析結果不是物件時，欄位檢查自然不會通過）
const parseAccount = (serviceAccountText) => {
  if (typeof serviceAccountText !== 'string') return null
  try {
    return JSON.parse(serviceAccountText)
  } catch (error) {
    return null
  }
}

// 服務帳戶可解析且含三個必要欄位、推播代碼為非空字串，才算已設定
export const isPushConfigured = (serviceAccountText, deviceToken) => {
  if (!isFilledText(deviceToken)) return false
  const account = parseAccount(serviceAccountText)
  return REQUIRED_ACCOUNT_FIELDS.every((field) => isFilledText(account?.[field]))
}
