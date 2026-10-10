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
// M4 盤前均線：追蹤清單、收盤價、均線結果（不含任何 DELETE 語句，架構約束 A42、V35）
const LIST_WATCH_SQL = 'SELECT code, name, active, added_on, sort FROM ma_watch ORDER BY sort ASC'
const FIND_WATCH_SQL = 'SELECT code, sort FROM ma_watch WHERE code = ?1'
const MAX_WATCH_SORT_SQL = 'SELECT MAX(sort) AS maxSort FROM ma_watch'
const INSERT_WATCH_SQL = 'INSERT INTO ma_watch (code, name, active, added_on, sort) VALUES (?1, ?2, 1, ?3, ?4)'
const UPDATE_WATCH_ACTIVE_SQL = 'UPDATE ma_watch SET active = ?2 WHERE code = ?1'
const UPSERT_CLOSE_SQL = `INSERT INTO ma_close (code, date, close) VALUES (?1, ?2, ?3)
ON CONFLICT(code, date) DO UPDATE SET close = excluded.close`
const LIST_CLOSES_SQL = 'SELECT date, close FROM ma_close WHERE code = ?1 ORDER BY date DESC LIMIT ?2'
const UPSERT_RESULT_SQL = `INSERT INTO ma_result (date, code, kind, m5, m20, m60) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
ON CONFLICT(date, code) DO UPDATE SET kind = excluded.kind, m5 = excluded.m5, m20 = excluded.m20, m60 = excluded.m60`
const LIST_RESULT_DATES_SQL = 'SELECT DISTINCT date FROM ma_result ORDER BY date DESC LIMIT ?1'

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
    },
    // 取得追蹤清單，依 sort 由小到大排序
    listWatch: async () => {
      const result = await db.prepare(LIST_WATCH_SQL).all()
      return (result?.results ?? []).map((r) => ({
        code: r.code,
        name: r.name,
        active: Number(r.active) === 1,
        addedOn: r.added_on,
        sort: Number(r.sort)
      }))
    },
    // 新增追蹤標的，sort 為目前最大 sort + 1；已存在則不重複新增
    addWatch: async ({ code, name, addedOn }) => {
      const existing = await db.prepare(FIND_WATCH_SQL).bind(code).first()
      if (existing) return
      const maxRow = await db.prepare(MAX_WATCH_SORT_SQL).first()
      const nextSort = (maxRow?.maxSort !== null && maxRow?.maxSort !== undefined ? Number(maxRow.maxSort) : 0) + 1
      await db.prepare(INSERT_WATCH_SQL).bind(code, name, addedOn, nextSort).run()
    },
    // 標記是否追蹤（停止追蹤或復原）；標的不存在丟例外
    setWatchActive: async (code, active) => {
      const existing = await db.prepare(FIND_WATCH_SQL).bind(code).first()
      if (!existing) {
        throw new Error('MA_NOT_FOUND')
      }
      await db.prepare(UPDATE_WATCH_ACTIVE_SQL).bind(active ? 1 : 0, code).run()
    },
    // 批次寫入或更新收盤價快取（INSERT OR REPLACE）
    upsertCloses: async (code, rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return
      const stmts = rows.map((r) => db.prepare(UPSERT_CLOSE_SQL).bind(code, r.date, Number(r.close)))
      await db.batch(stmts)
    },
    // 取得指定代號收盤價，由舊到新排序，取最新 limit 筆
    listCloses: async (code, limit = 70) => {
      const result = await db.prepare(LIST_CLOSES_SQL).bind(code, limit).all()
      const rows = (result?.results ?? []).map((r) => ({
        date: r.date,
        close: Number(r.close)
      }))
      rows.reverse()
      return rows
    },
    // 批次寫入或更新計算結果
    upsertResults: async (asOf, results) => {
      if (!Array.isArray(results) || results.length === 0) return
      const stmts = results.map((r) => {
        const m5 = r.ma ? numberOrNull(r.ma[0]) : null
        const m20 = r.ma ? numberOrNull(r.ma[1]) : null
        const m60 = r.ma ? numberOrNull(r.ma[2]) : null
        return db.prepare(UPSERT_RESULT_SQL).bind(asOf, r.code, r.kind, m5, m20, m60)
      })
      await db.batch(stmts)
    },
    // 取得收盤日清單（由新到舊，不重複，最多 limit 筆）
    listResultDates: async (limit = 7) => {
      const result = await db.prepare(LIST_RESULT_DATES_SQL).bind(limit).all()
      return (result?.results ?? []).map((r) => r.date)
    },
    // 取得指定日期清單的計算結果
    listResults: async (dates) => {
      if (!Array.isArray(dates) || dates.length === 0) return []
      const placeholders = dates.map((_, i) => `?${i + 1}`).join(', ')
      const sql = `SELECT date, code, kind, m5, m20, m60 FROM ma_result WHERE date IN (${placeholders})`
      const result = await db.prepare(sql).bind(...dates).all()
      return (result?.results ?? []).map((r) => ({
        date: r.date,
        code: r.code,
        kind: r.kind,
        m5: numberOrNull(r.m5),
        m20: numberOrNull(r.m20),
        m60: numberOrNull(r.m60)
      }))
    }
  }
}
