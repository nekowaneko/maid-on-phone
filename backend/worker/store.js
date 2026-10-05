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
// M2 戒飲記錄：撤銷只把 undone 改成 1，不刪除；UPDATE 帶 undone = 0 條件，重複撤銷不會改到任何列
const ADD_DRINK_LOG_SQL = `INSERT INTO drink_logs
(id, date, slot, type, name, price, kcal, source, ice, size_id, sugar_level_id, base_id, topping_ids, starbucks_id, created_at, undone)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 0)`
const LIST_DRINK_LOGS_SQL = 'SELECT * FROM drink_logs WHERE undone = 0 ORDER BY created_at ASC, id ASC'
const FIND_DRINK_LOG_SQL = 'SELECT * FROM drink_logs WHERE id = ?1'
const UNDO_DRINK_LOG_SQL = 'UPDATE drink_logs SET undone = 1 WHERE id = ?1 AND undone = 0'

// 功能函數定義

// 沒有值時存 NULL（D1 的 bind 不接受 undefined）
const orNull = (value) => (value === undefined ? null : value)

// 數字欄位：NULL 維持 null，其餘轉成數字
const numberOrNull = (value) => (value === null || value === undefined ? null : Number(value))

// 配料清單存成 JSON 文字；讀回時解析失敗或不是陣列就當成空陣列
const parseToppings = (text) => {
  try {
    const list = JSON.parse(text)
    return Array.isArray(list) ? list : []
  } catch (error) {
    return []
  }
}

// 資料表的一列 → 路由層使用的紀錄形狀（與 store.stub.js 相同）
const rowToDrinkLog = (row) => ({
  id: row.id,
  date: row.date,
  slot: row.slot,
  type: row.type,
  name: orNull(row.name),
  price: numberOrNull(row.price),
  kcal: numberOrNull(row.kcal),
  source: orNull(row.source),
  ice: orNull(row.ice),
  sizeId: orNull(row.size_id),
  sugarLevelId: orNull(row.sugar_level_id),
  baseId: orNull(row.base_id),
  toppingIds: parseToppings(row.topping_ids),
  starbucksId: orNull(row.starbucks_id),
  createdAt: Number(row.created_at),
  undone: Number(row.undone) === 1
})

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
    pruneRequests,
    // 新增一筆戒飲紀錄（M2 §4.1.3）
    addDrinkLog: async (log) => {
      await db
        .prepare(ADD_DRINK_LOG_SQL)
        .bind(
          log.id,
          log.date,
          log.slot,
          log.type,
          orNull(log.name),
          orNull(log.price),
          orNull(log.kcal),
          orNull(log.source),
          orNull(log.ice),
          orNull(log.sizeId),
          orNull(log.sugarLevelId),
          orNull(log.baseId),
          JSON.stringify(Array.isArray(log.toppingIds) ? log.toppingIds : []),
          orNull(log.starbucksId),
          log.createdAt
        )
        .run()
    },
    // 全部未撤銷的紀錄，依記錄時間排序
    listDrinkLogs: async () => {
      const result = await db.prepare(LIST_DRINK_LOGS_SQL).all()
      return (result?.results ?? []).map(rowToDrinkLog)
    },
    // 找一筆紀錄（含已撤銷）；找不到回 null
    findDrinkLog: async (id) => {
      const row = await db.prepare(FIND_DRINK_LOG_SQL).bind(id).first()
      return row ? rowToDrinkLog(row) : null
    },
    // 標記撤銷：真的改到一列才回 true（找不到或已撤銷回 false）
    markDrinkUndone: async (id) => {
      const result = await db.prepare(UNDO_DRINK_LOG_SQL).bind(id).run()
      return Number(result?.meta?.changes) > 0
    }
  }
}
