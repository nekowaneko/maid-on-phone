# AccompanyPet M4 — C 線（Kotlin）執行計畫（盤前均線 F3）

> **你是 C 線代理人，只實作 Kotlin（Android App）這一條線。** 另外兩個代理人同時在做 D 線（Worker）與 B 線（前端），你們只靠本檔 §3 的介面溝通。**你只需要讀這一份檔案**，不需要讀其他計畫書；不要做 D、B 兩條線的任何事。
> 前提：docs/M4-CHEAP-PLAN.md 已執行完成（契約檔 `backend/config/ma-contract.json` 與 `app/src/main/assets/pet/ma-labels.js` 已存在）；規格測試已由規劃者凍結；你在自己的 git worktree、分支 `m4-lane-c` 上工作。
> 整合（合併三條線、接線、L3、報告）由規劃者負責，**不屬於你**。
> **這個功能在做什麼**：交易日 08:30，Worker 把盤前均線報告用 FCM 推播送到手機（推播多一個 `ma` 欄位）。App 依角色模式與是否在玩遊戲決定：角色出現並顯示報告泡泡、發一般通知、或排隊。使用者按泡泡的「看明細」或「📈 盤前均線」、或點通知時，App 開一個全螢幕 WebView（`MaActivity`）載入 Worker B 的網頁 `/web/ma.html`（那個網頁由 B 線做）。
> **使用者 2026-10-10 的決定（與你有關的）**：明細頁是 Worker B 網頁，不新增給遠端網頁用的 JS 介面；原生只新增第 6 個 `@JavascriptInterface`：`onMaPressed()`；角色模式關時，點通知進明細（不另做主畫面卡片）；玩遊戲中排隊的提醒沒有按鈕。

## 0. 執行協定（最高優先，違反即為失敗）

### 0.1 不提問
全程不得向使用者或規劃者提問。未明訂處依本檔 §7 預設值表處理；§7 未涵蓋時選擇最保守的做法，並把決策與理由記錄在 `lanes/M4-C.md` 的「決策」段落。
需要手機或人眼判斷的項目已在 DEVICE-CHECKLIST-M4.md，不得因此停下。

### 0.2 工作循環
    階段實作 → ./verify.sh --lane C → 全綠？
                                              ├─ 是 → commit（只在自己的分支）→ 下一階段
                                              └─ 否 → 自動修正 → 重跑

### 0.3 錯誤指紋斷路器【條款 1】
每次修正前，取失敗訊息的前三行做正規化（去除行號、路徑中的使用者名稱與 worktree 目錄名、時間戳記、十六進位位址）後雜湊，得到一枚「錯誤指紋」，記錄在 `lanes/M4-C.md`。
若同一枚指紋第二次出現，**立刻停止該項目**，在紀錄檔的「阻擋」段落寫下指紋、完整錯誤、已嘗試的修法、你判斷的根因，然後繼續處理其他項目。
輪數上限作為第二道防線，設為 3。
**不得為了讓指紋不同而改寫錯誤訊息或包裝例外。**

### 0.4 分層驗收【條款 2】
`verify.sh`（用 Git Bash 執行）分三層，依序執行，前一層失敗就不進入後一層：
- **L1（秒級）**：grep 類的結構、架構、安全檢查（每條線都跑全部 L1）
- **L2（十秒～一分鐘）**：只跑你這條線負責的部分：V11（`:core:test`）、V12（`:app:compileDebugKotlin`）
- **L3**：只在整合時由規劃者跑一次 `./verify.sh --full`。**你不得執行 `--full`、`assembleDebug`、`pitest`、Stryker。**

**你只跑 `./verify.sh --lane C`。** 不得吞掉任何一層的失敗回傳碼。

### 0.5 成本記錄【條款 6】
每階段結束時在 `lanes/M4-C.md` 的「進度」段落記錄：該階段的修正輪數、出現過的錯誤指紋清單、每個驗收項各失敗過幾次。整合時由規劃者匯總。

### 0.6 版本控制
- 你已經在自己的 worktree 裡，分支為 `m4-lane-c`。**只在這個分支 commit**，不得 checkout 其他分支、不得 merge、不得 rebase、不得 push、不得設遠端。
- 每階段驗收通過後 commit 一次，訊息用繁體中文，以「M4 C：」開頭，結尾加 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。
- 不得加入 `.idea/`、`tools/push.json`、`frames/local/`、`backend/node_modules/`、`package-lock.json`。

