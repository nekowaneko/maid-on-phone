// 前端主流程：載入設定 → 送出訊息 → 消費 SSE 串流 → 切換圖層 → 逐字顯示台詞。
// 一輪對話走一條有節奏的階段流程：版面回穩 → 等待 → 表情先行 → 逐字 → 表情停留 → 回待機。
// 每個階段都有最短時間下限，語言模型回得再快，也不會把表情壓縮到來不及看。
// 這支程式不判斷情緒，也不認識任何表情名稱，一律採用 core/ 解析出來的結果。

import { createParserState, feedChunk, finalize, cuesReadyAt, extractSseEvents } from '../core/stream-parser.js'
import { minutesBetween } from '../core/time-gap.js'
import { trimHistory } from '../core/prompt.js'
import { describeMessage, isMessageAcceptable } from '../core/message.js'
import { formatTranscript, buildTranscriptFilename } from '../core/transcript.js'
import { createRenderer } from './renderer.js'
import { setupBackground } from './background.js'
import { setupOutfit } from './outfit.js'

// 常數定義
const CONFIG_URL = new URL('../config/emotion-map.json', import.meta.url) // 啟動時取得設定，不內嵌複本
const CHAT_URL = new URL('../api/chat', import.meta.url) // 只呼叫自家 Worker，金鑰全留在後端
const PERSONA_URL = new URL('../api/persona', import.meta.url) // 一律相對網址，不對外部服務發請求
const USAGE_URL = new URL('../api/usage', import.meta.url)
const MESSAGE_SCHEMA_URL = new URL('../config/message.json', import.meta.url) // 字數上限，前後端讀同一份
const COUNT_SEPARATOR = ' / '
const OVER_CLASS = 'is-over'
const REPLIES_NOTE_TEXT = '她講出這些話的時候，代表背後遇到了對應的問題。kind 是伺服器日誌裡的代號。'
const REPLIES_LOAD_FAILED_TEXT = '對照表讀不回來。'
const REPLY_CARD_CLASS = 'reply-card'
const REPLY_KIND_CLASS = 'reply-kind'
const REPLY_LINE_CLASS = 'reply-line'
const REPLY_META_CLASS = 'reply-meta'
const TRIGGER_PREFIX = '觸發：'
const RETRY_PREFIX = '怎麼辦：'
const DETAIL_PREFIX = '日誌：'
const ENTER_KEY = 'Enter'
const FINE_POINTER_QUERY = '(pointer: fine)' // 有精準指標裝置＝桌機，靠鍵盤打字
const AUTO_HEIGHT = 'auto'
const PIXEL_UNIT = 'px'
const FALLBACK_LINES_URL = new URL('../config/fallback-lines.json', import.meta.url) // 台詞本身
const FAILURE_GUIDE_URL = new URL('../config/failure-guide.json', import.meta.url) // 每種 kind 的觸發說明
const HISTORY_STORAGE_KEY = 'companion:history'
const LAST_SEEN_STORAGE_KEY = 'companion:lastSeenAt'
const SECRET_STORAGE_KEY = 'companion:secret'
// 密鑰只從瀏覽器裡讀，程式碼裡沒有任何明文常數；標頭名固定用這個小寫名稱
const SECRET_HEADER = 'x-app-secret'
const UNAUTHORIZED_STATUS = 401
const HISTORY_TURN_LIMIT = 20 // 最近 20 輪，超過從最舊的開始丟棄
const TYPEWRITER_INTERVAL_MS = 30 // 逐字顯示速度：每字 30 毫秒

// 節奏參數：這幾個數字決定表情看不看得見，可用 ?debug=1&hold=5000 之類在真機上邊看邊調
const SETTLE_TIMEOUT_MS = 500 // 收鍵盤後等版面回穩的上限
const SETTLE_QUIET_MS = 120 // 視窗連續這麼久沒再變動就當作穩了
const WAIT_MIN_MS = 700 // 等待期間的表情最短壽命
const LEAD_MS = 450 // 表情先行：換臉後空一拍才開始吐字
const HOLD_MS = 3000 // 逐字結束後表情保持多久才淡回待機
const VIEWPORT_SHRINK_TOLERANCE = 80 // 視窗矮這麼多以上才算鍵盤真的佔住畫面

// 階段名稱直接用中文，除錯面板可以照著印
const PHASE_IDLE = '待機'
const PHASE_SETTLING = '版面回穩'
const PHASE_WAITING = '等待回覆'
const PHASE_LEADING = '表情先行'
const PHASE_SPEAKING = '逐字顯示'
const PHASE_HOLDING = '表情停留'

const DEBUG_QUERY_KEY = 'debug'
const DEBUG_QUERY_VALUE = '1'
const DELTA_EVENT = 'delta'
const DONE_EVENT = 'done'
const ERROR_EVENT = 'error'
// 語言模型沒能正常回覆時，後端改送這一種事件，台詞由她本人講
const FALLBACK_EVENT = 'fallback'
const NETWORK_ERROR_TEXT = '（連線好像斷掉了，等一下再跟我說一次好嗎？）'
const EMPTY_TEXT = ''
const USER_ROLE = 'user'
const REPLY_ROLE = 'assistant'

