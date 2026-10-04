// 提示詞組裝：把 config/prompt-template.md 的 {{XXX}} 插槽換成實際內容，
// 並負責把表情清單、對話歷史整理成 LLM 讀得懂的純文字。
// 本檔案屬於純函式層，不讀檔也不連線，所有素材都由呼叫端傳進來。

// 常數定義
const SLOT_PATTERN = /\{\{\s*([A-Z_]+)\s*\}\}/g
const TAG_OPEN = '['
const TAG_CLOSE = ']'
const LIST_SEPARATOR = '、'
const HISTORY_LINE_SEPARATOR = '\n'
// 訊息內的換行（連同前後空白）一律收成一個空白，避免跟上面那個分隔符混淆
const HISTORY_NEWLINES = /\s*[\r\n]+\s*/g
const HISTORY_SPACE = ' '
const ROLE_LABELS = { user: '使用者', assistant: '你' } // 對話歷史的角色標示
const UNKNOWN_ROLE_LABEL = '對話'
const HISTORY_TURN_LIMIT = 20 // 預設保留最近 20 輪
const MESSAGES_PER_TURN = 2 // 一輪 = 一問一答，共兩則訊息
const EMPTY_TEXT = ''
const TEMPLATE_BODY_MARKER = '## 範本本文' // 範本檔中，說明段落與實際提示詞的分界

// 功能函數定義

// 把範本中的 {{XXX}} 插槽替換掉；沒提供的插槽換成空字串，不留下原文
export const renderTemplate = (template, slots) => {
  const source = typeof template === 'string' ? template : EMPTY_TEXT
  const table = slots ?? {}
  return source.replace(SLOT_PATTERN, (whole, key) => {
    const value = Object.hasOwn(table, key) ? table[key] : EMPTY_TEXT
    return value === null || value === undefined ? EMPTY_TEXT : String(value)
  })
}

// 由 emotionMap 的鍵產生給 LLM 看的標籤清單字串
export const buildEmotionList = (emotionMap) =>
  Object.keys(emotionMap ?? {})
    .map((key) => TAG_OPEN + key + TAG_CLOSE)
    .join(LIST_SEPARATOR)

// 把上限正規化成正整數輪數
const normalizeTurnLimit = (turnLimit) => {
  const value = Number(turnLimit)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : HISTORY_TURN_LIMIT
}

// 只保留最近幾輪對話，超過的從最舊的開始丟棄
export const trimHistory = (messages, turnLimit) => {
  const list = Array.isArray(messages) ? messages : []
  const keep = normalizeTurnLimit(turnLimit) * MESSAGES_PER_TURN
  return list.slice(Math.max(0, list.length - keep))
}

// 取得該則訊息在提示詞裡要用的角色標示
const labelOfRole = (role) => (Object.hasOwn(ROLE_LABELS, role) ? ROLE_LABELS[role] : UNKNOWN_ROLE_LABEL)

// 把對話歷史攤平成一行一句的純文字
// 把一則訊息裡的換行收成空白。
// 歷史紀錄本身就是用換行把每一輪隔開的，訊息裡的換行如果原樣寫進去，
// 第二行就會變成一行沒有標籤的孤行，模型可能把它讀成另一輪對話。
// 只影響餵給模型的歷史摘要——這一輪真正送出去的那則訊息仍然保留原本的換行。
const flattenLine = (text) => text.replace(HISTORY_NEWLINES, HISTORY_SPACE).trim()

export const buildHistoryText = (messages) =>
  (Array.isArray(messages) ? messages : [])
    .filter((item) => typeof item?.content === 'string' && item.content.length > 0)
    .map((item) => `${labelOfRole(item?.role)}：${flattenLine(item.content)}`)
    .join(HISTORY_LINE_SEPARATOR)

// 函數組合：把四個插槽一次組進系統提示詞
// 範本檔的前半段是寫給人看的說明（用途、插槽對照表），那些字不能進系統提示詞。
// 否則模型會把「組裝時替換下列插槽，其餘文字逐字保留」當成自己的任務，
// 直接把填好的範本背出來，而不是扮演角色。
// 這裡只取分界標記之後的內容；找不到標記就整份沿用，不讓提示詞憑空消失。
export const extractTemplateBody = (template) => {
  const source = typeof template === 'string' ? template : EMPTY_TEXT
  const index = source.indexOf(TEMPLATE_BODY_MARKER)
  return index < 0 ? source : source.slice(index + TEMPLATE_BODY_MARKER.length).trim()
}

export const buildSystemPrompt = (template, parts) =>
  renderTemplate(extractTemplateBody(template), {
    PERSONA: parts?.persona ?? EMPTY_TEXT,
    EMOTION_LIST: parts?.emotionList ?? EMPTY_TEXT,
    TIME_GAP: parts?.timeGap ?? EMPTY_TEXT,
    HISTORY: parts?.history ?? EMPTY_TEXT
  })