### 0.7 語言與程式風格
所有註解、文件、commit 訊息、使用者看得到的文字使用**繁體中文（臺灣用語）**（品質而非質量、資料而非數據、程式而非程序）。
- **Kotlin**：每個函式上方一行中文註解；關鍵行尾加簡短中文註解；小而單純的頂層函式；常數集中在檔案上方並加「// 常數定義」標題。先讀 `core/.../reminder/Reminder.kt`、`app/.../ChatActivity.kt`、`app/.../OverlayService.kt`、`app/.../PetBridge.kt`、`app/.../ReminderDispatcher.kt`、`app/.../ReminderNotifications.kt`，以及 M3R 對 Todoist 做的同類修改（`TodoistModels.kt`、`Reminder.todoist`、`onTodoistAction`、`showTodoist`），照它們的寫法。
- **程式碼檔一律用 Write／Edit 工具寫，不用 shell heredoc**（M1.6 的 `\1`、`\n` 都在這裡出過事）。

### 0.8 規格測試凍結【條款 7】
規劃者已把本檔 §4 的規格範例表轉成測試並 commit「凍結 M4 規格測試」。`core/src/test/kotlin/com/accompany/pet/spec/` 與 `backend/tests/spec/` 不得有任何變動（V04 檢查）。M0～M3R 的規格測試一字不改。
規格測試與實作衝突、且你確信是規格有問題時，**不得修改測試**，在紀錄檔標記「規格爭議」（含列編號、你的理由、建議的改法），繼續處理其他項目。
你自己寫的輔助測試放在 spec 目錄以外（見 §1），可以自由增修。**複製來的 accompany_bot 原有測試與照抄的 `costdown-*.test.js` 不得修改。**
規格測試一律**呼叫實作**，你的實作必須讓它們真的通過；不得為了通過而讓程式偵測測試環境。

### 0.9 平行開工規則（違反即為失敗）
另外兩個代理人同時在做另外兩條線，你們只靠本檔 §3 的介面溝通。
1. **檔案所有權**：你只能新增或修改 §1 表中屬於你的檔案。需要改別條線或規劃者的檔案時，不得修改，在紀錄檔寫下「需要整合處理：<檔案>：<原因>」，繼續其他項目。
2. **契約檔不得修改**：`backend/config/ma-contract.json`、`ma-defaults.json`、`ma-lines.json`、`ma-glossary.json`、`ma-script-prompt.md`、`app/src/main/assets/pet/ma-labels.js`、`design/prototype/` 全部、`verify.sh`、`docs/`、兩個 spec 目錄，加上 M2、M3R 計畫書列的全部契約檔（`drink-*`、`todoist-*`、`emotion-map.*`、`calorie.js`、`ledger.js`、`todoist-labels.js`、`drink-labels.js`）。句子都是使用者確認過的，連措辭也不得改。
3. **共用文件不得修改**：`PROGRESS.md`、`DECISIONS.md`、`BLOCKERS.md`、`CHECKLIST.md`、`SPEC-MAP.md`、`README.md`、各種報告（`*-REPORT.md`、`RISK-REVIEW.md`、`ACCEPTANCE-*.md`）、`DEVICE-CHECKLIST-*.md`。
4. **紀錄檔**：你只寫自己的 `lanes/M4-C.md`，內容依序為：`## 進度`、`## 決策`、`## 阻擋`（斷路器停下的項目、規格爭議）、`## 需要整合處理`、`## 高風險函式`（依條款 10：列出你新增或修改的函式中，處理金額、憑證、他人資料、刪除或覆蓋檔案、對外部服務寫入的，每項含檔案與行號、一句白話說明、可能出錯的方式）。
5. **接口照本檔 §3 實作**，不得自行改名、改參數順序、改回傳格式。
6. **含 `sk-` 的字串**：任何被追蹤的檔案（含測試）都不得出現「小寫 s、小寫 k、連字號」這三個連續字元（V06 會當成金鑰）；範例編號一律用英數字。

### 0.10 接線與降級【條款 11、12】
- 功能不能只靠單元測試證明完成：從真實入口走到成品才算（你這條線的入口驗證見 §4B）。測試只准替換外部服務；你自己要驗收的函式一律用真的，不得 monkeypatch。
- 缺函式、缺依賴或失敗時必須丟例外，交給既有的失敗處理。不得用 `hasattr`／存在判斷式備援、寫假檔、寫固定假資料、或在 `catch` 內回傳假的成品來讓測試通過。需要降級時，本檔必須寫明降級路徑與對應規格列。
- 無法完成某項功能時寫入紀錄檔「阻擋」，不得以假實作交差。
- 發現前置批次（M0～M3R）的接線缺口時，不得自行修改不屬於本批次範圍的檔案，在紀錄檔「阻擋」寫標題「前置批次接線缺口」並停止後續階段。

### 0.11 不屬於你的事
條款 4（非決定性檢查不進自動層）、條款 5（驗收項數量）、條款 8（離線安全掃描與報告）、條款 9（突變測試報告）由規劃者在整合時處理，你不需要做；但 L1 會跑安全掃描，你的程式不得出現憑證。


## 1. 本線範圍與檔案所有權

