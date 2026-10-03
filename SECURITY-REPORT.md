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
