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

## M1.6（懸浮窗表情演出）

依三條線紀錄檔的「高風險函式」段落匯整。§2.1 的四個模組都在表中。

| # | 函式 | 檔案 | 風險類別 | 看什麼 |
|---|---|---|---|---|
| 26 | `FileReminderQueueStore` 的 `load`／`fromLine`／`save`／`toLine` | `core/.../reminder/Stores.kt` | 讀寫檔案、格式變更可能遺失資料 | 一律寫 4 欄；讀取時 3 欄（M1.5 舊格式，script＝text）與 4 欄都接受；其他欄數或 Base64 壞掉的行略過（不會把半壞資料演出來） |
| 27 | `parseReminder`／`pickScript` | `core/.../reminder/Reminder.kt` | 外部輸入解析 | script trim 後非空且 ≤ 500 字才採用，否則整段改用 text（不截斷原文，避免切斷標籤） |
| 28 | `reportScript` | `core/.../reminder/Queue.kt` | 外部文字組成演出原文 | 只做字串串接，每則與新內容前補 `[neutral]` |
| 29 | `OverlayService.showScript`／`flushPending` | `app/.../OverlayService.kt` | 把外部文字送進 WebView 執行 | 原文經 `JSONObject.quote()` 跳脫後只當 `window.pet.say` 的字串參數（A26）；頁面載入前依到達順序暫存、載入後依序補送；無 Android 端自動測試，見 DEVICE-CHECKLIST-M1.6.md |
| 30 | `handlePush`（修改）／`splitPushScript`（新增） | `backend/worker/handlers.js` | 外部輸入觸發對外寫入 | 授權 → 長度（以原文計）→ 剝標籤（沿用 stream-parser，不自寫正規式）→ 剝完為空回 400 不送出 → 設定檢查 → 送出一次；只有含標籤時才帶 script |
| 31 | `buildFcmMessage`／`buildPushData` | `backend/core/push.js` | 組出對外訊息 | script 必須是非空字串才加入（A27）；本檔無任何 import（A29） |
| 32 | `window.pet.say`／`startCurrent`／`applyStep` | `app/src/main/assets/pet/index.html` | 外部文字顯示在畫面上 | 台詞只經 `textContent` 寫入；空字串與非字串忽略 |
| 33 | `skipToEnd`（收起泡泡、暫停、`showText` 共用） | `app/src/main/assets/pet/index.html` | 計時器殘留 | 清掉全部演出計時器；沒在演出時不動作 |
| 34 | `setFace` | `app/src/main/assets/pet/index.html` | 外部標籤決定載入哪個檔案 | 檔名只來自 `frameFor` 查 `PetEmotionMap.frames`（白名單），標籤字串不會組進路徑；載入失敗保留舊臉；以請求序號擋掉晚到的舊圖 |
| 35 | `performance.js` 的 `planTimeline`／`stageSkip` | `app/src/main/assets/pet/performance.js` | 解析外部文字 | 純函式、不改動傳入物件；解析程式為 vendor 照抄（A25） |
| 36 | `buildVendor`／`main` | `tools/sync-overlay-vendor.mjs` | 寫入檔案 | 只寫 `vendor/stream-parser.js`；只去掉行首 `export ` 並包一層；`--check` 不寫檔 |
| 37 | `build_data`／`build_message`（修改） | `tools/send_push.py` | 測試工具對外送推播 | 使用者手動執行才連 FCM；`--script` 沒給時與 M1.5 相同 |

## M2（戒飲記錄 F1）

依三條線紀錄檔（`lanes/M2-B.md`、`M2-C.md`、`M2-D.md`）的「高風險函式」段落匯整。§2.1 的十個模組都在表中。D1 的 SQL（`store.js`）沒有自動測試，規劃者在整合時逐行看過：全部是參數化查詢（`?1`…），沒有拼接字串；撤銷是條件式 UPDATE（`AND undone = 0`），不刪資料。整合時也用 `wrangler deploy --dry-run` 確認 Worker 打包得起來。