| 動作 | 檔案 |
|---|---|
| **新增** | `core/src/main/kotlin/com/accompany/pet/core/ma/MaModels.kt`、`app/src/main/java/com/accompany/pet/MaActivity.kt`、`core/src/test/kotlin/com/accompany/pet/core/ma/`（輔助測試）、`core/src/test/kotlin/com/accompany/pet/helper/`（輔助測試）、`lanes/M4-C.md` |
| **修改** | `core/src/main/kotlin/com/accompany/pet/core/reminder/Reminder.kt`、`app/src/main/java/com/accompany/pet/` 下除 `ChatActivity.kt` 以外的檔案（預期是 `PetBridge.kt`、`OverlayService.kt`、`ReminderDispatcher.kt`、`ReminderNotifications.kt`、`PetControl.kt`）、`app/src/main/AndroidManifest.xml`、`app/src/main/res/`（若需要） |
| **不得碰** | **`ChatActivity.kt` 一字不動**（V07 逐行檢查它）、`backend/`、`app/src/main/assets/`（B 線的）、`core/build.gradle.kts`、所有契約檔與 spec 目錄 |

### 1.1 既有驗收不得退化
M0～M3R 的規格測試（含 Kotlin 規格測試）在你的 L2 範圍內全部仍須通過。**不得修改既有函式的簽名**，否則既有驗收會連鎖失效（`Reminder` 新增欄位 `ma` 要有預設值 `null`）。全套回歸只在整合時跑一次（L3）。

## 2. 不可協商的架構約束（全部線共用，你只需遵守與你有關的）

A1～A38 是 M1～M3R 已有的架構約束，已由 `verify.sh` 的 L1 檢查，違反時它會告訴你，你不需要逐條讀。以下是 M4 的**修訂**與新增：

| # | 約束 | 理由 | 檢查 |
|---|---|---|---|
| A5（修訂） | `@JavascriptInterface` 恰好 **6** 個：M3R 的 5 個＋`onMaPressed()`（無參數，只通知原生「要開盤前均線明細」） | 泡泡「看明細」與「📈 盤前均線」要通知原生開網頁；不開給遠端網頁任何介面 | V08 |
| A39 | `backend/core/ma.js` 是純函式：不讀時間、不讀檔、不連線、不碰環境變數（沿用 A1、V24） | 均線與交易日計算要能用固定資料測 | V24 |
| A40 | 只有 `backend/worker/twse-client.js` 可以出現 `twse.com.tw` 並連線證交所；網址從 `ma-defaults.json` 讀 | 連外集中一處 | V31 |
| A41 | F3 的 08:30 排程段必須在 `runScheduled` 裡 **Todoist 判斷（`if (!deps.todoist ...) return`）之前**，且有自己的 try/catch；沒有 Todoist 權杖也要照跑；F3 失敗不得影響 P3 掃描與戒飲詢問 | 現有 `runScheduled` 在沒有 Todoist 時會提早 return，F3 排在後面就永遠不會執行 | V34 |
| A42 | F3 對 D1 的寫入只有三張新表（`ma_watch`、`ma_close`、`ma_result`）的 `INSERT`／`UPDATE`／`INSERT OR REPLACE`；**不得有任何 `DELETE`**，不得改既有表 | 停止追蹤只標記不追蹤，歷史保留（使用者核可的 §3.4 例外） | V35 |
| A43 | 明細網頁只連同源 `/api/ma/*` 與 `../config/ma-*.json`；存取密鑰只從 `localStorage` 的 `companion:secret` 讀、只放進 `x-app-secret` 標頭；`ma.js` 中 `innerHTML` 只能出現在單一函式 `setHtml(el, html)`，且 html 由 `ma-render.js` 組成、每個動態值都經 `escapeHtml` | 股票名稱與錯誤訊息是外部輸入 | V33 |
| A44 | `MaActivity` 與 `ChatActivity` 同等安全：`exported="false"`、網址只來自 `maPageUrl(BuildConfig.CHAT_URL)`、同源導覽與子資源檢查、不呼叫 `addJavascriptInterface` | 遠端網頁不得取得原生能力 | V33 |
| A45 | 說明文字（定義、比喻、示意圖點）只存在 `ma-glossary.json`；一行描述、失敗與等待台詞、錯誤訊息、免責聲明只存在 `ma-lines.json`；`ma.js`、`ma-render.js`、`handlers.js` 不得寫死這些句子 | 句子是使用者確認過的，不經語言模型，也不得在程式裡被悄悄改掉 | V32 |
| A46 | 語言模型只用來產生**開場一句**；均線、排列、檔數、每檔描述、免責聲明一律規則產生。開場台詞不得含任何數字（阿拉伯與全形） | F0.5「台詞統一出口」的例外與其限制 | 規格測試 M4-S14 |
| A47 | 推播 `ma` 欄位只有 F3 的推播帶；其他推播的資料格式逐字不變 | M15-S07、M16-S01 | 規格測試（既有） |

