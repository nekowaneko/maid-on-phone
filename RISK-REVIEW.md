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
