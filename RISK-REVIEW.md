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