**每一條架構約束都有一個對應的驗收項。**

## 3. 介面規格（固定，規格測試與另外兩條線都依賴它）

下列是 C 線要實作的介面，以及你要消費的推播格式。`window.pet.showMa` 由 B 線實作，你只負責呼叫它；推播由 D 線產生，你只負責解析。

### 4B.1 JS 介面（B 提供 `window.pet.showMa`、C 提供 `PetBridge.onMaPressed`）

**C 呼叫 B**：`window.pet.showMa(jsonText)`（`JSONObject.quote()` 後 `evaluateJavascript`），`jsonText` 為推播 `ma` 欄位的內容再加一個 `script` 欄位：`{"date","asOf","u","d","m","status","script"}`。
**B 呼叫 C**：`PetBridge.onMaPressed()`，無參數。C 收到後在主執行緒開啟 `MaActivity`（`FLAG_ACTIVITY_NEW_TASK`），並算一次互動（重置閒置計時）；`maPageUrl(BuildConfig.CHAT_URL)` 是 null → `showText` 顯示既有的「尚未設定聊天網址」提示，不開畫面。

### 你要消費的推播格式（由 D 線產生）

**報告推播**（見下）；回 `ok`。
8. 推播成功才寫 `ma.sentOn = today`。推播失敗不寫、不丟例外。

**報告推播**：開場台詞由語言模型依人設產生（系統提示沿用 `buildSystemPrompt`＋`ma-script-prompt.md`，用量照 M2 記錄）。台詞剝標籤後**含任何數字（`0-9`、`０-９`）、超過 `openingMaxChars`（40）字、或是空字串** → 重試 1 次；仍不行或語言模型失敗 → `lines.opening[0]`。
- FCM data：`{ id, text, script, ma }`。`id` 為 `ma-YYYYMMDD`（報告日）。`script` 為帶標籤的開場。`text` 為「剝標籤後的開場」＋空白＋`lines.countsSentence`（`{u}`、`{d}`、`{m}` 填檔數）。`ma` 為 `buildMaPayload(今天, asOf, 檔數, 'ok')`。
- `push.js` 不改：D 在 `handlers.js` 把 `ma` 欄位加進 `buildFcmMessage` 的結果 `message.data`（做法同 M3R 的 `todoist` 欄位）。

### 4B.4 C：Kotlin

```kotlin
// core/ma/MaModels.kt（純函式；常數與 ma-contract.json 一致，由規格測試讀契約檔比對）
const val MA_PAYLOAD_MAX_CHARS = 2048
const val MA_PAGE_PATH = "/web/ma.html"
fun pickMaPayload(raw: String?): String?     // null、超過 2048 字、trim 後不是 { 開頭 } 結尾 → null；否則回 trim 後原文
fun maPageUrl(chatUrl: String?): String?     // apiOrigin(chatUrl) + MA_PAGE_PATH；chatUrl 不是 https 或無法解析 → null

// Reminder.kt
data class Reminder(..., val ma: String? = null)   // parseReminder 讀 data["ma"]，用 pickMaPayload
```

App：
- `ReminderDispatcher`：`SHOW_PET` 且 `ma` 不是 null → `startPetService(context, maJson = r.ma, maScript = r.script)`；角色出現後先報告排隊，再用 `JSONObject(ma)` 驗 `status` 在契約 `push.pushStatuses`、`u`、`d`、`m` 是 ≥ 0 的整數，通過才 `put("script", script)` 交給 `showMa`，不通過改用 `showScript(script)`。
- `NOTIFY`（角色模式關）：`ma` 不是 null 的提醒，通知的點擊動作開 `MaActivity`（`PendingIntent.FLAG_IMMUTABLE`）；沒有 `ma` 的提醒維持既有行為。通知不加按鈕。
- `QUEUE`（玩遊戲中）：照 M1.6，只顯示／報告台詞，**沒有 Ma 按鈕**；使用者之後可按「📈 盤前均線」。
- `PetBridge`：加 `@JavascriptInterface fun onMaPressed()`（§4B.1）。
- `OverlayService`：處理 `onMaPressed`、新增 `showMa(json)`（寫法同 `showTodoist`，頁面未載入時暫存）。
- `MaActivity`：照 `ChatActivity` 的寫法複製一份（不得修改 `ChatActivity.kt`）：全螢幕 WebView；`val url = maPageUrl(BuildConfig.CHAT_URL)`，null 就 `finish()`；`javaScriptEnabled`、`domStorageEnabled`（網頁用它讀存取密鑰）；`allowFileAccess = false`；`MIXED_CONTENT_NEVER_ALLOW`；只允許同源導覽與子資源（`isSameOrigin`，非同源子資源回 403）；返回鍵先返回網頁上一頁；**不呼叫 `addJavascriptInterface`**。`AndroidManifest.xml` 註冊，`exported="false"`，主題同 `ChatActivity`。

