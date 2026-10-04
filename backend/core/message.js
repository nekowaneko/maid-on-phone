// 使用者訊息的長度規則：計數與判定集中在這裡，前端與路由層共用同一份，
// 兩邊不會各算各的而對不起來。
// 本檔案屬於純函式層，不讀檔也不連線，限制值由呼叫端傳進來（架構約束 A1）。

// 常數定義
const EMPTY_TEXT = ''
const PERCENT = 100
const NO_LIMIT = null // 設定檔沒給合理上限時就不設限，不要憑空捏一個數字出來

// 功能函數定義

// 取出設定檔裡的上限；不是正整數就當作沒設限
const readLimit = (schema) => {
  const max = schema?.maxChars
  if (!Number.isInteger(max) || max <= 0) return NO_LIMIT
  return max
}

// 依碼點計數，不用 String.length。
// 後者算的是 UTF-16 編碼單位，emoji 與部分漢字會被算成兩個字，
// 使用者看到的數字就會跟自己打的字數對不起來。
export const countMessage = (text) => (typeof text === 'string' ? [...text].length : 0)

// 這則訊息現在的長度狀態，前端拿它畫計數器、路由層拿它決定收不收。
// 回傳的欄位刻意都是原始值，顯示格式由呼叫端自己決定（架構約束 A1）。
export const describeMessage = (text, schema) => {
  const used = countMessage(text)
  const max = readLimit(schema)
  if (max === NO_LIMIT) {
    return { used, max: NO_LIMIT, overBy: 0, isOver: false, isWarning: false, isEmpty: used === 0 }
  }
  const warnAt = Number.isFinite(schema?.warnAtPercent) ? (max * schema.warnAtPercent) / PERCENT : max
  return {
    used,
    max,
    overBy: Math.max(0, used - max),
    isOver: used > max,
    // 到達提醒門檻就算，超過上限當然也算
    isWarning: used >= warnAt,
    isEmpty: used === 0
  }
}

// 這則訊息收不收：空的不收，超過上限也不收
export const isMessageAcceptable = (text, schema) => {
  const state = describeMessage(text, schema)
  return !state.isEmpty && !state.isOver
}
