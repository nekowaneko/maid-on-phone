// 記憶體儲存層：介面與 worker/store.js 完全相同，驗收與本機預覽全程走這一支。
// 每次 createStore 都回傳一組全新的容器，測試之間不會互相污染，
// 重啟也就跟著歸零，剛好方便重測用量面板。

// 常數定義
const REQUEST_RETENTION_MS = 120000 // 請求時間戳保留兩分鐘，只夠算每分鐘請求數
const EMPTY_DAILY = { requests: 0, promptTokens: 0, outputTokens: 0 }

// 功能函數定義

// 取出某一天的計數列，沒有就先補一列零
const ensureDaily = (daily, dateKey) => {
  if (!daily.has(dateKey)) daily.set(dateKey, { ...EMPTY_DAILY })
  return daily.get(dateKey)
}

// 複製一筆戒飲紀錄（配料清單另外複製，避免共用同一個陣列）
const copyLog = (log) => ({ ...log, toppingIds: Array.isArray(log.toppingIds) ? [...log.toppingIds] : [] })

export const createStore = (env) => {
  const settings = new Map()
  const daily = new Map()
  const drinkLogs = [] // M2 戒飲紀錄，撤銷只標記 undone
  const watchList = [] // M4 追蹤清單 [{ code, name, active: boolean, addedOn, sort }]
  const closeRecords = new Map() // M4 收盤價 `${code}:${date}` -> { code, date, close }
  const resultRecords = new Map() // M4 均線結果 `${date}:${code}` -> { date, code, kind, m5, m20, m60 }
  let requestTimes = []

  // 兩分鐘以前的時間戳沒有用處，順手丟掉，免得無限長大
  const pruneRequests = async (beforeMs) => {
    requestTimes = requestTimes.filter((ts) => ts > beforeMs)
  }

  return {
    readSetting: async (key) => (settings.has(key) ? settings.get(key) : null),
    writeSetting: async (key, value) => {
      settings.set(key, value)
    },
    deleteSetting: async (key) => {
      settings.delete(key)
    },
    recordRequest: async (dateKey, nowMs) => {
      ensureDaily(daily, dateKey).requests += 1
      requestTimes.push(nowMs)
      await pruneRequests(nowMs - REQUEST_RETENTION_MS)
    },
    addTokens: async (dateKey, promptTokens, outputTokens) => {
      const row = ensureDaily(daily, dateKey)
      row.promptTokens += Number(promptTokens) || 0
      row.outputTokens += Number(outputTokens) || 0
    },
    readDaily: async (dateKey) => ({ ...(daily.get(dateKey) ?? EMPTY_DAILY) }),
    countRequestsSince: async (sinceMs) => requestTimes.filter((ts) => ts > sinceMs).length,
    pruneRequests,
    // 新增一筆戒飲紀錄（存複本，呼叫端之後改動傳入的物件不影響儲存內容）
    addDrinkLog: async (log) => {
      drinkLogs.push(copyLog({ ...log, undone: false }))
    },
    // 全部未撤銷的紀錄，依記錄時間排序（同一時間依寫入順序）
    listDrinkLogs: async () =>
      drinkLogs
        .filter((log) => !log.undone)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(copyLog),
    // 找一筆紀錄（含已撤銷）；找不到回 null
    findDrinkLog: async (id) => {
      const found = drinkLogs.find((log) => log.id === id)
      return found ? copyLog(found) : null
    },
    // 標記撤銷：找不到或已撤銷回 false
    markDrinkUndone: async (id) => {
      const found = drinkLogs.find((log) => log.id === id)
      if (!found || found.undone) return false
      found.undone = true
      return true
    },
    // 取得追蹤清單，依 sort 由小到大排序
    listWatch: async () =>
      watchList
        .map((w) => ({ ...w }))
        .sort((a, b) => a.sort - b.sort),
    // 新增追蹤標的，sort 為目前最大 sort + 1；已存在則不重複新增
    addWatch: async ({ code, name, addedOn }) => {
      const found = watchList.find((w) => w.code === code)
      if (found) return
      const maxSort = watchList.reduce((max, w) => Math.max(max, w.sort), 0)
      watchList.push({ code, name, active: true, addedOn, sort: maxSort + 1 })
    },
    // 標記是否追蹤（停止追蹤或復原）；標的不存在丟例外
    setWatchActive: async (code, active) => {
      const found = watchList.find((w) => w.code === code)
      if (!found) {
        throw new Error('MA_NOT_FOUND')
      }
      found.active = Boolean(active)
    },
    // 批次寫入收盤價快取
    upsertCloses: async (code, rows) => {
      if (!Array.isArray(rows)) return
      for (const r of rows) {
        closeRecords.set(`${code}:${r.date}`, { code, date: r.date, close: Number(r.close) })
      }
    },
    // 取得指定標的收盤價，由舊到新排序，取最新 limit 筆
    listCloses: async (code, limit = 70) => {
      const matched = []
      for (const item of closeRecords.values()) {
        if (item.code === code) matched.push({ date: item.date, close: item.close })
      }
      matched.sort((a, b) => b.date.localeCompare(a.date))
      const picked = matched.slice(0, limit)
      picked.reverse()
      return picked.map((r) => ({ ...r }))
    },
    // 批次寫入或更新均線計算結果
    upsertResults: async (asOf, results) => {
      if (!Array.isArray(results)) return
      for (const r of results) {
        const m5 = r.ma ? r.ma[0] : null
        const m20 = r.ma ? r.ma[1] : null
        const m60 = r.ma ? r.ma[2] : null
        resultRecords.set(`${asOf}:${r.code}`, {
          date: asOf,
          code: r.code,
          kind: r.kind,
          m5,
          m20,
          m60
        })
      }
    },
    // 取得收盤日清單（由新到舊，不重複，最多 limit 筆）
    listResultDates: async (limit = 7) => {
      const dates = Array.from(new Set(Array.from(resultRecords.values()).map((r) => r.date)))
      dates.sort((a, b) => b.localeCompare(a))
      return dates.slice(0, limit)
    },
    // 取得指定日期清單的計算結果
    listResults: async (dates) => {
      if (!Array.isArray(dates) || dates.length === 0) return []
      const matched = []
      for (const item of resultRecords.values()) {
        if (dates.includes(item.date)) {
          matched.push({ ...item })
        }
      }
      return matched
    }
  }
}