## 4. 規格範例表（使用者已確認，2026-10-10）【條款 7】

共通前提：「現在」是交易日 08:30（台北時間）；證交所資料、語言模型的回覆、休市日曆都是測試給定的固定內容；代號與編號用英數字。M4-S01～S15 為使用者 2026-10-10 確認；其中 S03～S06 的種類名稱與 S04 的描述文字依同日原型修訂（使用者要求「轉弱、轉強要說清楚」）。M4-S16、M4-S17 為衍生新增列，使用者已於 2026-10-10 確認。

本表只列**你這條線負責的列**；其他列由另外兩條線實作。

| 編號 | 情境 | 預期結果 | 線 |
|---|---|---|---|
| M4-S15 | 手機收到帶 `ma` 欄位的推播：角色模式開；角色模式關；正在玩遊戲；`ma` 欄位壞掉（太長或不是 JSON） | 開：角色出現，泡泡有摘要與「看明細」。關：一般通知，點通知進明細頁。玩遊戲：排隊、放靜音通知。壞掉：當一般提醒，不閃退 | C、B |

轉寫與實作規則：
- 你的規格測試已凍結在 `core/src/test/kotlin/com/accompany/pet/spec/m4/M4SpecTest.kt`，測試函式名稱為 `M4-S15C`（只有 1 個）。它檢查：`parseReminder` 保留合格的 `ma`、丟掉超過 2048 字或不是 `{…}` 的 `ma`；`maPageUrl` 的結果；既有的「角色模式開→出現／關→通知／玩遊戲→排隊」決策函式對帶 `ma` 的提醒不受影響。**不得修改**。
- 規格測試一律呼叫實作；你要讓它通過。
- B 線負責的 `M4-S15B`（泡泡摘要與按鈕）不是你的事。

## 4B. 入口與接線驗證【條款 11、12】

你這條線的接線由 `core` 的純函式測試加上 V33 的 grep 驗證；實際從推播走到 `MaActivity` 載入網頁的整段由規劃者在整合階段的接線檢查與 DEVICE-CHECKLIST-M4.md 的手機實測負責。你要保證：

- `ReminderDispatcher` 是真的呼叫 `pickMaPayload`／讀 `Reminder.ma`，並在 `SHOW_PET` 時呼叫 `showMa`、`NOTIFY` 時把通知點擊指向 `MaActivity`；不得只寫函式卻沒有任何呼叫端（條款 11）。
- `PetBridge.onMaPressed()` 真的會開啟 `MaActivity`（`OverlayService` 內的處理）。
- `MaActivity` 載入的網址只能來自 `maPageUrl(BuildConfig.CHAT_URL)`；null 時 `finish()`；不得用假網址或預設網址降級（條款 12）。
- 缺函式、缺資料時丟例外交給既有的失敗處理；不得在 `catch` 內回傳假值讓流程看起來成功。

**V33（你的程式必須通過）**：`AndroidManifest.xml` 中 `MaActivity` 為 `android:exported="false"`；`MaActivity.kt` 的 `loadUrl` 參數只來自 `maPageUrl`；含 `shouldOverrideUrlLoading` 與 `shouldInterceptRequest`；不含 `addJavascriptInterface`。
**V08（你的程式必須通過）**：`@JavascriptInterface` 在 `app/src/main` 恰好 6 次（你的 worktree 起跑時是 5 次，加上 `onMaPressed` 後是 6）。

## 5. 實作階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| T0a | 確認 CHEAP-PLAN 的產出檔案存在且非空（`backend/config/ma-contract.json`、`app/src/main/assets/pet/ma-labels.js`）；缺檔就停止，寫入紀錄檔「阻擋」，**不要自行補寫** | 清單齊全 |
| C1 | core：`MaModels.kt`（`pickMaPayload`、`maPageUrl`、常數）、`Reminder.ma`＋`parseReminder` 讀 `data["ma"]`＋輔助測試 | `--lane C` 全綠，`M4-S15C` 通過 |
| C2 | app：`PetBridge.onMaPressed`、`OverlayService`（處理 `onMaPressed`、新增 `showMa`、頁面未載入時暫存）、`ReminderDispatcher`（`SHOW_PET` 帶 `ma` 時 `startPetService(..., maJson, maScript)`；驗 `ma` JSON 後呼叫 `showMa`）、`ReminderNotifications`（`NOTIFY` 帶 `ma` 時通知點擊開 `MaActivity`）、`PetControl.startPetService` 參數、`MaActivity`、`AndroidManifest.xml` 註冊 | `--lane C` 全綠，V08（6 個介面）與 V33 通過 |

每階段的完成條件，都包含與該階段模組相關的規格測試通過。完成 C2 後輸出 §9 的回報。

