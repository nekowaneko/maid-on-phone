// Todoist 雙軌提醒核心純函式模組
// 負責 P2 早做早準備、P3 時機到提醒之資料篩選、延期計算與次數控管。
// 遵守架構約束：不連網、不讀檔、純函式設計。

// 常數定義
const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_P2_STALE_DAYS = 14
const DEFAULT_SNOOZE_DAYS = 7
const DAILY_MAX_SPEECH_COUNT = 2

/**
 * 檢查任務是否符合 P2 擱置條件
 * @param {object} task Todoist 任務物件
 * @param {number} nowMs 當前毫秒時間戳
 * @param {number} staleDays 門檻天數（預設 14）
 * @returns {boolean}
 */
export const isP2Stale = (task, nowMs, staleDays = DEFAULT_P2_STALE_DAYS) => {
  if (!task || task.priority !== 3) return false // Todoist API: Priority 3 即 P2
  if (task.completed) return false
  if (task.snoozedUntil && new Date(task.snoozedUntil).getTime() > nowMs) return false
  
  const lastUpdated = new Date(task.updated_at || task.created_at || 0).getTime()
  return (nowMs - lastUpdated) >= staleDays * MS_PER_DAY
}

/**
 * 從多個 P2 擱置任務中選出擱置最久的一件（每週最多提一件）
 * @param {Array<object>} tasks 任務列表
 * @param {number} nowMs 當前毫秒時間戳
 * @param {string|null} lastRemindedDate 上次提醒日期 (YYYY-MM-DD)
 * @param {string} todayDate 今日日期 (YYYY-MM-DD)
 * @returns {object|null}
 */
export const pickP2TaskToRemind = (tasks, nowMs, lastRemindedDate, todayDate) => {
  // 如果 7 天內已經提過或本週已提過，則跳過
  if (lastRemindedDate) {
    const diffDays = (new Date(todayDate).getTime() - new Date(lastRemindedDate).getTime()) / MS_PER_DAY
    if (diffDays < DEFAULT_SNOOZE_DAYS) return null
  }

  const staleCandidates = tasks.filter(t => isP2Stale(t, nowMs))
  if (staleCandidates.length === 0) return null

  // 排序找出最後修改時間最早（擱置最久）的那件
  return staleCandidates.sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime()
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime()
    return timeA - timeB
  })[0]
}

/**
 * 計算延後一週後的 ISO 日期時間字串
 * @param {number} nowMs 當前時間戳
 * @param {number} days 延後天數
 * @returns {string} ISO 字串
 */
export const calculateSnoozeTime = (nowMs, days = DEFAULT_SNOOZE_DAYS) => {
  return new Date(nowMs + days * MS_PER_DAY).toISOString()
}

/**
 * 判斷 P3 任務是否應該在今天提醒
 * @param {object} task Todoist 任務物件
 * @param {string} todayDate 今日日期 YYYY-MM-DD
 * @returns {boolean}
 */
export const isP3DueToday = (task, todayDate) => {
  if (!task || task.priority !== 2) return false // Todoist API: Priority 2 即 P3
  if (task.completed) return false
  if (!task.due_date) return false
  return task.due_date === todayDate
}

/**
 * 判斷未設定日期的 P3 是否需要詢問（每件只問一次）
 * @param {object} task Todoist 任務物件
 * @returns {boolean}
 */
export const shouldAskP3Date = (task) => {
  if (!task || task.priority !== 2) return false
  if (task.completed) return false
  if (task.due_date) return false
  return !task.has_asked_date
}

/**
 * 判斷當天選「今天做」但晚上 21:00 仍未完成之追問條件
 * @param {object} task 任務紀錄
 * @param {boolean} isCompleted 是否已完成
 * @returns {boolean}
 */
export const shouldFollowupP3Night = (task, isCompleted) => {
  if (!task || task.action !== 'do_today') return false
  return !isCompleted
}

/**
 * 檢查當日提醒出聲次數是否達到上限（每天最多 2 次）
 * @param {number} currentSpeechCount 當日已出聲次數
 * @returns {boolean}
 */
export const canSpeakToday = (currentSpeechCount) => {
  return currentSpeechCount < DAILY_MAX_SPEECH_COUNT
}

/**
 * 驗證 LLM 產生的拆解子步驟格式
 * @param {object} parsedJson LLM 解析出的物件
 * @returns {{valid: boolean, steps: Array<string>}}
 */
export const validateSplitSteps = (parsedJson) => {
  if (!parsedJson || !Array.isArray(parsedJson.steps)) {
    return { valid: false, steps: [] }
  }
  const cleanSteps = parsedJson.steps
    .filter(s => typeof s === 'string' && s.trim().length > 0)
    .map(s => s.trim())
  if (cleanSteps.length < 2 || cleanSteps.length > 5) {
    return { valid: false, steps: [] }
  }
  return { valid: true, steps: cleanSteps }
}
