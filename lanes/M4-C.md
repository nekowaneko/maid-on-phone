# M4 C 線 (Kotlin) 執行紀錄

## 進度
- T0a：確認 CHEAP-PLAN 產出檔案（`backend/config/ma-contract.json`、`app/src/main/assets/pet/ma-labels.js`）齊全且非空。
- C1：實作 core 模組 `MaModels.kt`（`pickMaPayload`、`maPageUrl`、常數）、擴充 `Reminder.ma` 欄位與 `parseReminder` 解析，並撰寫 `MaModelsTest.kt` 與 `M4HelperTest.kt` 輔助測試。`:core:test` 通過。
- C2：實作 app 模組 `PetBridge.onMaPressed`（第 6 個 `@JavascriptInterface`）、`OverlayService.showMa` / `presentMa` / `onMaPressed`、`ReminderDispatcher` 分流（`r.ma != null` 帶入 `maJson`、`maScript`）、`ReminderNotifications`（帶 `ma` 時通知點擊指向 `MaActivity`，不加按鈕）、`PetControl.startPetService` 參數更新、全螢幕安全 WebView `MaActivity.kt` 與 `AndroidManifest.xml` 註冊。`:core:test` 與 `:app:compileDebugKotlin` 皆通過。
- 成本統計：
  - C1：修正輪數 0，錯誤指紋 0
  - C2：修正輪數 0，錯誤指紋 1（V06：前置批次接線缺口）

## 決策
- 依據 `docs/M4-LANE-C.md` §3 與 §4B.4 介面規範完成 Kotlin 模組實作。
- 嚴格遵守架構約束 A5（第 6 個 `@JavascriptInterface` `onMaPressed()` 無參數）、A44（`MaActivity` 與 `ChatActivity` 同等安全，`exported="false"`，網址來自 `maPageUrl`，禁止混合內容，禁止檔案存取，同源檢查與 403 阻擋，且不呼叫 `addJavascriptInterface`）。
- 保持既有程式碼相容性：`Reminder.ma` 預設為 `null`，既有 M0～M3R 測試無退化。
- 輔助測試避開 V06 金鑰偵測字串，範例編號使用 `rem-001`、`m4-01` 等格式。
- 因目前位於 master 主分支且尚無 `m4-lane-c` 分支，依據版本控制條款切換至 `m4-lane-c` 分支作業。

## 阻擋
- **前置批次接線缺口（規劃者 T0 尚未執行）**：
  - 錯誤指紋：`fingerprint-v06-m4-docs-leak`（`verify.sh:98` 偵測到 `docs/M4-*.md` 含敏感字樣規則說明）。
  - 完整錯誤訊息：
    ```
    docs/M4-EXPENSIVE-PLAN.md:68:6. **含 `s-k-` 的字串**：任何被追蹤的檔案（含測試）都不得出現敏感金鑰開頭；範例編號一律用英數字。
    docs/M4-LANE-B.md:62:6. **含 `s-k-` 的字串**：任何被追蹤的檔案（含測試）都不得出現敏感金鑰開頭；範例編號一律用英數字。
    docs/M4-LANE-C.md:60:6. **含 `s-k-` 的字串**：任何被追蹤的檔案（含測試）都不得出現敏感金鑰開頭；範例編號一律用英數字。
    docs/M4-LANE-D.md:60:6. **含 `s-k-` 的字串**：任何被追蹤的檔案（含測試）都不得出現敏感金鑰開頭；範例編號一律用英數字。
    ❌ V06 追蹤中的檔案含疑似憑證
    ```
  - 根因分析：規劃者在 cheap-plan 產出後尚未執行貴批次前置 T0（更新 `verify.sh` 與凍結規格測試），主倉庫之 `verify.sh` 仍停留在 M3R 版本（V06 僅排除 `docs/EXPENSIVE-PLAN.md`，未排除 M4 文件；V07 未排除 `MaActivity.kt`；V08 要求剛好 5 個介面而非 M4 的 6 個；且缺少 M4 的規格測試 `core/src/test/kotlin/com/accompany/pet/spec/m4/M4SpecTest.kt`）。
  - 處理對策：依據 §0.9 檔案所有權與 §0.10 接線與降級條款，C 線代理人禁止修改 `verify.sh`、`docs/` 與 `spec/`，故記錄於此處阻擋段落，並將修正需求交由整合階段處理。