// 右側工具列與對話紀錄抽屜
const FOLDED_CLASS = 'is-folded'
const OPEN_CLASS = 'is-open'
const MINE_CLASS = 'is-mine'
const LOG_ROW_CLASS = 'log-row'
const LOG_BUBBLE_CLASS = 'log-bubble'
const LOG_EMPTY_CLASS = 'log-empty'
const FOLD_LABEL = '隱藏右側按鈕'
const UNFOLD_LABEL = '顯示右側按鈕'
const FOLD_GLYPH = '»'
const UNFOLD_GLYPH = '«'
const EMPTY_LOG_TEXT = '還沒有對話紀錄。先跟她說點什麼吧。'
// 匯出對話紀錄：檔案裡誰講的就掛誰的名字，格式本身由 core/transcript.js 決定
const TRANSCRIPT_LABELS = { user: '我', assistant: '奈奈' }
const TRANSCRIPT_MIME = 'text/plain;charset=utf-8'
const ANCHOR_TAG = 'a'
const DOWNLOAD_ATTRIBUTE = 'download'
const REVOKE_DELAY_MS = 1000 // 下載開始之後才撤掉臨時網址
// 被拒絕時要講清楚是哪一把密鑰：最容易犯的錯就是把 Gemini API 金鑰貼進來，
// 而那把金鑰根本不該進瀏覽器，貼了也一定不會過
const SECRET_REJECTED_TEXT =
  '這把 App 存取密鑰不對，或是它已經被換掉了。請確認你貼的是 App 存取密鑰，不是 Gemini API 金鑰。'
const SECRET_SAVED_TEXT = 'App 存取密鑰已經記在這個瀏覽器裡了。'
const SECRET_BLOCKED_TEXT = '（還沒輸入 App 存取密鑰，先把它貼進上面那個框吧。）'
const PERSONA_DEFAULT_TEXT = '目前用的是預設的小檔案。'
const PERSONA_SAVED_PREFIX = '已存檔，最後修改：'
const PERSONA_SAVE_FAILED_TEXT = '存檔失敗，等一下再試一次。'
const PERSONA_LOAD_FAILED_TEXT = '讀不到小檔案，等一下再試一次。'
const PERSONA_CLEAR_QUESTION = '小檔案存好了。要順便把先前的對話清掉嗎？\n（她的語氣已經變了，舊對話留著可能會不太連貫。）'
const ERROR_JOIN = '\n'
const USAGE_ESTIMATED_TEXT = '這是自記估計值，只算我們自己送出去的請求，官方數字以 Google Cloud console 為準。'
const USAGE_LOAD_FAILED_TEXT = '讀不到用量，等一下再試一次。'
const USAGE_UNSET_TEXT = '未設定'
const USAGE_UNMEASURED_TEXT = '未量測'
const USAGE_ROWS = [
  { key: 'rpm', label: '每分鐘請求數' },
  { key: 'rpd', label: '每日請求數' },
  { key: 'tpm', label: '每分鐘 token 數' },
  { key: 'selfCap', label: '自訂每日上限' }
]
const USAGE_ROW_CLASS = 'usage-row'
const USAGE_LABEL_CLASS = 'usage-label'
const USAGE_VALUE_CLASS = 'usage-value'
const USAGE_WARN_CLASS = 'is-warn'
const SPAN_TAG = 'span'
const ARIA_HIDDEN = 'aria-hidden'
const ARIA_LABEL = 'aria-label'
const TRUE_TEXT = 'true'
const FALSE_TEXT = 'false'
const DIV_TAG = 'div'
const PARAGRAPH_TAG = 'p'

// 畫面元素
const stageElement = document.getElementById('character')
const lineElement = document.getElementById('line')
const echoElement = document.getElementById('echo')
const formElement = document.getElementById('composer')
const inputElement = document.getElementById('message')
const sendButton = document.getElementById('send')
const debugElement = document.getElementById('debug')
const debugRawElement = document.getElementById('debug-raw')
const debugStateElement = document.getElementById('debug-state')
const toolsElement = document.getElementById('tools')
const toolsToggleButton = document.getElementById('tools-toggle')
const logOpenButton = document.getElementById('log-open')
const logCloseButton = document.getElementById('log-close')
const logElement = document.getElementById('log')
const logExportButton = document.getElementById('log-export')
const logListElement = document.getElementById('log-list')
const secretElement = document.getElementById('secret')
const secretFormElement = document.getElementById('secret-form')
const secretInputElement = document.getElementById('secret-input')
const secretCloseButton = document.getElementById('secret-close')
const secretNoteElement = document.getElementById('secret-note')
const personaElement = document.getElementById('persona')
const personaOpenButton = document.getElementById('persona-open')
const personaCloseButton = document.getElementById('persona-close')
const personaTextElement = document.getElementById('persona-text')
const personaStateElement = document.getElementById('persona-state')
const personaErrorsElement = document.getElementById('persona-errors')
const personaSaveButton = document.getElementById('persona-save')
const personaResetButton = document.getElementById('persona-reset')
const usageElement = document.getElementById('usage')
const usageOpenButton = document.getElementById('usage-open')
const countElement = document.getElementById('message-count')
const repliesElement = document.getElementById('replies')
const repliesOpenButton = document.getElementById('replies-open')
const repliesCloseButton = document.getElementById('replies-close')
const repliesListElement = document.getElementById('replies-list')
const repliesNoteElement = document.getElementById('replies-note')
const usageCloseButton = document.getElementById('usage-close')
const usageListElement = document.getElementById('usage-list')
const usageNoteElement = document.getElementById('usage-note')

// 執行期狀態集中在這裡，其餘函式都只做一件事
const runtime = {
  config: null,
  messageSchema: null, // config/message.json，載不到就等於不設限，不擋使用者打字
  renderer: null,
  timing: null,
  history: [],
  parser: null,
  shownCount: 0,
  shownCues: 0, // 已經演掉幾個表情提示；剩下的等逐字逐到它們的位置才輪到
  timerId: 0, // 逐字顯示的計時器
  leadTimerId: 0, // 表情先行的空拍計時器
  holdTimerId: 0, // 表情停留的計時器
  streaming: false,
  streamEnded: false,
  finalized: false,
  faceShown: false, // 這一輪是否已經換上解析出來的表情
  rawOutput: EMPTY_TEXT,
  shownEmotion: EMPTY_TEXT, // 畫面上真正看得到的表情
  phase: PHASE_IDLE,
  phaseStartedAt: 0
}

