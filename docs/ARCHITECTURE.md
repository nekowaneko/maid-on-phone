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
- 角色頁依序載入三支一般 script：`emotion-map.js`（表情鍵 → 整張表情圖）、`vendor/stream-parser.js`（由 `tools/sync-overlay-vendor.mjs` 從 `backend/core/stream-parser.js` 產生，不得手改）、`performance.js`（演出排程：逐字、換臉、排隊、跳到演完）。
- 表情圖是整張替換，放在 `frames/local/`（不進 git），由 `tools/make_expression_frames.py` 從 Nano Banana 做的差分圖產生。