## 6. 驗收清單

你的完成條件：`./verify.sh --lane C` 全綠（L1 全部＋L2 的 V11、V12），且 `M4-S15C` 通過，既有驗收無退化。與你直接有關的驗收項是 V04、V05、V07、V08、V11、V12、V18、V29、V33（下表為全部驗收項，供對照）。

### 6.1 全部自動驗收項（供對照；你只需讓 `--lane C` 全綠） 自動驗收項【條款 5】

沿用 V01～V30（M3R 之前的全部）。以下是 M4 的**修訂**（V04、V05、V06、V08、V26、V27、V11／V12）與**新增**（V31～V38），挑選標準是「壞掉會出事」。加上沿用的項目，總數超過 20，每一項都能說出壞掉會出什麼事（憑證洩漏、權限繞過、資料遺失、約束被違反、功能沒接上產線）：

| # | 層 | 驗收項 | 判定方式 |
|---|---|---|---|
| V04（修訂） | L1 | 規格測試目錄與 M4 凍結版本相同【條款 7】 | `git diff --quiet <凍結 hash> -- <spec 目錄>` |
| V05（修訂） | L1 | 加 M4 的列：Kotlin `M4-S15C` 1 個；JS `M4-S01`～`S14`、`S16`（D）15 個、`M4-S15B`、`M4-S17`（B）2 個，各出現一次；沒有略過或獨跑標記【條款 7】 | grep 列編號 |
| V08（修訂） | L1 | `@JavascriptInterface` 恰好 6 次（`--lane` 的 worktree 5 或 6 次都算通過）；`MaActivity.kt` 不含 `addJavascriptInterface` | grep |
| V06（沿用，擴充） | L1 | 沒有真實憑證與私人素材被追蹤；新增的 `ma-*` 設定檔不含金鑰樣式【條款 8】 | gitleaks 或 grep |
| V31 | L1 | `twse.com.tw` 只出現在 `twse-client.js`（與 `ma-defaults.json`、測試、文件）；`wrangler.toml` 不含 `twse` 設定 | grep |
| V32 | L1 | 說明與台詞唯一來源：`ma.js`、`ma-render.js`、`handlers.js` 不含 `ma-glossary.json` 與 `ma-lines.json` 的任何一句完整句子（取各檔每個字串值的前 12 個字做樣本）；「僅供參考，非投資建議」只出現在 `ma-lines.json`、`ma-glossary.json`、測試與文件 | grep（腳本由規劃者寫在 `verify.sh`） |
| V33 | L1 | 網頁與 WebView 安全：`ma.js` 的 `innerHTML` 恰好出現 1 次；`ma.js`、`ma-render.js` 不含 `eval(`、`document.write`、跨網域 `fetch`（只允許相對路徑）；`MaActivity` 在 Manifest 為 `exported="false"`、`loadUrl` 的參數只來自 `maPageUrl`、含 `shouldOverrideUrlLoading` 與 `shouldInterceptRequest` | grep |
| V34 | L1 | F3 排程段位置：`handlers.js` 中呼叫 `runMaReport` 的行號小於 Todoist 判斷（`!deps.todoist`）的行號，且該呼叫在自己的 `try` 內（A41） | grep 行號 |
| V35 | L1 | 無靜默降級與無刪除【條款 12、A42】：§4.6 W-C 的寫法為零；`schema.sql` 與 `store.js` 不含 `DELETE FROM ma_` | grep／ast |
| V36 | L2 | 產線入口驗證存在且通過【條款 11】：`ma-pipeline.test.js`、`ma-wiring.test.js` 存在；且不含 `mock.method`、`monkeypatch`、`jest.mock`、`sinon.stub` | 檔案存在＋grep＋測試通過 |
| V26（修訂） | L2 | backend 測試通過數下限更新為（M3R 數字＋M4 新增測試數，由規劃者在 `verify.sh` 填）；沒有失敗 | `node --test` |
| V27（修訂） | L2 | 角色頁與明細網頁測試通過（§0.4 B 線範圍） | `node --test` |
| V11／V12 | L2／L3 | Kotlin：`:core:test`、`:app:compileDebugKotlin`；L3 另跑 `assembleDebug`（V13） | gradle |
| V37 | L3 | `MUTATION-REPORT.md` 已產生，且「執行範圍」含 `backend/core/ma.js`；工具無法執行時依 §7 寫成待補【條款 9】 | grep |
| V38 | L3 | `RISK-REVIEW.md` 已產生，且涵蓋 §2.1 的五個模組名稱【條款 10】 | 檔案存在＋grep |

