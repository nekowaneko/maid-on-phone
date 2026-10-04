// 推播的純函式：檢查請求內容、產生編號、組出 FCM 訊息、判斷是否已設定。
// 本檔案屬於純函式層，不讀檔也不連線，所有值都由呼叫端傳進來（架構約束 A1、A18）。

// 常數定義
export const MAX_PUSH_TEXT_LENGTH = 500
export const PUSH_NOT_CONFIGURED_MESSAGE = '尚未設定推播'
export const PUSH_FORMAT_MESSAGE = '請求格式不正確：缺少 text 欄位。'
export const PUSH_TOO_LONG_MESSAGE = '訊息太長了。'
export const PUSH_FAILED_MESSAGE = '推播送出失敗'
const NOT_IMPLEMENTED = '尚未實作'

// 功能函數定義

// 檢查推播請求內容
export const validatePushPayload = (payload) => {
  throw new Error(NOT_IMPLEMENTED)
}

// 產生新編號
export const newPushId = (nowMs, randomText) => {
  throw new Error(NOT_IMPLEMENTED)
}

// 組出 FCM HTTP v1 的訊息
export const buildFcmMessage = (deviceToken, id, text) => {
  throw new Error(NOT_IMPLEMENTED)
}

// 服務帳戶與推播代碼是否都已設定
export const isPushConfigured = (serviceAccountText, deviceToken) => {
  throw new Error(NOT_IMPLEMENTED)
}