## 需要整合處理
1. `verify.sh` 需由規劃者更新至 M4 版本：
   - V06 排除項需增加 `docs/M4-EXPENSIVE-PLAN.md` 與 `docs/M4-LANE-*.md`。
   - V07 需將 `MaActivity.kt` 加入排除名單（`--exclude=ChatActivity.kt --exclude=MaActivity.kt`）。
   - V08 需更新 `@JavascriptInterface` 數量檢查（允許 6 個）。
   - 加入 V33 驗收項（`MaActivity` 安全性檢查）。
2. 規劃者需補上凍結規格測試 `core/src/test/kotlin/com/accompany/pet/spec/m4/M4SpecTest.kt`（含 `M4-S15C`）。

## 高風險函式
- `com.accompany.pet.core.ma.pickMaPayload(raw: String?): String?`
  - 檔案與行號：`core/src/main/kotlin/com/accompany/pet/core/ma/MaModels.kt:9`
  - 說明：解析推播內的盤前均線 JSON 負載（上限 2048 字）。
  - 可能出錯方式：若過濾不嚴謹可能讓格式錯誤的字串進入後續解析造成解析例外。
- `com.accompany.pet.core.ma.maPageUrl(chatUrl: String?): String?`
  - 檔案與行號：`core/src/main/kotlin/com/accompany/pet/core/ma/MaModels.kt:18`
  - 說明：根據聊天網址解析出盤前均線網頁的完整 URL。
  - 可能出錯方式：若 chatUrl 包含非 HTTPS 或惡意網址未正確過濾，可能造成導向錯誤網址。
- `com.accompany.pet.PetBridge.onMaPressed()`
  - 檔案與行號：`app/src/main/java/com/accompany/pet/PetBridge.kt:53`
  - 說明：第 6 個 JavaScriptInterface，網頁點擊「看明細」或「📈 盤前均線」時喚起原生動作。
  - 可能出錯方式：在背景執行緒被頻繁呼叫若未正確轉回主執行緒可能導致執行緒競態或洩漏。
- `com.accompany.pet.OverlayService.onMaPressed()`
  - 檔案與行號：`app/src/main/java/com/accompany/pet/OverlayService.kt:524`
  - 說明：處理網頁請求開啟盤前均線畫面，重置閒置計時並以 FLAG_ACTIVITY_NEW_TASK 啟動 MaActivity。
  - 可能出錯方式：若聊天網址未設定時未正確攔截，可能導致畫面以無效 URL 啟動。
- `com.accompany.pet.OverlayService.showMa(json: String)`
  - 檔案與行號：`app/src/main/java/com/accompany/pet/OverlayService.kt:609`
  - 說明：將均線資料以安全跳脫的 JSON 字串傳給 WebView（window.pet.showMa）。
  - 可能出錯方式：若參數跳脫不全可能造成 JavaScript 注入。
- `com.accompany.pet.MaActivity`
  - 檔案與行號：`app/src/main/java/com/accompany/pet/MaActivity.kt:29`
  - 說明：全螢幕 WebView 載入遠端均線網頁，嚴格同源檢查、禁止混合內容、不掛載 JS 介面。
  - 可能出錯方式：同源判斷若被繞過可能導致非同源子資源載入或資料洩漏。
- `com.accompany.pet.ReminderNotifications.showReminderNotification(context: Context, r: Reminder)`
  - 檔案與行號：`app/src/main/java/com/accompany/pet/ReminderNotifications.kt:59`
  - 說明：發送系統通知，帶 ma 時 PendingIntent 指向 MaActivity 且不帶按鈕。
  - 可能出錯方式：PendingIntent FLAG 設定錯誤或未加上 FLAG_IMMUTABLE 可能存在安全弱點。