// 功能函數定義

// 網址帶 ?debug=1 才顯示除錯面板
const isDebugEnabled = () => new URLSearchParams(window.location.search).get(DEBUG_QUERY_KEY) === DEBUG_QUERY_VALUE

// 只有除錯模式才允許用網址參數覆寫節奏，正式路徑一律走上面的常數
const readTiming = (key, fallback) => {
  if (!isDebugEnabled()) return fallback
  const raw = new URLSearchParams(window.location.search).get(key)
  if (raw === null || raw.length === 0) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

const createTiming = () => ({
  settle: readTiming('settle', SETTLE_TIMEOUT_MS),
  quiet: readTiming('quiet', SETTLE_QUIET_MS),
  wait: readTiming('wait', WAIT_MIN_MS),
  lead: readTiming('lead', LEAD_MS),
  hold: readTiming('hold', HOLD_MS)
})

// 讀取保存的對話歷史，格式壞掉就當作沒有
const readStoredHistory = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('對話歷史讀取失敗，改由空白開始。')
    return []
  }
}

// 保存對話歷史，只留最近幾輪
const writeStoredHistory = (messages) => {
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimHistory(messages, HISTORY_TURN_LIMIT)))
  } catch (error) {
    console.warn('對話歷史保存失敗，這一輪不會被記住。')
  }
}

// 距離上次對話過了幾分鐘；第一次使用時當作剛剛才聊過
const readMinutesSinceLastSeen = () => {
  const stored = Number(window.localStorage.getItem(LAST_SEEN_STORAGE_KEY))
  return Number.isFinite(stored) && stored > 0 ? minutesBetween(stored, Date.now()) : 0
}

// 記下這一次的對話時間
const markLastSeen = () => {
  try {
    window.localStorage.setItem(LAST_SEEN_STORAGE_KEY, String(Date.now()))
  } catch (error) {
    console.warn('上次對話時間保存失敗。')
  }
}

// 更新除錯面板：LLM 原始輸出、目前階段，以及解析出的狀態
const updateDebugPanel = () => {
  if (!isDebugEnabled() || !debugRawElement || !debugStateElement) return
  debugRawElement.textContent = runtime.rawOutput
  debugStateElement.textContent = JSON.stringify(
    {
      目前階段: runtime.phase,
      本階段已經過毫秒: runtime.phaseStartedAt > 0 ? Date.now() - runtime.phaseStartedAt : 0,
      畫面上的表情: runtime.shownEmotion,
      解析出的表情: runtime.parser?.emotion ?? EMPTY_TEXT,
      緩衝中的疑似標籤: runtime.parser?.pending ?? EMPTY_TEXT,
      已顯示字數: runtime.shownCount,
      台詞總字數: runtime.parser?.text.length ?? 0,
      表情提示: runtime.parser?.cues ?? [],
      已演掉幾個表情提示: runtime.shownCues,
      節奏參數: runtime.timing
    },
    null,
    2
  )
}

// 進入下一個階段，順便把計時起點歸零
const setPhase = (next) => {
  runtime.phase = next
  runtime.phaseStartedAt = Date.now()
  updateDebugPanel()
}

// 統一從這裡換臉，順便記下畫面上真正看得到的表情
const showEmotion = (emotion) => {
  runtime.shownEmotion = emotion
  runtime.renderer.setEmotion(emotion)
}

// 逐字逐到第幾個字，就把該位置以前的表情提示一次演掉。
// 表情跟著字走而不是跟著解析走，所以網路快慢不會改變演出：
// 標籤寫在哪一句前面，那張臉就正好在唸到那一句的時候換上。
const applyCuesUpTo = (count) => {
  cuesReadyAt(runtime.parser, count, runtime.shownCues).forEach((cue) => {
    showEmotion(cue.emotion)
    runtime.shownCues += 1
  })
}

const startTypewriter = () => {
  if (runtime.timerId !== 0) return
  runtime.timerId = window.setInterval(revealNextCharacter, TYPEWRITER_INTERVAL_MS)
}

const stopTypewriter = () => {
  window.clearInterval(runtime.timerId)
  runtime.timerId = 0
}

// 上一輪留下來的計時器一律清乾淨，免得打到這一輪
const clearPendingTimers = () => {
  stopTypewriter()
  window.clearTimeout(runtime.leadTimerId)
  runtime.leadTimerId = 0
  window.clearTimeout(runtime.holdTimerId)
  runtime.holdTimerId = 0
}

// 收合或展開右側工具列。開關自己會留在原地（縮小變淡），再按一次就還原。
const toggleTools = () => {
  const folded = toolsElement.classList.toggle(FOLDED_CLASS)
  toolsToggleButton.textContent = folded ? UNFOLD_GLYPH : FOLD_GLYPH
  toolsToggleButton.setAttribute(ARIA_LABEL, folded ? UNFOLD_LABEL : FOLD_LABEL)
}

// 把一則訊息畫成一個聊天氣泡；你說的靠右，她說的靠左
const createLogRow = (item) => {
  const row = document.createElement(DIV_TAG)
  row.className = item?.role === USER_ROLE ? `${LOG_ROW_CLASS} ${MINE_CLASS}` : LOG_ROW_CLASS
  const bubble = document.createElement(DIV_TAG)
  bubble.className = LOG_BUBBLE_CLASS
  // 一律走 textContent，對話內容不會被當成標記解讀
  bubble.textContent = item.content
  row.appendChild(bubble)
  return row
}

