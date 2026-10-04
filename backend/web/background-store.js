// 背景圖的 IndexedDB 讀寫。這一支只做四件事：開資料庫、放進去、拿出來、刪掉。
//
// 刻意不做任何判斷：大小超不超過上限、說明文字合不合格、清單怎麼排，
// 一律問 core/background.js。這裡壞掉只會是「瀏覽器不給存」這一種原因，
// 對應的處置也只有一種——告訴使用者存不起來，畫面其他部分照常運作。
//
// 為什麼用 IndexedDB 而不是 localStorage：裁切後的圖是 Blob，
// localStorage 只收字串，轉成 base64 會膨脹三分之一，還會擠掉對話歷史。

// 常數定義
const KEY_PATH = 'id'
const READ_MODE = 'readonly'
const WRITE_MODE = 'readwrite'
const DEFAULT_VERSION = 1
const EMPTY_TEXT = ''

// 功能函數定義

// 這個瀏覽器有沒有 IndexedDB。沒有的話上傳與挑選兩個按鈕都不會亮起來。
export const isStoreSupported = () => typeof window !== 'undefined' && Boolean(window.indexedDB)

const readName = (settings) => String(settings?.storeName ?? EMPTY_TEXT)

// 把 IDBRequest 包成 Promise，後面的流程才寫得成一條直線
const toPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

// 開資料庫；第一次開的時候順便把 object store 建起來
const openDatabase = (settings) =>
  new Promise((resolve, reject) => {
    const request = window.indexedDB.open(
      String(settings?.databaseName ?? EMPTY_TEXT),
      Number(settings?.databaseVersion) || DEFAULT_VERSION
    )
    request.onupgradeneeded = () => {
      const database = request.result
      const name = readName(settings)
      if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: KEY_PATH })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

// 借一次 object store 做事，做完就把連線關掉。
// work 一定要立刻發出請求並回傳它，交易才不會在等待期間自己結束。
const withStore = async (settings, mode, work) => {
  const database = await openDatabase(settings)
  try {
    return await work(database.transaction(readName(settings), mode).objectStore(readName(settings)))
  } finally {
    database.close()
  }
}

// 存一筆。entry 是 core/background.js 整理好的紀錄，外加裁切後的圖與縮圖兩個 Blob。
export const putBackground = (settings, entry) => withStore(settings, WRITE_MODE, (store) => toPromise(store.put(entry)))

// 全部拿出來。縮圖本來就小，一次帶回來，清單才不必一張一張再去要。
export const listBackgrounds = async (settings) => {
  const rows = await withStore(settings, READ_MODE, (store) => toPromise(store.getAll()))
  return Array.isArray(rows) ? rows : []
}

// 拿某一張的完整內容（含原尺寸的裁切結果）；沒有這一筆就回傳 null
export const readBackground = async (settings, id) => {
  const row = await withStore(settings, READ_MODE, (store) => toPromise(store.get(String(id ?? EMPTY_TEXT))))
  return row ?? null
}

// 刪掉某一張。IndexedDB 的 delete 對不存在的鍵一樣算成功，
// 所以呼叫端不必先確認那一筆還在，重複按也不會爆掉。
export const deleteBackground = (settings, id) =>
  withStore(settings, WRITE_MODE, (store) => toPromise(store.delete(String(id ?? EMPTY_TEXT))))
