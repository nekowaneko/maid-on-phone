// Todoist 雙軌提醒核心純函式模組
// 負責 P2 早做早準備、P3 時機到提醒之資料篩選、延期計算與次數控管。
// 遵守架構約束：不連線、不讀檔、不依賴系統時鐘（架構約束 A1、A36、V24）。

// 常數定義
const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_P2_STALE_DAYS = 14
const DEFAULT_P2_INTERVAL_DAYS = 7
const DEFAULT_SNOOZE_DAYS = 7
const DEFAULT_CONTENT_MAX_CHARS = 200

/**
 * 格式化 Date 為 YYYY-MM-DD 字串（依台北時區 UTC+8）
 * @param {Date|number} date 日期物件或時間戳
 * @returns {string}
 */
export const toTaipeiDateString = (date) => {
  const d = new Date(typeof date === 'number' ? date : date.getTime())
  // 加上 8 小時毫秒以對齊台北時間
  const tpeDate = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  return tpeDate.toISOString().slice(0, 10)
}

/**
 * 將 YYYY-MM-DD 加上指定天數
 * @param {string} dateKey 基準日期 YYYY-MM-DD
 * @param {number} days 增加天數
 * @returns {string}
 */
export const addDaysToDateKey = (dateKey, days) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days, 0, 0, 0))
  return dt.toISOString().slice(0, 10)
}

/**
 * 計算兩日期字串之間的天數差距 (dateB - dateA)
 * @param {string} dateKeyA 較早日期 YYYY-MM-DD
 * @param {string} dateKeyB 較晚日期 YYYY-MM-DD
 * @returns {number}
 */
export const diffDays = (dateKeyA, dateKeyB) => {
  const [ya, ma, da] = dateKeyA.split('-').map(Number)
  const [yb, mb, db] = dateKeyB.split('-').map(Number)
  const msA = Date.UTC(ya, ma - 1, da)
  const msB = Date.UTC(yb, mb - 1, db)
  return Math.round((msB - msA) / MS_PER_DAY)
}

/**
 * 挑選符合擱置條件的 P2 任務
 * @param {Array<object>} tasks 任務清單
 * @param {string} todayKey 今日日期 YYYY-MM-DD
 * @param {number} nowMs 當前時間毫秒戳
 * @param {object} state 儲存層狀態（包含 p2SentOn 與 p2Snooze 設定）
 * @param {object} defaults 預設設定
 * @returns {object|null}
 */
export const pickP2 = (tasks, todayKey, nowMs, state = {}, defaults = {}) => {
  const intervalDays = defaults.p2IntervalDays ?? DEFAULT_P2_INTERVAL_DAYS
  const staleDays = defaults.p2StaleDays ?? DEFAULT_P2_STALE_DAYS

  const p2SentOn = state['todoist.p2SentOn']
  if (p2SentOn && diffDays(p2SentOn, todayKey) < intervalDays) {
    return null
  }

  const candidates = tasks.filter((t) => {
    if (!t || t.priority !== 3) return false
    if (t.parent_id !== null && t.parent_id !== undefined) return false

    const updatedAtMs = new Date(t.updated_at || t.added_at || 0).getTime()
    if (nowMs - updatedAtMs < staleDays * MS_PER_DAY) return false

    const snoozeUntil = state[`todoist.p2Snooze.${t.id}`]
    if (snoozeUntil && snoozeUntil > todayKey) return false

    return true
  })

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const timeA = new Date(a.updated_at || a.added_at || 0).getTime()
    const timeB = new Date(b.updated_at || b.added_at || 0).getTime()
    if (timeA !== timeB) return timeA - timeB
    return String(a.id).localeCompare(String(b.id))
  })

  return candidates[0]
}

/**
 * 挑選符合條件的 P3 任務（到期或問日期）
 * @param {Array<object>} tasks 任務清單
 * @param {string} todayKey 今日日期 YYYY-MM-DD
 * @param {object} state 儲存層狀態
 * @returns {{view: string, task: object}|null}
 */