// 重畫整份對話紀錄。資料直接用 runtime.history，它本來就已經是最近 20 輪。
const renderLog = () => {
  logListElement.textContent = EMPTY_TEXT
  const rows = runtime.history.filter((item) => typeof item?.content === 'string' && item.content.length > 0)
  // 沒有對話就沒東西可匯出，按鈕跟著畫面一起更新
  logExportButton.disabled = rows.length === 0
  if (rows.length === 0) {
    const hint = document.createElement(PARAGRAPH_TAG)
    hint.className = LOG_EMPTY_CLASS
    hint.textContent = EMPTY_LOG_TEXT
    logListElement.appendChild(hint)
    return
  }
  rows.forEach((item) => logListElement.appendChild(createLogRow(item)))
  // 跟聊天軟體一樣，打開就停在最新的一則
  logListElement.scrollTop = logListElement.scrollHeight
}

// 讀取存在瀏覽器裡的密鑰；沒有就當作空字串，後端會直接回 401
const readStoredSecret = () => {
  try {
    return window.localStorage.getItem(SECRET_STORAGE_KEY) ?? EMPTY_TEXT
  } catch (error) {
    console.warn('密鑰讀取失敗，這一輪會被擋下來。')
    return EMPTY_TEXT
  }
}

// 存下密鑰；失敗就當作沒存，下一次還會再問一次
const writeStoredSecret = (value) => {
  try {
    window.localStorage.setItem(SECRET_STORAGE_KEY, value)
  } catch (error) {
    console.warn('密鑰保存失敗，重新整理之後要再輸入一次。')
  }
}

// 密鑰被拒絕時整把丟掉，不留下一把用不了的舊密鑰
const clearStoredSecret = () => {
  try {
    window.localStorage.removeItem(SECRET_STORAGE_KEY)
  } catch (error) {
    console.warn('密鑰清除失敗。')
  }
}

const openSecret = (note) => {
  secretNoteElement.textContent = note ?? EMPTY_TEXT
  secretElement.classList.add(OPEN_CLASS)
  secretElement.setAttribute(ARIA_HIDDEN, FALSE_TEXT)
}

const closeSecret = () => {
  secretElement.classList.remove(OPEN_CLASS)
  secretElement.setAttribute(ARIA_HIDDEN, TRUE_TEXT)
}

// 後端說未授權：把舊密鑰丟掉，抽屜重新打開讓使用者再輸入一次
const handleUnauthorized = () => {
  clearStoredSecret()
  secretInputElement.value = EMPTY_TEXT
  openSecret(SECRET_REJECTED_TEXT)
}

const handleSecretSubmit = (event) => {
  event.preventDefault()
  const value = secretInputElement.value.trim()
  if (value.length === 0) return
  writeStoredSecret(value)
  secretInputElement.value = EMPTY_TEXT
  secretNoteElement.textContent = SECRET_SAVED_TEXT
  closeSecret()
}

// 所有對自家 Worker 的請求都從這裡出去：統一帶密鑰，統一處理 401。
// 回傳 null 代表這一次不用再往下做了（密鑰被拒或連線失敗）。
const callApi = async (url, options) => {
  try {
    const response = await fetch(url, {
      ...options,
      headers: { 'content-type': 'application/json', [SECRET_HEADER]: readStoredSecret(), ...options?.headers }
    })
    if (response.status === UNAUTHORIZED_STATUS) {
      handleUnauthorized()
      return null
    }
    return response
  } catch (error) {
    console.warn('請求送不出去。')
    return null
  }
}

// 把小檔案的狀態畫到抽屜上
const renderPersona = (body) => {
  personaTextElement.value = String(body?.text ?? EMPTY_TEXT)
  personaErrorsElement.textContent = EMPTY_TEXT
  personaStateElement.textContent = body?.isDefault ? PERSONA_DEFAULT_TEXT : PERSONA_SAVED_PREFIX + String(body?.updatedAt ?? EMPTY_TEXT)
}

const closePersona = () => {
  personaElement.classList.remove(OPEN_CLASS)
  personaElement.setAttribute(ARIA_HIDDEN, TRUE_TEXT)
}

// 打開之前先去後端拿現在生效的那一份，免得看到的是上次的內容
const openPersona = async () => {
  personaElement.classList.add(OPEN_CLASS)
  personaElement.setAttribute(ARIA_HIDDEN, FALSE_TEXT)
  const response = await callApi(PERSONA_URL, { method: 'GET' })
  if (!response || !response.ok) {
    personaStateElement.textContent = PERSONA_LOAD_FAILED_TEXT
    return
  }
  renderPersona(await response.json())
}

// 存檔成功之後問一次要不要清對話。
// 刻意不清 companion:lastSeenAt：時間差開場的語氣不該被這件事重設。
const askToClearHistory = () => {
  if (!window.confirm(PERSONA_CLEAR_QUESTION)) return
  runtime.history = []
  writeStoredHistory(runtime.history)
  refreshLogIfOpen()
}

const savePersona = async () => {
  personaErrorsElement.textContent = EMPTY_TEXT
  const response = await callApi(PERSONA_URL, { method: 'PUT', body: JSON.stringify({ text: personaTextElement.value }) })
  if (!response) return
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    // 驗證沒過：把後端給的每一條理由原樣列出來，使用者才知道要補哪裡
    personaErrorsElement.textContent = Array.isArray(body?.errors) ? body.errors.join(ERROR_JOIN) : PERSONA_SAVE_FAILED_TEXT
    return
  }
  personaStateElement.textContent = PERSONA_SAVED_PREFIX + String(body?.updatedAt ?? EMPTY_TEXT)
  closePersona()
  askToClearHistory()
}

// 一鍵還原：把存檔刪掉，抽屜裡直接換回預設那一份
const resetPersona = async () => {
  const response = await callApi(PERSONA_URL, { method: 'DELETE' })
  if (!response || !response.ok) {
    personaErrorsElement.textContent = PERSONA_SAVE_FAILED_TEXT
    return
  }
  renderPersona(await response.json())
}

