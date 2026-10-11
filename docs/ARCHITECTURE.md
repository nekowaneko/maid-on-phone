# 架構

## 模組

- `core`：純 Kotlin 邏輯，不依賴 Android。
- `app`：Android 殼，負責服務、視窗與權限。

## 懸浮角色怎麼運作

前景服務（specialUse）→ WindowManager 懸浮窗（只有角色大小）→ 透明 WebView 載入 `file:///android_asset/pet/index.html`。

## 原生與網頁的溝通

- WebView → 原生：點角色、按麥克風。
- 原生 → WebView：暫停／播放動畫、顯示文字。

## M0 不做的事

不連網、不接 AI、不接 Todoist／戒飲存／台股、沒有快速設定磚、沒有遊戲偵測。

## M1 架構

推播 → `PetMessagingService`（或主畫面的測試推播）→ `ReminderDispatcher`
→ core 的 `parseReminder`、`decideRoute` 決定：
- 角色出現（`OverlayService`，3 分鐘閒置自動收起）
- 一般通知
- 排隊（`FileReminderQueueStore`，通知欄放一則靜音的「有 N 則提醒等你」）
- 忽略（格式錯誤、重複）

遊戲判斷只在收到推播的當下讀一次前景 App（`ForegroundDetector`，需要使用情形存取權），不常駐監看。

## M1.5 架構

- `backend/`：Cloudflare Worker B（accompany_bot commit `54065e9` 的副本，來源見 backend/SOURCE.md）。聊天網頁、人設、表情標籤、角色小檔案沿用；M1.5 新增 `POST /api/push` 經 FCM 送純資料推播。
- App：泡泡「聊聊」→ `ChatActivity`（WebView 只載入 `worker.properties` 設定的 https 網址，其他網址一律擋下）。
- 與 accompany_bot 分開的東西：Worker 名稱、D1 資料庫、存取密鑰、Gemini 金鑰。共用的東西：Gemini 轉送服務。

## M1.6 懸浮窗表情

- 推播資料 `{id, text, script?}`：Worker B 收到帶標籤的台詞時，`text` 為去掉標籤的純文字（給通知欄），`script` 為原文（給角色演出）；沒有標籤時不帶 `script`，與 M1.5 相同。
- 角色頁依序載入三支一般 script：`emotion-map.js`（表情鍵 → 整張表情圖）、`vendor/stream-parser.js`（由 `tools/sync-overlay-vendor.mjs` 從 `backend/core/stream-parser.js` 產生，不得手改）、`performance.js`（演出排程：每字 80 毫秒、句尾停 500 毫秒、換臉、排隊、跳到演完）。
- 表情圖是整張替換，放在 `frames/local/`（不進 git），由 `tools/make_expression_frames.py` 從 Nano Banana 做的差分圖產生。

## M2 戒飲記錄

- 資料流：按「說話」→ App 語音辨識 → `POST /api/drink/parse` → 語言模型只回 `drink-model.json`／`starbucks.json` 的編號 → Worker 用組合式模型（`calorie.js` 的 `calcKcal`）或星巴克查表（`lookupTableKcal`）算熱量 → 角色複述 → 泡泡按鈕 → `PetBridge.onDrinkAction` → App → `POST /api/drink/confirm`（寫入）或 `/preview`（改甜度、選品項後重新複述）。
- 熱量與統計一律由規則算出；語言模型的台詞數字必須和規則一致，不一致時重試一次，還是不一致就改用 `drink-lines.json` 的預設台詞。
- 資料存在 D1 的 `drink_logs` 表（欄位照戒飲存備份格式），設定值存在 `settings` 表（`drink.` 開頭）；`GET /api/drink/export` 匯出成戒飲存的備份檔。
- Worker 每小時跑一次排程，依台北時間在設定的整點送「今天有喝飲料嗎？」推播，推播資料多一個 `actions`（`resist,speak`），App 依此顯示「沒喝／有喝，用說的」按鈕。
- App 只有 `WorkerApi.kt` 可以連外，網址由 `worker.properties` 的 `chatUrl` 取出網域、密鑰為 `apiSecret`；網頁呼叫原生的介面多一個 `onDrinkAction(json)`（共 4 個）。


## M4 盤前均線

