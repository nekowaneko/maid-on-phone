# 安全報告

## 架構約束檢查（verify.sh L1）

| # | 結果 |
|---|---|
| A1 core 不引用 Android | 通過（V01） |
| A2 core 不連網 | 通過（V02） |
| A3 Manifest 無 INTERNET | 通過（V03、規格測試 S15） |
| A4 WebView 只載入 `file:///android_asset/pet/` | 通過（V07）；另以 `shouldInterceptRequest` 對其他網址的子資源回傳 403 |
| A5 `@JavascriptInterface` 只有 2 個 | 通過（V08） |
| A6 懸浮窗不用 MATCH_PARENT | 通過（V09） |
| A7 前景服務類型與 subtype 屬性 | 通過（V10） |

## 憑證掃描（V06）

gitleaks 未安裝，改用計畫指定的 grep 樣式掃描所有追蹤檔：無發現。`git ls-files` 不含 `*.jks` 與 `frames/local/*.png`。

## WebView 設定

- `javaScriptEnabled = true`（角色頁需要）
- `allowFileAccess = false`、`allowContentAccess = false`
- 未啟用 `setAllowUniversalAccessFromFileURLs`、`setAllowFileAccessFromFileURLs`
- 原生 → 網頁的文字一律以 `JSONObject.quote` 跳脫後才放進 `evaluateJavascript`；網頁端以 `textContent` 顯示，不解析 HTML

## 檔案寫入

- `exportCsv` 以 `createNewFile()` 原子建立新檔，已存在則加後綴，不覆蓋
- 樣本檔以 `FileOutputStream(file, append = true)` 附加
- FileProvider 只開放 `external-files-path/exports/`，分享時只授予單一檔案的讀取權

## Android Lint warning（不中斷建置，列出供人工判斷）

`./gradlew :app:lintDebug`：error 0 個，warning 16 個。

| Lint ID | 數量 | 位置 | 判斷 |
|---|---|---|---|
| GradleDependency | 7 | `libs.versions.toml` | 範本套件有新版；依預設值表不升級，列入 CHECKLIST 的依賴稽核 |
| NewerVersionAvailable | 1 | Kotlin 2.2.10 | 刻意對齊 AGP 內建版本，不升級 |
| ObsoleteSdkInt | 2 | `OverlayService.kt` | minSdk 26 下多餘的 `SDK_INT >= O` 判斷，無害 |
| UnusedResources | 3 | `activity_main.xml`、`colors.xml` | 範本資源，主畫面改為程式建立後未使用 |
| UseKtx | 1 | `MainActivity.kt` | 風格建議 |
| ClickableViewAccessibility | 1 | `OverlayService.kt` 拖曳處理 | 點擊交由 WebView 處理，無障礙影響需手機上評估 |
| SetTextI18n | 1 | `MainActivity.kt` | 文字串接，M0 不做多語系 |

無安全類別的 warning（例如 `SetJavaScriptEnabled` 已在程式中以註記標示並說明理由）。

## M1 架構約束檢查（verify.sh L1）

| # | 結果 |
|---|---|
| A11 `core/reminder/` 只用標準庫與 `java.util`／`java.io` | 通過（V01、V02；`java.util.Base64` 屬於允許範圍） |
| A12 `app/src/main` 不自行連外 | 通過（V18，並由凍結的 S15 再檢查一次） |
| A13 所有提醒都走 `ReminderDispatcher.handle` | `PetMessagingService` 與主畫面測試推播都只呼叫它；人工閱讀見 RISK-REVIEW.md |
| A14 `PetMessagingService` 為 `exported="false"` | 通過（V20） |
| A15 排隊通知頻道 `IMPORTANCE_MIN`、靜音、不震動 | 通過（V21） |
| A16 Firebase 設定只從 `firebase.properties` 讀入、沒有檔案照常建置 | 本機沒有該檔案，建置與 L1～L3 全部通過；V06 確認該檔與 `google-services.json` 未被追蹤 |
| A17 推播代碼不寫進 log | 通過（V22）；`PetApp` 初始化失敗時只記例外類型 |
| A3 原始碼 Manifest 無 INTERNET | 通過（V03、S15）；Firebase 套件合併進來的網路權限不算 |

## M1 其他安全事項

- `PACKAGE_USAGE_STATS` 由使用者在系統設定自行開啟；`ForegroundDetector` 只在收到推播的當下查詢最近 60 秒的事件一次，不常駐、不保存使用紀錄。
- 推播資料只取 `id`、`text` 兩個鍵，文字截斷為 500 字；顯示時沿用 `JSONObject.quote` 跳脫、網頁端 `textContent`，不解析 HTML。
- 一般通知的點擊使用 `FLAG_IMMUTABLE` 的 PendingIntent，只能叫出角色並帶入同一則文字。
- 沒有新增 `@JavascriptInterface`（V08 仍為 2 個）。
- Lint：`./gradlew :app:lintDebug` error 0 個、warning 16 個（與 M0 相同數量，M1 沒有新增 warning 類別）。