// 一行用量要顯示成什麼樣子。
// used 是 null 代表這一項量不到，limit 是 null 代表使用者還沒去查官方數字，
// 兩種都不自行湊數字出來。
const describeUsage = (item) => {
  if (!item || item.used === null) return USAGE_UNMEASURED_TEXT
  if (item.limit === null) return `${item.used}（上限${USAGE_UNSET_TEXT}）`
  return `${item.used} / ${item.limit}（${item.percent}%）`
}

// 超過警戒比例就標出來，讓數字自己跳出來提醒
const isWarning = (item, warnAtPercent) =>
  Boolean(item) && item.percent !== null && typeof warnAtPercent === 'number' && item.percent >= warnAtPercent

// 畫一行「項目：數字」
const createUsageRow = (label, value, warn) => {
  const row = document.createElement(DIV_TAG)
  row.className = warn ? `${USAGE_ROW_CLASS} ${USAGE_WARN_CLASS}` : USAGE_ROW_CLASS
  const name = document.createElement(SPAN_TAG)
  name.className = USAGE_LABEL_CLASS
  name.textContent = label
  const amount = document.createElement(SPAN_TAG)
  amount.className = USAGE_VALUE_CLASS
  amount.textContent = value
  row.appendChild(name)
  row.appendChild(amount)
  return row
}

const renderUsage = (body) => {
  usageListElement.textContent = EMPTY_TEXT
  USAGE_ROWS.forEach((row) => {
    usageListElement.appendChild(
      createUsageRow(row.label, describeUsage(body?.[row.key]), isWarning(body?.[row.key], body?.warnAtPercent))
    )
  })
  const tokens = Number(body?.promptTokens ?? 0) + Number(body?.outputTokens ?? 0)
  usageListElement.appendChild(createUsageRow('今日 token 累計', String(tokens), false))
  usageListElement.appendChild(createUsageRow('計數日期', String(body?.dateKey ?? EMPTY_TEXT), false))
  usageListElement.appendChild(createUsageRow('下次歸零', String(body?.resetsAt ?? EMPTY_TEXT), false))
  usageNoteElement.textContent = USAGE_ESTIMATED_TEXT
}

// 依內容把輸入框調到剛好的高度。先歸零再量，否則縮短時量到的是舊高度。
// 上限與捲動交給 CSS 的 max-height 與 overflow-y，這裡只管算。
const resizeInput = () => {
  inputElement.style.height = AUTO_HEIGHT
  // box-sizing 是 border-box，而 scrollHeight 不含框線。
  // 直接拿 scrollHeight 當高度會少掉上下框線那幾個像素，文字就被切掉一截，
  // 而且 scrollHeight 永遠大於 clientHeight，捲軸會一直在。把框線補回去。
  const borders = inputElement.offsetHeight - inputElement.clientHeight
  inputElement.style.height = inputElement.scrollHeight + borders + PIXEL_UNIT
}

// 桌機上 Enter 送出、Shift+Enter 換行，是聊天介面的慣例；
// 手機沒有 Shift 可按，所以 Enter 一律換行，送出交給旁邊那顆按鈕。
const isKeyboardSend = () => window.matchMedia(FINE_POINTER_QUERY).matches

// 中文輸入法選字時也會按 Enter，那一下是確認候選字，不是要送出。
// isComposing 為真就直接放行，否則打中文會變成每選一次字就送出一次。
const handleInputKeydown = (event) => {
  if (event.key !== ENTER_KEY || event.shiftKey || event.isComposing) return
  if (!isKeyboardSend()) return
  handleSubmit(event)
}

// 把字數畫到輸入框旁邊。
// 平常留白：沒必要一直用一個數字提醒你還能打多少字。
// 接近上限（config/message.json 的 warnAtPercent）才顯示，超過就變色並擋下送出。
const refreshCount = () => {
  const state = describeMessage(inputElement.value, runtime.messageSchema)
  countElement.textContent = state.isWarning ? state.used + COUNT_SEPARATOR + state.max : EMPTY_TEXT
  countElement.classList.toggle(OVER_CLASS, state.isOver)
  // 串流中本來就是停用的，這裡不要把它打開
  if (!runtime.streaming) sendButton.disabled = !isMessageAcceptable(inputElement.value, runtime.messageSchema)
}

// 一張卡：kind 代號、她會講的那句話，以及觸發條件、日誌長相與該怎麼辦。
// 台詞來自 fallback-lines.json、說明來自 failure-guide.json，
// 這支一句都不寫死（架構約束 A7）。
const createReplyCard = (kind, entry, guide) => {
  const card = document.createElement(DIV_TAG)
  card.className = REPLY_CARD_CLASS
  const code = document.createElement(SPAN_TAG)
  code.className = REPLY_KIND_CLASS
  code.textContent = kind
  const line = document.createElement(PARAGRAPH_TAG)
  line.className = REPLY_LINE_CLASS
  line.textContent = String(entry?.text ?? EMPTY_TEXT)
  const meta = document.createElement(PARAGRAPH_TAG)
  meta.className = REPLY_META_CLASS
  meta.textContent = TRIGGER_PREFIX + String(guide?.trigger ?? EMPTY_TEXT)
  const detail = document.createElement(PARAGRAPH_TAG)
  detail.className = REPLY_META_CLASS
  detail.textContent = DETAIL_PREFIX + String(guide?.detail ?? EMPTY_TEXT)
  const retry = document.createElement(PARAGRAPH_TAG)
  retry.className = REPLY_META_CLASS
  retry.textContent = RETRY_PREFIX + String(guide?.retry ?? EMPTY_TEXT)
  card.append(code, line, meta, detail, retry)
  return card
}

const closeReplies = () => {
  repliesElement.classList.remove(OPEN_CLASS)
  repliesElement.setAttribute(ARIA_HIDDEN, TRUE_TEXT)
}