**禁止為了通過驗收而做的事**：修改 tests/spec/ 的任何內容、修改驗收標準、skip 測試、放寬斷言、改弱 grep 條件、把產線入口驗證換成 stub 或 monkeypatch（外部服務除外）、在 verify.sh 中吞掉失敗回傳碼、包裝例外以改變錯誤指紋、為了讓 V32 通過而改寫使用者確認過的句子。確實無法通過的項目走 §0.3 的斷路器流程。

### 6.2 耦合驗收項【條款 3】

| 項目 | 與之衝突 | 衝突時的優先順序 |
|---|---|---|
| V34：F3 排程段在 Todoist 判斷之前 | M3R-S13：沒有 Todoist 權杖時，Todoist 三段不做事、不報錯 | **兩者並存**：F3 先跑、各自 try/catch；沒有權杖時只有 Todoist 段被略過，F3 照跑 |
| 08:30 多一個 F3 段 | M3R-S12：同一時刻不會補送戒飲詢問；每天出聲上限 | **F3 不計入 F2 的 2 次上限**（使用者決定）；戒飲詢問仍只在分鐘為 0 時執行 |
| 推播多一個 `ma` 欄位 | M15-S07、M16-S01：推播格式逐字相同 | **兩者並存**：只有 F3 推播帶 `ma` 欄位 |
| A5 修訂為 6 個介面 | V08 | **以本計畫書為準**：V08 改為恰好 6 |
| 「停止追蹤」 | M2 之後的 §3.4「任何刪除第一版不提供」 | **使用者核可的例外**：只標記不追蹤、歷史保留，A42 禁止 `DELETE` |
| V32 句子唯一來源 | D 線想調整台詞措辭 | **V32 優先**：`ma-lines.json` 與 `ma-glossary.json` 的句子（八種描述、免責聲明、錯誤訊息、標籤、說明文字、預設開場）D 線不得改，也不得在程式裡另寫一份；開場台詞由語言模型產生，不在此限 |
| 重複觸發保護（`ma.sentOn`） | 推播失敗時想重送 | **不重送**：推播失敗不寫 `ma.sentOn`，但同一次排程不重試；使用者可從「📈 盤前均線」看報告，或用 `/api/ma/refresh` 重算 |
| 輔助測試 | 規格測試 | **規格測試優先**：修改輔助測試或實作，不得動規格測試 |

## 7. 預設值表（不要為這些提問）

### 7.1 使用者 2026-10-10 確認的事項

| # | 事項 | 決定 |
|---|---|---|
| Q1 | 明細頁載體 | Worker B 網頁 `ma.html`，同網域共用存取密鑰，不新增遠端網頁用的 JS 介面 |
| Q2 | 泡泡的「看明細」與「📈 盤前均線」 | 新增第 6 個 `@JavascriptInterface`：`onMaPressed()` |
| Q3 | 追蹤清單是空的，08:30 要不要推播 | 不送 |
| Q4 | 資料不足、糾結、明顯轉弱的文字 | 照 §4.5 的 S04～S06；轉弱、轉強用天氣比喻說清楚（`ma-glossary.json`） |
| Q5 | 休市判定 | 週末，加上證交所休市日曆；證交所最新一筆日期不是前一交易日，視為取得失敗 |
| Q6 | 說明入口 | 卡片「什麼意思？」展開與「看懂排列」整頁兩個都留 |
| Q7 | 摘要與歷史矩陣 | 維持「其他」；卡片標籤用細分名稱 |
| Q8 | 角色模式關時的重看路徑 | 點通知進明細，不另做 App 主畫面卡片 |
| Q9 | 泡泡第 5 顆按鈕 | 「📈 盤前均線」維持，不換入口 |
| Q10 | 「停止追蹤」是否違反 §3.4 | 不算刪除，使用者核可 |

### 7.2 已定案

