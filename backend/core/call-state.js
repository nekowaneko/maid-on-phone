// 視訊通話的狀態、文字與可用性：只由這支檔案決定，網頁端不得自己寫死。
// 本檔案屬於純函式層，零外部相依，可在無網路、無憑證的環境下完整測試。

// 常數定義
export const CHAT_EXIT_URL = 'chat-exit://close' // 與 call.json 的 exitUrl、Chat.kt 的 CHAT_EXIT_URL 相同
export const CALL_STATES = { CONNECTING: 'connecting', LIVE: 'live', THINKING: 'thinking', ERROR: 'error', ENDED: 'ended' }
export const CALL_EVENTS = {
  CONNECTED: 'connected',
  CONNECT_FAILED: 'connect-failed',
  SEND: 'send',
  REPLY: 'reply',
  REPLY_FAILED: 'reply-failed',
  HANGUP: 'hangup',
  REDIAL: 'redial'
}
export const MORE_MENU_ITEMS = [
  { id: 'log', label: '對話紀錄' },
  { id: 'persona', label: '小檔案' },
  { id: 'usage', label: '用量' },
  { id: 'bg-new', label: '上傳背景圖' },
  { id: 'bg-list', label: '更換背景圖' },
  { id: 'replies', label: '制式回覆' }
]
export const CALL_TEXT = {
  connectingTitle: '呼叫中…',
  connectingBody: '正在連上她',
  errorTitle: '連不上她',
  errorBody: '請檢查網路，或確認「App 存取密鑰」有填對。',
  errorRetry: '重撥',
  errorSecret: '開啟密鑰設定',
  endedTitle: '通話結束',
  endedRedial: '再撥一次',
  endedClose: '關閉聊天'
}
const TONES = { PLAIN: 'plain', LIVE: 'live', BAD: 'bad' }
const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const PAD_WIDTH = 2
const ZERO_TIME = '00:00'
const HTTP_OK = 200
const ENDED_TIME_PREFIX = '通話時間 '
const LIVE_PREFIX = '通話中 '
const THINKING_PREFIX = '她在想… '
const CONNECTING_TEXT = '呼叫中…'
const ERROR_TEXT = '連線失敗'
const ENDED_TEXT = '已結束'
const THINKING_EMOTION = 'thinking'

// 狀態轉換表：狀態 → 事件 → 下一個狀態
const TRANSITIONS = {
  [CALL_STATES.CONNECTING]: {
    [CALL_EVENTS.CONNECTED]: CALL_STATES.LIVE,
    [CALL_EVENTS.CONNECT_FAILED]: CALL_STATES.ERROR,
    [CALL_EVENTS.HANGUP]: CALL_STATES.ENDED
  },
  [CALL_STATES.LIVE]: {
    [CALL_EVENTS.SEND]: CALL_STATES.THINKING,
    [CALL_EVENTS.HANGUP]: CALL_STATES.ENDED
  },
  [CALL_STATES.THINKING]: {
    [CALL_EVENTS.REPLY]: CALL_STATES.LIVE,
    [CALL_EVENTS.REPLY_FAILED]: CALL_STATES.LIVE,
    [CALL_EVENTS.HANGUP]: CALL_STATES.ENDED
  },
  [CALL_STATES.ERROR]: { [CALL_EVENTS.REDIAL]: CALL_STATES.CONNECTING },
  [CALL_STATES.ENDED]: { [CALL_EVENTS.REDIAL]: CALL_STATES.CONNECTING }
}

// 功能函數定義

// 補零到兩位
const pad = (value) => String(value).padStart(PAD_WIDTH, '0')

// 把經過的毫秒數轉成 mm:ss（分鐘不補到小時，61 分 5 秒為 "61:05"）；不是有限的非負數時回 "00:00"
export const formatCallTime = (elapsedMs) => {
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) return ZERO_TIME
  const totalSeconds = Math.floor(elapsedMs / MS_PER_SECOND)
  return `${pad(Math.floor(totalSeconds / SECONDS_PER_MINUTE))}:${pad(totalSeconds % SECONDS_PER_MINUTE)}`
}

// 依目前狀態與事件算出下一個狀態；表中沒列的組合一律維持原狀態，不丟例外
export const nextCallState = (state, event) => {
  const row = Object.hasOwn(TRANSITIONS, state) ? TRANSITIONS[state] : null
  return row && Object.hasOwn(row, event) ? row[event] : state
}

// 依狀態與已通話毫秒數算出畫面該長什麼樣；不認得的狀態視為 ended
export const callView = (state, elapsedMs) => {
  switch (state) {
    case CALL_STATES.CONNECTING:
      return { statusText: CONNECTING_TEXT, statusTone: TONES.PLAIN, composerEnabled: false, dialogVisible: false, overlay: CALL_STATES.CONNECTING, faceDimmed: true, forcedEmotion: null }
    case CALL_STATES.LIVE:
      return { statusText: LIVE_PREFIX + formatCallTime(elapsedMs), statusTone: TONES.LIVE, composerEnabled: true, dialogVisible: true, overlay: null, faceDimmed: false, forcedEmotion: null }
    case CALL_STATES.THINKING:
      return { statusText: THINKING_PREFIX + formatCallTime(elapsedMs), statusTone: TONES.LIVE, composerEnabled: false, dialogVisible: true, overlay: null, faceDimmed: false, forcedEmotion: THINKING_EMOTION }
    case CALL_STATES.ERROR:
      return { statusText: ERROR_TEXT, statusTone: TONES.BAD, composerEnabled: false, dialogVisible: false, overlay: CALL_STATES.ERROR, faceDimmed: true, forcedEmotion: null }
    default:
      return { statusText: ENDED_TEXT, statusTone: TONES.PLAIN, composerEnabled: false, dialogVisible: false, overlay: CALL_STATES.ENDED, faceDimmed: true, forcedEmotion: null }
  }
}

// 通話結束蓋層的「通話時間 mm:ss」
export const endedTimeText = (elapsedMs) => ENDED_TIME_PREFIX + formatCallTime(elapsedMs)

// 依連線探測結果算出事件：只有「有密鑰且 HTTP 200」是 CONNECTED，其餘都是 CONNECT_FAILED
export const connectEvent = ({ hasSecret, status }) =>
  hasSecret === true && status === HTTP_OK ? CALL_EVENTS.CONNECTED : CALL_EVENTS.CONNECT_FAILED
