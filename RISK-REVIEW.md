# 高風險函式清單

請人工閱讀以下函式（共 8 個）。

| # | 模組／函式 | 檔案 | 風險類別 | 看什麼 |
|---|---|---|---|---|
| 1 | `exportCsv` | `core/.../Export.kt` | 寫入檔案，可能覆蓋舊紀錄 | 是否用 `createNewFile()` 判斷存在、後綴迴圈上限 |
| 2 | `FilePositionStore.save` | `core/.../PositionStore.kt` | 寫入檔案 | 只寫 `filesDir/pet-position.txt`，整檔覆寫是預期行為（只存一個位置） |
| 3 | `FilePositionStore.load` | `core/.../PositionStore.kt` | 讀取外部檔案 | 格式錯誤是否回傳 null |
| 4 | `PetBridge.onPetTapped` | `app/.../PetBridge.kt` | 原生功能暴露給網頁內容 | 只切換泡泡，無參數 |
| 5 | `PetBridge.onMicPressed` | `app/.../PetBridge.kt` | 原生功能暴露給網頁內容 | 沒權限時只顯示訊息，不啟動辨識 |
| 6 | `BatteryLogger`（`sampleAndReschedule`、`appendLine`） | `app/.../BatteryLogger.kt` | 附加寫入樣本檔，可能覆蓋舊紀錄 | `FileOutputStream(file, true)` 附加模式；停止後不再排程 |
| 7 | `OverlayService.showText` | `app/.../OverlayService.kt` | 文字注入網頁 | 是否以 `JSONObject.quote` 跳脫 |
| 8 | `PetWebViewClient` | `app/.../OverlayService.kt` | WebView 網址白名單 | `isAllowedUrl` 前綴判斷 |

## M1 新增高風險函式（共 9 個）

| # | 模組／函式 | 檔案 | 風險類別 | 看什麼 |
|---|---|---|---|---|
| 9 | `FileReminderQueueStore.save`／`load` | `core/.../reminder/Stores.kt` | 寫入檔案，可能覆蓋或遺失排隊中的提醒 | 整檔覆寫是否只在 `ReminderDispatcher` 的同步區塊內進行；壞行是否只略過那一行 |
| 10 | `FileSeenIdStore.add`／`contains` | `core/.../reminder/Stores.kt` | 寫入檔案 | 只保留最近 200 個；Base64 編碼避免換行弄壞格式 |
| 11 | `PetMessagingService.onMessageReceived` | `app/.../PetMessagingService.kt` | 外部輸入（推播內容）進入 App | 只把 `message.data` 交給 `ReminderDispatcher.handle`，沒有別的處理 |
| 12 | `ReminderDispatcher.handle` | `app/.../ReminderDispatcher.kt` | 外部輸入進入 App、單一入口（A13） | 先解析再去重再分流；`IGNORE` 時不記錄編號；沒有懸浮窗權限或啟動被拒絕時改發通知 |
| 13 | `ReminderDispatcher.takeReport` | `app/.../ReminderDispatcher.kt` | 寫入檔案（清空排隊） | 先 `drainAlive` 再報告；清空後取消靜音通知 |
| 14 | `readForeground`／`hasUsageAccess` | `app/.../ForegroundDetector.kt` | 讀取使用者的 App 使用紀錄（個人資料） | 只查最近 60 秒、只取最後一個前景套件、不保存、不寫 log |
| 15 | `PushTokenStore.save`／`load` | `app/.../PushTokenStore.kt` | 推播代碼（裝置憑證） | 只存 `filesDir/push-token.txt`；全專案沒有把代碼寫進 log |
| 16 | `PetApp.initFirebase` | `app/.../PetApp.kt` | 憑證設定值進入程式 | 四個值都有才初始化；失敗只記例外類型 |
| 17 | `OverlayService.checkIdle`／`presentReport` | `app/.../OverlayService.kt` | 服務生命週期 | 收起時只停止服務、不改角色模式；沒有懸浮窗權限時不加視窗 |

## M1.5 新增高風險函式（共 8 個）

| # | 模組／函式 | 檔案 | 風險類別 | 看什麼 |
|---|---|---|---|---|
| 18 | `fcm-client` 的 `sendFcm`（含 `signJwt`、`pemToBytes`、`exchangeToken`） | `backend/worker/fcm-client.js` | 讀取憑證（服務帳戶私鑰）、對外部服務寫入 | 私鑰只在記憶體中匯入、不寫日誌；JWT 的 `aud`／`scope`／`exp` 是否正確；權杖不快取；失敗時回傳值不帶出私鑰或權杖 |
| 19 | `fcm-client` 的 `postMessage` | `backend/worker/fcm-client.js` | 對外部服務寫入 | 一次請求只呼叫送出端點一次；錯誤代碼的取法（details → status → UNKNOWN） |
| 20 | `handlePush` | `backend/worker/handlers.js` | 外部輸入觸發對外寫入 | 授權在最前（沿用 `/api/` 中介）；順序固定為內容檢查 → 設定檢查 → 送出一次；日誌只記成功／失敗與代碼 |
| 21 | `push.js` 的 `validatePushPayload`／`isPushConfigured`／`buildFcmMessage` | `backend/core/push.js` | 決定送出內容與是否送出 | 修剪後判斷空白與 500 字上限；訊息只有 `token`、`data.id`、`data.text`、`android.priority`，沒有 `notification` |
| 22 | `index.js` 的 `buildDeps`（`pusher`、`pushConfig`） | `backend/worker/index.js` | 憑證進入程式 | 服務帳戶與推播代碼只從 `env` 讀；`USE_STUB` 時改用 Stub，不連 Google |
| 23 | `ChatActivity`（`onCreate`、`ChatWebViewClient`） | `app/.../ChatActivity.kt` | 載入遠端內容 | 網址只來自 `normalizeChatUrl(BuildConfig.CHAT_URL)`；非同源導覽擋下、子資源 403；不讀本機檔案、禁止混合內容、沒有 JS 介面；SSL 錯誤沿用預設 |
| 24 | `OverlayService.onChatPressed`／`PetBridge.onChatPressed` | `app/.../OverlayService.kt`、`PetBridge.kt` | 從懸浮窗開啟畫面 | 沒參數；未設定時只顯示提示；只開本 App 的 `ChatActivity` |
| 25 | `wrangler.toml` | `backend/wrangler.toml` | 資料庫隔離設定 | 名稱 `pet-maid-api`、資料庫 `pet-maid-db`、`database_id` 由使用者自填（不得填 accompany_bot 的）；沒有任何金鑰賦值 |