| 問題 | 預設值 |
|---|---|
| 休市日曆取得失敗 | 視為不確定：不送推播、不寫歷史，只記錯誤代碼（避免在休市日誤發失敗通知） |
| 收盤價資料來源 | 每檔每次排程抓 `asOf` 所在月份的 `STOCK_DAY`（1 次）；`STOCK_DAY_ALL` 只在新增標的時用來驗證代號與取名稱 |
| 單次 Worker 執行的外部請求 | 排程：每檔 1 次＋休市日曆 1 次＋語言模型最多 2 次＋FCM 約 2 次，遠低於 50；新增標的：1＋4 次 |
| 均線比較 | 先四捨五入到小數 2 位再比較；任兩條相等算糾結 |
| 新加入的標的 | 下一個交易日 08:30 起納入；歷史不回補，顯示「—」；加入當天補抓收盤價 |
| 追蹤上限 | 10 檔（暫訂） |
| 開場台詞 | 一句、不超過 40 字、不含數字、不提個別股票、不預測、不建議買賣；不合格重試 1 次，仍不行用 `ma-lines.json` 的 `opening` |
| 推播 `text` | 剝標籤後的開場＋空白＋「多頭 N、空頭 N、其他 N。」 |
| 玩遊戲中排隊的 F3 提醒 | 只報告台詞，沒有按鈕；使用者可按「📈 盤前均線」 |
| 「晚點再看」 | 清掉按鈕組並收起泡泡（網頁端處理，不新增原生介面） |
| 證交所請求間隔 | 1000 毫秒（`twseDelayMs`），測試用立即完成的 `sleep` |
| 重試（`/api/ma/refresh`） | 重算今天的報告但不推播；60 秒內只能一次 |
| 失敗通知 | 只在確定是交易日且全部標的都失敗時送，每天最多一則 |
| 同時刻 F3 與 P3 | F3 先跑；各自 try/catch |
| 兩種實作都合理 | 選較保守、較容易測試的那個 |
| 某套件在此環境安裝失敗 | 改用標準庫替代方案並記錄在自己的紀錄檔，不得降低安全性 |
| §4.5 沒涵蓋的行為 | 選最保守的做法，記錄在紀錄檔，並寫成建議新增的規格範例列 |
| 規格範例與介面規格（§4）衝突 | 不修改任何一方，標記「規格爭議」 |
| 原型沒畫的狀態（單檔失敗卡片） | 照 `screens.md` S4 的文字實作 |
| §2.2 突變測試工具無法執行（例如 Stryker 在此環境不能跑） | 不得自製量測工具，不得安裝或執行替代品。唯讀搜尋 GitHub（最多 5 次、記錄最多 3 個候選：開源免費、支援 JavaScript 與 Windows、近 12 個月有更新、能指定範圍），`MUTATION-REPORT.md` 寫成「狀態：待補」並填齊欄位（未執行原因、預定範圍、程式版本、原工具補跑方式、替代品候選、搜尋紀錄），`CHECKLIST.md` 加「突變測試待補」項，`PROGRESS.md` 記一行 |
| 安全掃描工具無法安裝 | 改用 grep 常見樣式，記錄在 DECISIONS.md，不得跳過 |

## 8. 絕對禁止事項

既有的 M2、M3R 禁止事項（不連真實服務、不含真實憑證、不 push 等）已涵蓋在 §0 與本節，其餘由 L1 檢查。M4 另加：
- 不得連到真正的證交所（測試一律用 stub 或假的 `fetchImpl`）；唯一例外：突變測試工具無法執行時，可唯讀瀏覽 GitHub 搜尋替代品，結果不影響任何驗收判定。
- 不得對 `ma_*` 資料表執行 `DELETE`，不得改既有資料表。
- 不得新增第 7 個 `@JavascriptInterface`，不得對 `MaActivity` 加 `addJavascriptInterface`。
- 不得修改 `ChatActivity.kt`。
- 不得改寫使用者確認過的任何句子（八種描述、說明文字、免責聲明、錯誤訊息）。
- 不得自行改版 `ma.html` 的畫面結構、元件或文字。
- 不得在 log、錯誤訊息、回應中寫出存取密鑰；證交所回應內容不得寫進 log（只記錯誤代碼）。
- 不得自製突變量測工具；不得 clone、下載、安裝或執行搜尋到的替代品。
- 不得向使用者提問。不得設遠端、不得 push。
- 不得修改 `ChatActivity.kt`；不得對 `MaActivity` 加 `addJavascriptInterface`。
- 不得新增第 7 個 `@JavascriptInterface`。
- 不得在 `WorkerApi.kt` 以外自行連外；不得寫死網址或密鑰（V18、V29）。
- 不得修改 `backend/`、`app/src/main/assets/`（那是 B 線與 D 線的）。
- 不得讓通知點擊以外的路徑繞過 `MaActivity` 的同源檢查。

## 9. 完成後的回報格式

完成後輸出（不要輸出多餘內容）：

    ✅ M4 C 線完成。

    驗收結果：./verify.sh --lane C 全部通過（或：通過 n 項，m 項未通過，詳見 lanes/M4-C.md 的阻擋）
    規格測試：M4-S15C 通過；規格爭議 <n> 項
    既有驗收無退化

    成本摘要：
    | 階段 | 修正輪數 | 觸發過的錯誤指紋 |
    |---|---|---|
    | C1 | <n> | <n> 種 |
    | C2 | <n> | <n> 種 |
    合計修正輪數：<n>

    Commit 數：<n>

    需要整合處理：<n> 項（見 lanes/M4-C.md）

## 10. 故意不做的事

- D、B 兩條線的任何內容（Worker、泡泡、明細網頁）。
- 通知上的按鈕；App 主畫面的盤前均線卡片；玩遊戲排隊時的 Ma 按鈕。
- 修改 `ChatActivity.kt`、契約檔、規格測試、`core/build.gradle.kts`。
- 不擴充範圍；有建議寫進 `lanes/M4-C.md` 的「決策」段落，不要實作。