// 對照表就是設定檔本身，所以每次打開都重讀，改了設定不必重新整理
const openReplies = async () => {
  repliesElement.classList.add(OPEN_CLASS)
  repliesElement.setAttribute(ARIA_HIDDEN, FALSE_TEXT)
  repliesListElement.textContent = EMPTY_TEXT
  try {
    // 兩份設定分開放：台詞是角色的內容，說明是給你查問題用的，各自獨立
    const [linesResponse, guideResponse] = await Promise.all([fetch(FALLBACK_LINES_URL), fetch(FAILURE_GUIDE_URL)])
    if (!linesResponse.ok || !guideResponse.ok) throw new Error(REPLIES_LOAD_FAILED_TEXT)
    const lines = (await linesResponse.json())?.lines ?? {}
    const guide = (await guideResponse.json())?.guide ?? {}
    Object.keys(lines).forEach((kind) =>
      repliesListElement.appendChild(createReplyCard(kind, lines[kind], guide[kind]))
    )
    repliesNoteElement.textContent = REPLIES_NOTE_TEXT
  } catch (error) {
    repliesNoteElement.textContent = REPLIES_LOAD_FAILED_TEXT
  }
}

const closeUsage = () => {
  usageElement.classList.remove(OPEN_CLASS)
  usageElement.setAttribute(ARIA_HIDDEN, TRUE_TEXT)
}

// 每次打開都重新去要一次，面板上不會留著上一次的舊數字
const openUsage = async () => {
  usageElement.classList.add(OPEN_CLASS)
  usageElement.setAttribute(ARIA_HIDDEN, FALSE_TEXT)
  const response = await callApi(USAGE_URL, { method: 'GET' })
  if (!response || !response.ok) {
    usageListElement.textContent = EMPTY_TEXT
    usageNoteElement.textContent = USAGE_LOAD_FAILED_TEXT
    return
  }
  renderUsage(await response.json())
}

const isLogOpen = () => logElement.classList.contains(OPEN_CLASS)

// 抽屜開著的時候對話有進展，就順手重畫，免得看到的是舊的
const refreshLogIfOpen = () => {
  if (isLogOpen()) renderLog()
}

const openLog = () => {
  renderLog()
  logElement.classList.add(OPEN_CLASS)
  logElement.setAttribute(ARIA_HIDDEN, FALSE_TEXT)
}

const closeLog = () => {
  logElement.classList.remove(OPEN_CLASS)
  logElement.setAttribute(ARIA_HIDDEN, TRUE_TEXT)
}

