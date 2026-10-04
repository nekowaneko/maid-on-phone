// 對話紀錄匯出：把歷史訊息排成一份純文字稿。
// 誰講的就在句子前面掛上誰的名字，一則講完空一行，換下一則。
// 本檔案屬於純函式層，不讀檔也不碰 DOM，時間與名字都由呼叫端傳進來（架構約束 A1）。

// 常數定義
const USER_ROLE = 'user'
const NAME_SEPARATOR = '：'
const ENTRY_SEPARATOR = '\n\n' // 一則講完空一行，兩個人的話才不會黏在一起
const LINE_END = '\n' // 最後一則也要收尾，文字檔以換行結束
const EMPTY_TEXT = ''
const DEFAULT_LABELS = { user: '我', assistant: '奈奈' }
const FILENAME_PREFIX = '對話紀錄-'
const FILENAME_EXTENSION = '.txt'
const PAD_LENGTH = 2
const PAD_CHAR = '0'

// 功能函數定義

// 這一則是不是講得出東西來：角色不管是哪一種，沒有內容就不必寫進去
const isSpeakable = (item) => typeof item?.content === 'string' && item.content.trim().length > 0

// 名字取不到就用預設那一組，免得匯出來變成空冒號開頭。
// 退回去的一定是同一個角色的預設名字，不會把我說的話掛到她頭上。
const pickLabel = (role, labels) => {
  const key = role === USER_ROLE ? 'user' : 'assistant'
  const name = (labels ?? {})[key]
  return typeof name === 'string' && name.length > 0 ? name : DEFAULT_LABELS[key]
}

// 一則訊息 → 一段文字。內容裡本來就有的換行原樣保留，不重排也不截斷。
const formatEntry = (item, labels) => `${pickLabel(item.role, labels)}${NAME_SEPARATOR}${item.content.trim()}`

// 整份歷史 → 一份純文字稿。沒有半則講得出來的內容時回傳空字串，
// 呼叫端就知道這一次沒東西可存。
export const formatTranscript = (history, labels) => {
  const rows = (Array.isArray(history) ? history : []).filter(isSpeakable)
  if (rows.length === 0) return EMPTY_TEXT
  return rows.map((item) => formatEntry(item, labels)).join(ENTRY_SEPARATOR) + LINE_END
}

// 檔名帶上匯出當下的時間，存第二份不會蓋掉第一份
export const buildTranscriptFilename = (date) => {
  const at = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date()
  const pad = (value) => String(value).padStart(PAD_LENGTH, PAD_CHAR)
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`
  return `${FILENAME_PREFIX}${stamp}${FILENAME_EXTENSION}`
}
