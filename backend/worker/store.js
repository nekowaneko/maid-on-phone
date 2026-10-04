// D1 儲存層：全專案唯一允許碰 env.DB 的檔案（架構約束 A6）。
// 其餘檔案一律經過 createStore 回傳的介面，所以路由層可以在記憶體儲存層下
// 被完整測試，不需要 D1、也不需要 wrangler。
//
// 遞增一律用 SQLite 的 UPSERT，不做「先讀再寫」：那會有競態，
// 兩個請求同時進來就會少算一次。

// 常數定義
const REQUEST_RETENTION_MS = 120000 // 請求時間戳保留兩分鐘，只夠算每分鐘請求數
const EMPTY_DAILY = { requests: 0, promptTokens: 0, outputTokens: 0 }
const READ_SETTING_SQL = 'SELECT value FROM settings WHERE key = ?1'
const WRITE_SETTING_SQL = `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
const DELETE_SETTING_SQL = 'DELETE FROM settings WHERE key = ?1'
const COUNT_REQUEST_SQL = `INSERT INTO daily_usage (date, requests) VALUES (?1, 1)
ON CONFLICT(date) DO UPDATE SET requests = requests + 1`
const ADD_TOKENS_SQL = `INSERT INTO daily_usage (date, prompt_tokens, output_tokens) VALUES (?1, ?2, ?3)
ON CONFLICT(date) DO UPDATE SET prompt_tokens = prompt_tokens + ?2, output_tokens = output_tokens + ?3`
const READ_DAILY_SQL = 'SELECT requests, prompt_tokens, output_tokens FROM daily_usage WHERE date = ?1'
// 同一毫秒進來兩次就只記一次：ts 是主鍵，這裡選擇不讓它炸開。
// 每分鐘請求數本來就是估計值，少算一次遠好過整個請求失敗。
const LOG_REQUEST_SQL = 'INSERT INTO request_log (ts) VALUES (?1) ON CONFLICT(ts) DO NOTHING'
const COUNT_SINCE_SQL = 'SELECT COUNT(*) AS total FROM request_log WHERE ts > ?1'
const PRUNE_REQUEST_SQL = 'DELETE FROM request_log WHERE ts <= ?1'

// 功能函數定義

export const createStore = (env) => {
  const db = env.DB

  const pruneRequests = async (beforeMs) => {
    await db.prepare(PRUNE_REQUEST_SQL).bind(beforeMs).run()
  }

  return {
    readSetting: async (key) => {
      const row = await db.prepare(READ_SETTING_SQL).bind(key).first()
      return typeof row?.value === 'string' ? row.value : null
    },
    writeSetting: async (key, value) => {
      await db.prepare(WRITE_SETTING_SQL).bind(key, value, new Date().toISOString()).run()
    },
    deleteSetting: async (key) => {
      await db.prepare(DELETE_SETTING_SQL).bind(key).run()
    },
    recordRequest: async (dateKey, nowMs) => {
      await db.prepare(COUNT_REQUEST_SQL).bind(dateKey).run()
      await db.prepare(LOG_REQUEST_SQL).bind(nowMs).run()
      await pruneRequests(nowMs - REQUEST_RETENTION_MS)
    },
    addTokens: async (dateKey, promptTokens, outputTokens) => {
      await db.prepare(ADD_TOKENS_SQL).bind(dateKey, Number(promptTokens) || 0, Number(outputTokens) || 0).run()
    },
    readDaily: async (dateKey) => {
      const row = await db.prepare(READ_DAILY_SQL).bind(dateKey).first()
      if (!row) return { ...EMPTY_DAILY }
      return {
        requests: Number(row.requests) || 0,
        promptTokens: Number(row.prompt_tokens) || 0,
        outputTokens: Number(row.output_tokens) || 0
      }
    },
    countRequestsSince: async (sinceMs) => {
      const row = await db.prepare(COUNT_SINCE_SQL).bind(sinceMs).first()
      return Number(row?.total) || 0
    },
    pruneRequests
  }
}