// 把文字稿交給瀏覽器下載。
// 連結要真的掛進畫面才按得動——手機 Safari 對著游離的連結按不會有反應；
// 臨時網址則要等下載真的開始才撤，撤太早同樣是一場空。
const downloadText = (text, filename) => {
  const url = URL.createObjectURL(new Blob([text], { type: TRANSCRIPT_MIME }))
  const anchor = document.createElement(ANCHOR_TAG)
  anchor.href = url
  anchor.setAttribute(DOWNLOAD_ATTRIBUTE, filename)
  anchor.hidden = true
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

// 匯出對話紀錄成 .txt：存的就是抽屜裡看得到的那幾輪，不多也不少。
// 整份文字稿怎麼排由 core/transcript.js 決定，這裡只負責存檔這件事。
const exportLog = () => {
  const text = formatTranscript(runtime.history, TRANSCRIPT_LABELS)
  if (text.length === 0) return
  downloadText(text, buildTranscriptFilename(new Date()))
}

// 這一輪的回覆存進歷史
const saveReply = () => {
  const reply = runtime.parser.text.trim()
  if (reply.length === 0) return
  runtime.history = trimHistory([...runtime.history, { role: REPLY_ROLE, content: reply }], HISTORY_TURN_LIMIT)
  writeStoredHistory(runtime.history)
  refreshLogIfOpen()
}

// 逐字一結束就把輸入交還給使用者，不等表情停留跑完，所以停留時間不會讓對話變慢。
// 這裡刻意不呼叫 focus()：送出時特地收了鍵盤，這時再叫回來版面會在最該看的瞬間再跳一次。
const releaseInput = () => {
  runtime.streaming = false
  sendButton.disabled = false
  inputElement.disabled = false
}

// 表情停留夠久了，交叉淡回待機表情
const returnToIdle = () => {
  runtime.holdTimerId = 0
  showEmotion(runtime.config.defaultEmotion)
  setPhase(PHASE_IDLE)
}

// 台詞說完之後讓表情原封不動留一段時間，這段時間輸入框已經可以用了
const beginHold = () => {
  setPhase(PHASE_HOLDING)
  runtime.holdTimerId = window.setTimeout(returnToIdle, runtime.timing.hold)
}

// 逐字顯示：一次只放一個字，讓台詞跟著串流慢慢長出來
const revealNextCharacter = () => {
  const target = runtime.parser?.text ?? EMPTY_TEXT
  if (runtime.shownCount < target.length) {
    runtime.shownCount += 1
    lineElement.textContent = target.slice(0, runtime.shownCount)
    applyCuesUpTo(runtime.shownCount)
    updateDebugPanel()
    return
  }
  if (!runtime.streamEnded) return
  // 串流結束：finalize 會把沒閉合的疑似標籤補回台詞，那幾個字也要逐字吐完才算追平。
  // 它同時會把表情重設為預設值，這裡只採用它整理好的台詞，
  // 畫面上的表情要留到停留時間結束，才由 returnToIdle 換回去。
  if (!runtime.finalized) {
    runtime.finalized = true
    runtime.parser = finalize(runtime.parser, runtime.config.defaultEmotion)
    saveReply()
    releaseInput()
    updateDebugPanel()
    return
  }
  // 逐字已經追平，剩下沒演到的表情提示（例如標籤就寫在整段話最後面）在這裡補完，
  // 否則它會卡在 cues 裡等一個永遠不會再來的字。
  applyCuesUpTo(runtime.shownCount)
  stopTypewriter()
  beginHold()
}

const beginSpeaking = () => {
  runtime.leadTimerId = 0
  setPhase(PHASE_SPEAKING)
  startTypewriter()
}

// 先只換臉、空一拍再吐字。這一拍畫面上沒有別的東西可看，視線自然會被拉到角色身上。
// 這裡只能採用「第一個字」的表情，不能用 parser.emotion——串流常常在這一刻就整段收完了，
// 拿最後的表情等於把後面的臉全部提前演掉，中間那幾張根本不會出現。
const revealFaceThenSpeak = () => {
  runtime.faceShown = true
  showEmotion(runtime.config.defaultEmotion)
  applyCuesUpTo(0) // 開頭就有標籤的話，這一步會蓋掉上一行的預設表情
  runtime.leadTimerId = window.setTimeout(beginSpeaking, runtime.timing.lead)
}

// 等待期間的表情要先活滿最短時間，不足的部分在這裡補等
const beginLead = () => {
  const remaining = Math.max(0, runtime.timing.wait - (Date.now() - runtime.phaseStartedAt))
  setPhase(PHASE_LEADING)
  runtime.leadTimerId = window.setTimeout(revealFaceThenSpeak, remaining)
}

// 回覆是否真的開始了：已經解析出表情提示，或第一個字已經吐出來
// 在這之前要維持等待期間的表情，否則收到半截標籤時會先閃一下預設表情
const replyHasStarted = () => runtime.parser.text.length > 0 || runtime.parser.cues.length > 0

// 可以離開等待階段的條件；串流結束也算，空回覆才不會卡住不收尾
const canLeaveWaiting = () => replyHasStarted() || runtime.streamEnded

// 每次狀態有變動就問一次：該不該推進到下一階段
const maybeAdvance = () => {
  if (runtime.phase === PHASE_WAITING && canLeaveWaiting()) {
    beginLead()
    return
  }
  // 臉露過之後就不在這裡換了：新解析到的標籤只是排進 cues，
  // 由逐字迴圈逐到它的位置時才演，解析比逐字快多少都不影響演出。
}

// 收到一段新的文字：先解析，再看要不要推進階段
const applyPiece = (piece) => {
  runtime.rawOutput += piece
  runtime.parser = feedChunk(runtime.parser, piece, runtime.config.emotionMap, runtime.config.defaultEmotion)
  maybeAdvance()
  updateDebugPanel()
}

// 串流收完了；可能發生在版面還沒回穩的時候，所以一律再問一次要不要推進
const noteStreamEnded = () => {
  runtime.streamEnded = true
  maybeAdvance()
}

// 撤回：把這一輪已經演出去的東西整個倒帶，回到「等待回覆」重演一次。
// 用在「半句話說到一半被砍掉」的情況，總不能半句話後面直接接一句別的。
const retractReply = () => {
  clearPendingTimers()
  runtime.parser = createParserState(runtime.config.defaultEmotion)
  runtime.shownCount = 0
  runtime.shownCues = 0
  runtime.finalized = false
  runtime.faceShown = false
  runtime.rawOutput = EMPTY_TEXT
  lineElement.textContent = EMPTY_TEXT
  setPhase(PHASE_WAITING)
  showEmotion(runtime.config.thinkingEmotion)
}

// 收到 fallback：需要的話先清畫面，再把那句話當成一般台詞演完。
// 台詞本身帶著表情標籤，所以照既有那條路走就會換上對的臉。
const applyFallback = (payload) => {
  if (payload?.retract === true) retractReply()
  applyPiece(String(payload?.text ?? EMPTY_TEXT))
}

// 處理一則 SSE 事件
const handleEvent = (data) => {
  try {
    const payload = JSON.parse(data)
    if (payload?.type === DELTA_EVENT) applyPiece(String(payload.text ?? EMPTY_TEXT))
    if (payload?.type === FALLBACK_EVENT) applyFallback(payload)
    if (payload?.type === ERROR_EVENT) applyPiece(String(payload.message ?? NETWORK_ERROR_TEXT))
    if (payload?.type === DONE_EVENT) noteStreamEnded()
  } catch (error) {
    console.warn('收到無法解析的串流事件，已略過。')
  }
}

// 讀完整條回應串流
const consumeStream = async (response) => {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = EMPTY_TEXT
  let reading = true
  while (reading) {
    const { value, done } = await reader.read()
    if (done) {
      reading = false
      continue
    }
    buffer += decoder.decode(value, { stream: true })
    const parsed = extractSseEvents(buffer)
    buffer = parsed.rest
    parsed.events.forEach(handleEvent)
  }
  noteStreamEnded()
}

// 鍵盤是否真的佔住了畫面；桌機或沒彈鍵盤時不必等版面回穩
const isViewportShrunk = () => {
  const viewport = window.visualViewport
  return Boolean(viewport) && viewport.height < window.innerHeight - VIEWPORT_SHRINK_TOLERANCE
}

// 等版面降回原處：視窗連續一小段時間沒再變動就算穩了，另設上限避免永遠等下去
const waitForLayoutSettle = () =>
  new Promise((resolve) => {
    const viewport = window.visualViewport
    if (!isViewportShrunk()) {
      resolve()
      return
    }
    let quietTimerId = 0
    let limitTimerId = 0
    const finish = () => {
      window.clearTimeout(quietTimerId)
      window.clearTimeout(limitTimerId)
      viewport.removeEventListener('resize', onResize)
      resolve()
    }
    const onResize = () => {
      window.clearTimeout(quietTimerId)
      quietTimerId = window.setTimeout(finish, runtime.timing.quiet)
    }
    viewport.addEventListener('resize', onResize)
    limitTimerId = window.setTimeout(finish, runtime.timing.settle)
  })

// 版面穩了才換上等待期間的表情，這樣它不會在畫面正在收縮時出現
const beginWaiting = () => {
  setPhase(PHASE_WAITING)
  showEmotion(runtime.config.thinkingEmotion)
  // 回穩期間可能已經收到片段甚至整段收完了，這裡補問一次，才不會卡在等待階段
  maybeAdvance()
}

// 送出請求並接上串流；失敗時把錯誤訊息當成台詞演完
const requestReply = async (text, minutesSinceLastSeen) => {
  try {
    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SECRET_HEADER]: readStoredSecret() },
      body: JSON.stringify({ message: text, history: runtime.history, minutesSinceLastSeen })
    })
    // 密鑰不對就別演了，直接把輸入抽屜叫回來，免得使用者一直對著空畫面重送
    if (response.status === UNAUTHORIZED_STATUS) {
      handleUnauthorized()
      applyPiece(SECRET_BLOCKED_TEXT)
      noteStreamEnded()
      return
    }
    if (!response.ok || !response.body) throw new Error(`服務回應狀態 ${response.status}`)
    await consumeStream(response)
  } catch (error) {
    console.warn('對話請求失敗。')
    applyPiece(NETWORK_ERROR_TEXT)
    noteStreamEnded()
  }
}