export const pickP3 = (tasks, todayKey, state = {}) => {
  if (state['todoist.p3SentOn'] === todayKey) {
    return null
  }

  // 1. 先找「到期」任務：priority 2、due.date <= todayKey、未提醒過該到期日
  const dueCandidates = tasks.filter((t) => {
    if (!t || t.priority !== 2) return false
    if (!t.due || !t.due.date) return false
    const dueDate = t.due.date.slice(0, 10)
    if (dueDate > todayKey) return false
    if (state[`todoist.p3Reminded.${t.id}`] === dueDate) return false
    return true
  })

  if (dueCandidates.length > 0) {
    dueCandidates.sort((a, b) => {
      const dateA = a.due.date.slice(0, 10)
      const dateB = b.due.date.slice(0, 10)
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      return String(a.id).localeCompare(String(b.id))
    })
    return { view: 'p3', task: dueCandidates[0] }
  }

  // 2. 沒有到期的，找「問日期」任務：priority 2、沒有 due、不是子任務、未問過
  const askCandidates = tasks.filter((t) => {
    if (!t || t.priority !== 2) return false
    if (t.due && t.due.date) return false
    if (t.parent_id !== null && t.parent_id !== undefined) return false
    if (state[`todoist.p3Asked.${t.id}`]) return false
    return true
  })

  if (askCandidates.length > 0) {
    askCandidates.sort((a, b) => {
      const timeA = new Date(a.added_at || 0).getTime()
      const timeB = new Date(b.added_at || 0).getTime()
      if (timeA !== timeB) return timeA - timeB
      return String(a.id).localeCompare(String(b.id))
    })
    return { view: 'askDate', task: askCandidates[0] }
  }

  return null
}

/**
 * 計算回答日期的具體到期日 YYYY-MM-DD
 * @param {string} when 日期選項 ('tomorrow' | 'nextMonday' | 'nextMonth')
 * @param {string} todayKey 今日日期 YYYY-MM-DD
 * @returns {string}
 */
export const setDateFor = (when, todayKey) => {
  if (when === 'tomorrow') {
    return addDaysToDateKey(todayKey, 1)
  }

  if (when === 'nextMonday') {
    // 明天起算的第一個星期一（若今天是週一，則算下週一）
    let offset = 1
    while (true) {
      const candidateKey = addDaysToDateKey(todayKey, offset)
      const [y, m, d] = candidateKey.split('-').map(Number)
      const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
      if (dayOfWeek === 1) {
        return candidateKey
      }
      offset += 1
    }
  }

  if (when === 'nextMonth') {
    // 下個月 1 號
    const [y, m] = todayKey.split('-').map(Number)
    let nextY = y
    let nextM = m + 1
    if (nextM > 12) {
      nextY += 1
      nextM = 1
    }
    const monthStr = String(nextM).padStart(2, '0')
    return `${nextY}-${monthStr}-01`
  }

  throw new Error(`不支援的日期選項: ${when}`)
}

/**
 * 驗證拆步驟之結果陣列
 * @param {any} steps 步驟陣列
 * @returns {{valid: boolean, steps: Array<string>}}
 */
export const validateSplitSteps = (steps) => {
  if (!Array.isArray(steps)) {
    return { valid: false, steps: [] }
  }
  if (steps.length < 2 || steps.length > 3) {
    return { valid: false, steps: [] }
  }

  const cleaned = []
  for (const item of steps) {
    if (typeof item !== 'string') {
      return { valid: false, steps: [] }
    }
    const trimmed = item.trim()
    if (trimmed.length === 0 || trimmed.length > 100) {
      return { valid: false, steps: [] }
    }
    cleaned.push(trimmed)
  }

  return { valid: true, steps: cleaned }
}

/**
 * 驗證 Todoist 動作請求內容
 * @param {object} body 請求主體
 * @param {object} contract 契約物件
 * @returns {{valid: boolean, error?: string}}
 */
export const validateTodoistAction = (body, contract) => {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '請求主體必須為物件' }
  }

  const { action, taskId, view, when, content, steps } = body

  if (!contract.actions?.sent?.includes(action)) {
    return { valid: false, error: `不合法的動作: ${action}` }
  }

  const idPattern = new RegExp(contract.taskIdPattern || '^[0-9A-Za-z_]{1,64}$')
  if (typeof taskId !== 'string' || !idPattern.test(taskId)) {
    return { valid: false, error: `不合法的任務編號: ${taskId}` }
  }

  if (action === 'doToday') {
    if (view !== 'p2' && view !== 'p3') {
      return { valid: false, error: 'view 必須為 p2 或 p3' }
    }
  }

  if (action === 'setDate') {
    if (!contract.setDateWhen?.includes(when)) {
      return { valid: false, error: `when 必須在 setDateWhen 清單內: ${when}` }
    }
  }

  if (action === 'split') {
    const maxChars = contract.contentMaxChars ?? DEFAULT_CONTENT_MAX_CHARS
    if (typeof content !== 'string') {
      return { valid: false, error: 'content 必須為字串' }
    }
    const trimmed = content.trim()
    if (trimmed.length === 0 || Array.from(trimmed).length > maxChars) {
      return { valid: false, error: 'content 長度不符' }
    }
  }

  if (action === 'confirmSplit') {
    const splitValidation = validateSplitSteps(steps)
    if (!splitValidation.valid) {
      return { valid: false, error: 'steps 必須為 2～3 個合格步驟' }
    }
  }

  return { valid: true }
}