## M1.5 架構約束檢查（verify.sh L1）

| # | 結果 |
|---|---|
| A4（修訂）懸浮窗只載入本機資產；`ChatActivity` 只載入檢查後的聊天網址 | 通過（V07 修訂版） |
| A5（修訂）`@JavascriptInterface` 恰好 3 個、`ChatActivity` 沒有 JS 介面 | 通過（V08 修訂版） |
| A18 `googleapis.com` 只在 `fcm-client.js`；`backend/core/` 不連線、不碰 `crypto.subtle`、`env.` | 通過（V24），**但有一行豁免**：`llm-client.js` 原有的 Gemini 直連網址，見 BLOCKERS.md「規格爭議」 |
| A19 金鑰只從 Worker 環境變數讀；`wrangler.toml` 沒有金鑰賦值；回應與日誌不含憑證 | 通過（V23）；輔助測試確認失敗回應不含推播代碼、服務帳戶欄位、權杖 |
| A20 Worker B 與 accompany_bot 分開；立繪與圖示不進 git | 通過（M15-S03、V23） |
| A21 推播失敗不重試、一次請求最多呼叫送出端點一次 | 通過（M15-S12、fcm-client 輔助測試） |
| A22 聊天網址只從 `worker.properties` 讀；沒有檔案照常建置 | 本機沒有該檔案，`BuildConfig.CHAT_URL` 為空字串，建置通過 |
| A23 `ChatActivity` `exported="false"`、不讀檔案、禁止混合內容、攔截子資源 | 通過（V25） |
| A3 原始碼 Manifest 無 INTERNET | 通過（V03、S15）；聊天畫面的網路權限來自 Firebase 套件合併（見 CHECKLIST.md） |

## M1.5 其他安全事項

- 推播路由的日誌只有「推播送出成功」或「推播送出失敗：<代碼>」，不含文字內容、推播代碼、服務帳戶。
- `fcm-client.js` 不寫任何日誌；私鑰匯入失敗時回傳 `INVALID_SERVICE_ACCOUNT`，不帶出例外內容。
- 存取密鑰沿用 accompany_bot 的 `isAuthorized`（不提早跳出的逐字比對）；`/api/push` 在 `/api/` 前綴下，自動受授權中介保護。
- 聊天網址解析不使用 `java.net`（V02）：帳密（`@`）、IPv6、非數字埠號一律視為無法解析，擋下 `https://evil.com@worker` 這類混淆網址。
- 聊天網頁把存取密鑰存在 WebView 的 DOM storage（App 私有資料夾），與 accompany_bot 在瀏覽器中的做法相同；手機遺失時請到 Cloudflare 換一把 `APP_SECRET`。
- CORS 沿用 accompany_bot 的 `access-control-allow-origin: *`；因為所有 `/api/` 都需要密鑰，未改動（安全邊界照 accompany_bot 現況，使用者 2026-10-04 決定）。

## M1.6

- 推播原文進入 WebView 只有一條路：`OverlayService.showScript` 以 `JSONObject.quote()` 跳脫後當 `window.pet.say` 的字串參數，角色頁只以 `textContent` 顯示，不使用 `innerHTML`。
- 表情標籤不會變成檔案路徑：角色頁的換臉只查 `emotion-map.js` 的白名單，標籤不在表內就用平常的臉。
- 角色頁仍只從 `file:///android_asset/pet/` 載入本機 script（V28 檢查不用 module、不讀檔、不連外），`@JavascriptInterface` 維持 3 個（V08）。
- Worker 的 `/api/push` 仍在 `/api/` 授權中介之後；剝標籤沿用 accompany_bot 的解析程式，不新增正規式；日誌不記內容。
- 依賴套件：本案沒有新增任何 npm 或 Gradle 依賴。

## M4.1（主畫面均線與聊聊入口、明細頁關閉）

- 架構約束檢查：
  - A44：明細頁 `MaActivity` 仍為非導出畫面（`exported="false"`），維持同源檢查，子資源非同源回 403。
  - A48：主畫面只呼叫 `WorkerApi.get("/api/ma/report")` 取摘要（由常數 `MA_REPORT_PATH` 指定），不呼叫 post/put，不呼叫未授權路徑。
  - A49 / A53：無靜默降級，副標文字依規格由 `maEntrySubtitle` 與常數提供，無寫死字串或多頭範例數字（V43 檢查通過）。
  - A50 / A51：明細頁關閉攔截使用專用 scheme `ma-exit://close`，`MaActivity` 攔截 `isMaExitUrl` 執行 `finish()`，不開放任何 `@JavascriptInterface`，WebView 維持無原生 JS 介面。
  - A52：主畫面「聊聊」大卡片點擊時若未設定聊天網址，只在主狀態顯示提示，不開啟畫面。