// 送出一句話：請求先走，版面先穩，然後才開始演
const sendMessage = async (text) => {
  clearPendingTimers()
  runtime.streaming = true
  runtime.streamEnded = false
  runtime.finalized = false
  runtime.faceShown = false
  runtime.rawOutput = EMPTY_TEXT
  runtime.shownCount = 0
  runtime.shownCues = 0
  runtime.parser = createParserState(runtime.config.defaultEmotion)
  lineElement.textContent = EMPTY_TEXT
  echoElement.textContent = text
  sendButton.disabled = true
  inputElement.disabled = true
  setPhase(PHASE_SETTLING)

  const minutesSinceLastSeen = readMinutesSinceLastSeen()
  markLastSeen()
  runtime.history = trimHistory([...runtime.history, { role: USER_ROLE, content: text }], HISTORY_TURN_LIMIT)
  writeStoredHistory(runtime.history)
  refreshLogIfOpen()

  // 請求立刻送出、串流在背景先累積，等版面回穩只是延後畫面上的第一次變化，不增加實際延遲
  const request = requestReply(text, minutesSinceLastSeen)
  await waitForLayoutSettle()
  beginWaiting()
  await request
}

// 表單送出
const handleSubmit = (event) => {
  event.preventDefault()
  const text = inputElement.value.trim()
  // 空的與超過上限的都不送。判定與計數器、後端共用 core/message.js 的同一支函式，
  // 三邊不會各算各的而對不起來。
  if (!isMessageAcceptable(text, runtime.messageSchema) || runtime.streaming) return
  inputElement.value = EMPTY_TEXT
  refreshCount()
  resizeInput()
  // 先收鍵盤，讓版面降回原處之後才開始演，跳動就不會吃掉表情
  inputElement.blur()
  sendMessage(text)
}

// 啟動：載入設定 → 疊好圖層 → 準備好輸入
const boot = async () => {
  try {
    const response = await fetch(CONFIG_URL)
    runtime.config = await response.json()
  } catch (error) {
    console.warn('設定檔載入失敗，畫面無法初始化。')
    lineElement.textContent = NETWORK_ERROR_TEXT
    return
  }
  // 字數上限單獨讀：讀不到就當作不設限，不該因為這個小檔案而讓整個畫面用不了
  try {
    runtime.messageSchema = await (await fetch(MESSAGE_SCHEMA_URL)).json()
  } catch (error) {
    console.warn('字數上限設定讀不回來，這次不設限。')
  }
  runtime.timing = createTiming()
  runtime.renderer = createRenderer(stageElement, runtime.config)
  // 圖層都擺好之後才接換裝，wearOutfit 要抓得到 renderer 建出來的 body 那一層
  setupOutfit(runtime.config)
  runtime.parser = createParserState(runtime.config.defaultEmotion)
  showEmotion(runtime.config.defaultEmotion)
  runtime.history = trimHistory(readStoredHistory(), HISTORY_TURN_LIMIT)
  formElement.addEventListener('submit', handleSubmit)
  toolsToggleButton.addEventListener('click', toggleTools)
  logOpenButton.addEventListener('click', openLog)
  logCloseButton.addEventListener('click', closeLog)
  logExportButton.addEventListener('click', exportLog)
  secretFormElement.addEventListener('submit', handleSecretSubmit)
  secretCloseButton.addEventListener('click', closeSecret)
  personaOpenButton.addEventListener('click', openPersona)
  personaCloseButton.addEventListener('click', closePersona)
  personaSaveButton.addEventListener('click', savePersona)
  personaResetButton.addEventListener('click', resetPersona)
  usageOpenButton.addEventListener('click', openUsage)
  repliesOpenButton.addEventListener('click', openReplies)
  repliesCloseButton.addEventListener('click', closeReplies)
  inputElement.addEventListener('input', refreshCount)
  inputElement.addEventListener('input', resizeInput)
  inputElement.addEventListener('keydown', handleInputKeydown)
  usageCloseButton.addEventListener('click', closeUsage)
  // 背景圖的兩個抽屜自己接自己的按鈕，開關方式與上面這幾個完全相同。
  // 不 await：背景圖讀不回來也不該擋住對話，畫面先能用再說。
  setupBackground()
  // 第一次來（或密鑰被清掉）就直接把輸入抽屜開著，不必自己去找
  refreshCount()
  resizeInput()
  if (readStoredSecret().length === 0) openSecret()
  if (isDebugEnabled()) debugElement.hidden = false
  setPhase(PHASE_IDLE)
}

boot()
