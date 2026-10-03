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