| # | 函式 | 檔案 | 風險類別 | 看什麼 |
|---|---|---|---|---|
| 38 | `handleDrinkConfirm` | `backend/worker/handlers.js` | 對外部儲存寫入（D1） | 授權在前；Worker 自己 `resolveDraft` 重算熱量，App 送來的熱量和多餘欄位一律不採用（A30）；驗證不過回 `choose`，不寫入；`logId` 由 Worker 產生 |
| 39 | `handleDrinkResist` | `backend/worker/handlers.js` | 對外部儲存寫入（D1） | `canResist`：同一時段已經有「沒喝」，或今天已經喝過，就回 `already`，不寫入；日期和時段一律用台北時間 |
| 40 | `handleDrinkUndo` | `backend/worker/handlers.js` | 對外部儲存寫入（D1） | `logId` 必須是非空字串；`canUndo`（存在、還沒撤銷、7 天內）加上儲存層的條件式 UPDATE，兩道都過才算撤銷 |
| 41 | `handleDrinkSettings`（PUT，函式名 `handleDrinkSettingsWrite`） | `backend/worker/handlers.js` | 覆寫使用者設定 | `validateDrinkSettings` 全部通過才開始寫；有一項不合就回 400，一個欄位都不寫；只寫五個固定的 `drink.` 鍵 |
| 42 | `runScheduled` | `backend/worker/handlers.js` | 定時對外寫入（推播） | `shouldAsk`（整點、今天還沒問過、詢問時段沒有紀錄）；推播沒設定就不做事；只送一次，不重試；推播成功才寫 `drink.askedOn`；整段包在 try/catch 裡，日誌不記內容 |
| 43 | `handleDrinkParse`、`generateScript`／`finishScript` | `backend/worker/handlers.js` | 外部文字交給語言模型；語言模型的輸出顯示給使用者 | 1～200 字；用量到上限就不呼叫；只取九個欄位，數字欄位丟掉（A30）；`checkScriptNumbers` 不通過就重試 1 次，再不通過改用預設台詞（A31）。中文數字（例如「五百」）擋不到，要靠手機實測 |
| 44 | `addDrinkLog`、`markDrinkUndone`（另有 `listDrinkLogs`、`findDrinkLog`） | `backend/worker/store.js` | 寫入資料庫；SQL 無法離線測試 | 見本段開頭；配料存成 JSON 文字，讀回時解析失敗就當空陣列 |
| 45 | `resolveDraft`、`checkScriptNumbers`、`statsOf`、`validateDrinkSettings`、`shouldAsk` | `backend/core/drink.js` | 純函式（決定寫入什麼內容、什麼時候推播） | 不讀時間、不改傳入的物件；熱量只來自 `calorie.js`（A32）；在 Stryker 範圍內 |
| 46 | `buildFcmMessage`（修改） | `backend/core/push.js` | 組出對外訊息 | 第 5 個參數 `actions` 必須是非空字串才加進去，其餘與 M1.6 逐字相同 |
| 47 | `WorkerApi.send`／`request`／`targetUrl` | `app/.../WorkerApi.kt` | 讀憑證（`API_SECRET`）、對外連線 | 網址只來自 `apiOrigin(BuildConfig.CHAT_URL)`；只用 `HttpsURLConnection`（不是 https 就不送，密鑰不走明文）；不跟隨轉址；逾時 15 秒；回應上限 64 KB；log 只記方法、路徑、狀態碼（V29） |
| 48 | `DrinkActionReceiver.sendResist`／`openAndListen` | `app/.../DrinkActionReceiver.kt` | 通知按鈕觸發對外寫入 | Manifest `exported=false`；只認 `resist`、`speak`；送出的內容固定是 `{}`；沒有懸浮窗權限時只發通知提示，不繞過權限 |
| 49 | `PetBridge.onDrinkAction` → `OverlayService.onDrinkAction`／`drinkRequestBody` | `app/.../PetBridge.kt`、`OverlayService.kt` | 網頁傳入的資料觸發對外寫入 | 超過 16 KB 就略過；動作白名單（`drinkEndpointFor`）；只取 `draft`（物件）和 `logId`（非空字串）；Worker 端會重算熱量 |
| 50 | `OverlayService.callWorker`／`showDrink`／`thinking`／`onSpeechResult` | `app/.../OverlayService.kt` | 外部文字送進 WebView；使用者語音送到外部 | 回應原文經 `JSONObject.quote()` 跳脫後只當字串（A26）；`thinking` 只傳布林值，`true` 時順便打開泡泡；語音只送辨識成功的結果，最多 200 字 |
| 51 | `DrinkSettingsActivity.saveSettings` | `app/.../DrinkSettingsActivity.kt` | 覆寫使用者設定 | 讀到目前的設定之前不能儲存；數字欄位送 JSON 數字；驗證只在 Worker 做 |
| 52 | `apiOrigin`、`parseDrinkActions` | `core/.../drink/Drink.kt` | 決定連線目的地；解析外部輸入 | 只接受 https，拒絕帳密、IPv6、空白、奇怪的埠號；`actions` 白名單只有 `resist`、`speak` |
| 53 | `PetDrinkView.viewFor`／`applyChoice` | `app/src/main/assets/pet/drink-view.js` | 外部文字顯示在畫面上；產生要寫入的草稿 | 純函式，不碰 DOM；按鈕文字由 `showDrinkButtons` 用 `textContent` 設定；草稿每次都複製一份，最後由 Worker 重新驗證 |
| 54 | `window.pet.showDrink`、`showDrinkButtons`／`sendDrinkAction` | `app/src/main/assets/pet/index.html` | 外部 JSON 進入網頁；網頁按鈕觸發寫入 | `JSON.parse` 失敗就忽略；按下後整組按鈕清掉，避免重複送出；撤銷按鈕 60 秒後移除 |