- 資料流：08:30 Cron → 證交所（每檔當月日資料）→ D1（`ma_close`、`ma_result`）→ 規則算排列 → 語言模型只說開場一句 → FCM `ma` 欄位 → 角色泡泡 → `onMaPressed` → `MaActivity` → `ma.html` → `/api/ma/*`。
- 三張 D1 表、`/api/ma/*` 四條路由、設定檔五份（`ma-contract.json`、`ma-defaults.json`、`ma-lines.json`、`ma-glossary.json`、`ma-script-prompt.md`）。
- 載體決定：明細頁是 Worker B 網頁，不新增給遠端網頁用的 JS 介面；原生只多一個 `onMaPressed()`（第 6 個 `@JavascriptInterface`）。
- 說明文字與免責聲明不經語言模型。

## M4.1 主畫面入口

1. 主畫面新增「盤前均線」「聊聊」兩張摘要大卡片，取代「女僕對話紀錄」小按鈕。
2. 盤前均線卡片副標由 App 在 `onResume` 透過 `WorkerApi.get("/api/ma/report")` 取得（只讀取，不呼叫 refresh、不推播）；判斷與文字在 `core/ma/MaEntry.kt`（純函式）。
3. 明細頁關閉機制：網頁導向 `ma-exit://close`（契約檔 `exitUrl`），`MaActivity` 在 `shouldOverrideUrlLoading` 用 `isMaExitUrl` 辨識後 `finish()`；仍不提供任何 JS 介面（A44）。
4. 聊聊卡片副標是固定句；App 沒有本地對話紀錄。

## M4.2 聊天頁視訊版

1. 聊天頁改為視訊通話版：角色用整張表情圖（`backend/assets/character/frames/`，不進 git），不再疊分層 PNG；換裝移除。
2. 通話狀態（呼叫中、通話中、她在想、連線失敗、通話結束）與各狀態的文字、按鈕可用性，全部由 `backend/core/call-state.js` 的純函式決定；眨眼的時間與條件在 `backend/core/blink.js`。DOM 接線在 `backend/web/call.js`。
3. 接通判斷：載入設定與表情圖、並以存取密鑰呼叫 `/api/usage` 回 200；沒有密鑰、401、網路錯誤或逾時（`connectTimeoutMs`）都是連線失敗。
4. 「關閉聊天」：網頁導向 `chat-exit://close`（`config/call.json` 的 `exitUrl`），`ChatActivity` 在 `shouldOverrideUrlLoading` 用 `isChatExitUrl` 辨識後 `finish()`；仍不提供任何 JS 介面（A5）。
5. 設計上的取捨：沿用聊天頁現況風格；角色圖放大到視訊區寬度的 118%，畫質偏軟，見 design/prototype/later.md。

## M4.3 戒飲記錄開關

1. 開關存在 D1 的 `settings` 表，鍵為 `drink.enabled`，值為 `true` 或 `false`；沒存過、或存的值不是 `false`，一律視為開啟。它**不屬於**戒飲設定的五個欄位，`/api/drink/settings` 的回應與驗證不變（M2-S12 的凍結測試逐欄比對那五個欄位）。
2. 新增 `GET/PUT /api/drink/enabled`，內容為 `{"enabled": true|false}`；PUT 只接受布林值，其他一律回 400「設定值不正確：啟用戒飲記錄」。
3. 關閉時，寫入類路由（`parse`、`preview`、`confirm`、`resist`、`undo`）回 403「戒飲記錄已關閉」，不呼叫語言模型、不寫入任何紀錄。讀取類路由（`history`、`stats`、`settings`、`export`、`enabled`）不受影響，所以關閉期間仍能查看統計、匯出，也能重新打開。過去的紀錄一筆都不刪。
4. 排程：每日詢問在關閉時直接略過；盤前均線與 Todoist 的排程不讀這個開關。
5. App：`DrinkSettingsActivity` 加「啟用戒飲記錄」開關，按「儲存」時先存五個欄位、成功後再存開關。`OverlayService` 在角色頁載入完成與每次展開泡泡時讀 `/api/drink/enabled`，用 `callJs` 呼叫網頁的 `window.pet.setDrinkEnabled(布林值)`，網頁據此隱藏「說話」「沒喝」「戒飲歷史」三顆按鈕。`@JavascriptInterface` 仍是 6 個。
6. 讀不到設定（沒網路、尚未設定伺服器、格式不對）時，三顆按鈕維持顯示，這是唯一允許的降級，只由 core 的 `drinkUiEnabled` 一處決定。
7. 主畫面（`activity_main.xml`、`MainActivity.kt`）不動，「戒飲設定」卡片不論開關都留在原位。
