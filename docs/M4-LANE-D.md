# AccompanyPet M4 — D 線（Worker）執行計畫（盤前均線 F3）

> **你是 D 線代理人，只實作 Worker 這一條線。** 另外兩個代理人同時在做 C 線（Kotlin）與 B 線（前端），你們只靠本檔 §3 的介面溝通。**你只需要讀這一份檔案**，不需要讀其他計畫書；不要做 B、C 兩條線的任何事。
> 前提：docs/M4-CHEAP-PLAN.md 已執行完成（契約檔 `backend/config/ma-contract.json`、`ma-defaults.json`、`ma-lines.json`、`ma-glossary.json`、`ma-script-prompt.md` 都已存在）；規格測試已由規劃者凍結；你在自己的 git worktree、分支 `m4-lane-d` 上工作。
> 整合（合併三條線、接線、L3、報告）由規劃者負責，**不屬於你**。
> **這個功能在做什麼**：交易日 08:30，Worker 用證交所的收盤價算每檔追蹤標的的 5／20／60 日均線排列（八種：多頭、空頭、轉弱、明顯轉弱、轉強、初步轉強、糾結、資料不足），語言模型只說開場一句，其餘由規則產生；透過 FCM 推播給手機；另外提供報告、歷史、追蹤清單管理的 API 給明細網頁使用。
> **使用者 2026-10-10 的決定（與你有關的）**：追蹤清單是空的，08:30 不送推播；休市判定用週末加證交所休市日曆；「停止追蹤」不算刪除（只標記，歷史保留）；F3 不計入 F2 每天 2 次的上限。

## 0. 執行協定（最高優先，違反即為失敗）

### 0.1 不提問
全程不得向使用者或規劃者提問。未明訂處依本檔 §7 預設值表處理；§7 未涵蓋時選擇最保守的做法，並把決策與理由記錄在 `lanes/M4-D.md` 的「決策」段落。
需要手機或人眼判斷的項目已在 DEVICE-CHECKLIST-M4.md，不得因此停下。

### 0.2 工作循環
    階段實作 → ./verify.sh --lane D → 全綠？
                                              ├─ 是 → commit（只在自己的分支）→ 下一階段
                                              └─ 否 → 自動修正 → 重跑

### 0.3 錯誤指紋斷路器【條款 1】
每次修正前，取失敗訊息的前三行做正規化（去除行號、路徑中的使用者名稱與 worktree 目錄名、時間戳記、十六進位位址）後雜湊，得到一枚「錯誤指紋」，記錄在 `lanes/M4-D.md`。
若同一枚指紋第二次出現，**立刻停止該項目**，在紀錄檔的「阻擋」段落寫下指紋、完整錯誤、已嘗試的修法、你判斷的根因，然後繼續處理其他項目。
輪數上限作為第二道防線，設為 3。
**不得為了讓指紋不同而改寫錯誤訊息或包裝例外。**

### 0.4 分層驗收【條款 2】
`verify.sh`（用 Git Bash 執行）分三層，依序執行，前一層失敗就不進入後一層：
- **L1（秒級）**：grep 類的結構、架構、安全檢查（每條線都跑全部 L1）
- **L2（十秒～一分鐘）**：只跑你這條線負責的部分：V26（backend 測試，不含角色頁與明細網頁的測試，通過數下限見 verify.sh）
- **L3**：只在整合時由規劃者跑一次 `./verify.sh --full`。**你不得執行 `--full`、`assembleDebug`、`pitest`、Stryker。**

**你只跑 `./verify.sh --lane D`。** 不得吞掉任何一層的失敗回傳碼。

### 0.5 成本記錄【條款 6】
每階段結束時在 `lanes/M4-D.md` 的「進度」段落記錄：該階段的修正輪數、出現過的錯誤指紋清單、每個驗收項各失敗過幾次。整合時由規劃者匯總。

### 0.6 版本控制
- 你已經在自己的 worktree 裡，分支為 `m4-lane-d`。**只在這個分支 commit**，不得 checkout 其他分支、不得 merge、不得 rebase、不得 push、不得設遠端。
- 每階段驗收通過後 commit 一次，訊息用繁體中文，以「M4 D：」開頭，結尾加 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。
- 不得加入 `.idea/`、`tools/push.json`、`frames/local/`、`backend/node_modules/`、`package-lock.json`。

### 0.7 語言與程式風格
所有註解、文件、commit 訊息、使用者看得到的文字使用**繁體中文（臺灣用語）**（品質而非質量、資料而非數據、程式而非程序）。
- **JavaScript（backend/）**：檔案開頭說明這支負責什麼；`// 常數定義`、`// 功能函數定義` 兩段；箭頭函式、`const`、不加分號；每個函式上方一行中文註解。先讀 `backend/core/todoist.js`、`backend/worker/handlers.js`、`backend/core/push.js`、`backend/worker/todoist-client.js` 與它的 stub，照它們的寫法。
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
4. **紀錄檔**：你只寫自己的 `lanes/M4-D.md`，內容依序為：`## 進度`、`## 決策`、`## 阻擋`（斷路器停下的項目、規格爭議）、`## 需要整合處理`、`## 高風險函式`（依條款 10：列出你新增或修改的函式中，處理金額、憑證、他人資料、刪除或覆蓋檔案、對外部服務寫入的，每項含檔案與行號、一句白話說明、可能出錯的方式）。
5. **接口照本檔 §3 實作**，不得自行改名、改參數順序、改回傳格式。
6. **金鑰樣式的字串**：任何被追蹤的檔案（含測試）都不得出現「小寫 s、小寫 k、連字號」這三個連續字元（V06 會當成金鑰）；範例編號一律用英數字。

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
| **新增** | `backend/core/ma.js`、`backend/worker/twse-client.js`、`backend/worker/twse-client.stub.js`、`backend/tests/ma-pipeline.test.js`、`backend/tests/ma-*.test.js` 與 `backend/tests/twse-*.test.js`（輔助測試；**`ma-web-*` 開頭的是 B 線的、`ma-wiring.test.js` 是規劃者的，不得碰**）、`lanes/M4-D.md` |
| **修改** | `backend/worker/handlers.js`、`backend/worker/index.js`、`backend/worker/store.js`、`backend/worker/store.stub.js`、`backend/worker/schema.sql` |
| **不得碰** | 其餘一切，包括 `backend/wrangler.toml`（M4 不需要改，08:30 的 cron 已存在）、`backend/core/push.js`（不改）、`backend/web/`、`app/`、`core/`、所有契約檔與 spec 目錄 |

### 1.1 既有驗收不得退化
M0～M3R 的規格測試、accompany_bot 原有測試、`costdown-*.test.js`，在你的 L2 範圍內全部仍須通過。**不得修改既有函式的簽名**，否則既有驗收會連鎖失效。全套回歸只在整合時跑一次（L3）。

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

下列是 D 線要實作的全部介面。`/api/ma/*` 的回應格式同時是 B 線明細網頁依賴的契約，**欄位名稱與形狀不得更動**；推播的 `ma` 欄位與 `text`／`script` 格式同時是 C 線與 B 線依賴的契約。

### 4.1 D：證交所用戶端（`worker/twse-client.js`）

```js
createTwseClient(fetchImpl = fetch, defaults) → {
  listAll(),                  // GET defaults.twseAllUrl → { asOf: 'YYYY-MM-DD', rows: [{ code, name, close }] }
  getMonth(code, yyyymm),     // GET defaults.twseDayUrl?date=<yyyymm>01&stockNo=<code>&response=json → [{ date, close }]（由舊到新）
  listClosedDates(year)       // GET defaults.twseHolidayUrl → string[]（西元日期，只含該年的休市日）
}
```
- 民國日期轉西元：`1151008` → `2026-10-08`；`115/09/01` → `2026-09-01`。收盤價 `2,440.00` → `2440`；收盤價是空字串、`--` 或不是數字的列略過。
- `getMonth`：回應 `stat` 不是 `OK` → 回 `[]`（查無資料）。
- `listClosedDates`：紀錄的 `Date` 屬於該年，且 `Name` 與 `Description` 都**不含** `defaults.holidayKeepWords` 的任何一個詞（「開始交易」「最後交易」）→ 休市日。
- 非 2xx 或連線例外 → 丟 `Error('TWSE_<狀態碼或 NETWORK>')`；回應不是預期的陣列或欄位缺漏 → `Error('TWSE_FORMAT')`。訊息不含回應內容。
- 呼叫之間的等待由呼叫端的 `deps.sleep(ms)` 負責（`ma-defaults.json` 的 `twseDelayMs`）；`deps.sleep` 預設用 `setTimeout`，測試傳入立即完成的版本。
- `twse-client.stub.js`：`createTwseStub({ all, months, closed, fail, failCodes })` 回傳同介面：
  - `all`：`{ asOf, rows }`；`months`：`{ '<代號>': { '<yyyymm>': [{ date, close }] } }`，沒有的回 `[]`；`closed`：`{ '<年>': ['YYYY-MM-DD', …] }`
  - `calls`：依序記錄每一次呼叫 `{ method: 'listAll' }`、`{ method: 'getMonth', code, yyyymm }`、`{ method: 'listClosedDates', year }`（規格測試逐字比對，不得多加欄位）
  - `fail: true`：三個方法都丟 `Error('TWSE_500')`；`failCodes: ['2330']`：只有那幾檔的 `getMonth` 丟 `Error('TWSE_500')`

### 4.2 D：核心純函式（`core/ma.js`）

```js
roundTo(value, digits = 2) → number                       // 四捨五入（0.5 進位）
averageLast(closes, n) → number | null                    // closes 為 number[]（由舊到新）；不足 n 筆回 null
classify(m5, m20, m60, contract) → 'U'|'D'|'W'|'V'|'S'|'B'|'T'
    // 先各自 roundTo 到 contract.classify.roundDigits 位；任兩個相等 → 'T'；
    // 否則把 5、20、60 由高到低排成 '5>20>60' 這種鍵，查 contract.classify.byOrder
computeStock(closes, contract) → { kind, ma: [m5, m20, m60] | null }
    // closes 少於 contract.minCloses → { kind: 'N', ma: null }；否則 ma 為四捨五入後的三個值，kind 由 classify 得出
descFor(kind, lines) → string                             // lines.desc[kind]
countKinds(items) → { u, d, m }                           // 只算有 kind 的項目：U→u、D→d，其餘六種中除 U、D 外都→m；pending、failed 項目不算
isTradingDay(dateKey, closedDates) → boolean              // 週六、週日或在 closedDates 內 → false
prevTradingDay(dateKey, closedDates) → 'YYYY-MM-DD'       // 往前找最近一個交易日（不含當天）；往前超過 15 天仍找不到 → 丟 Error
buildMaPayload(date, asOf, counts, status) → string       // JSON 字串，鍵順序固定：date、asOf、u、d、m、status
validateWatchInput(raw, rows, active, limit, contract) → { ok: true, code, name } | { ok: false, error }
    // raw 先 trim；不是 1～40 字的字串 → format；在 rows（[{code,name}]）裡找「代號或名稱完全相等」→ 找不到 notFound；
    // 代號已在 active（代號陣列）→ duplicate；active.length >= limit → limit
```

### 4.3 D：儲存層（`worker/store.js`、`store.stub.js`、`schema.sql`）

`schema.sql` 追加（冪等）：

```sql
CREATE TABLE IF NOT EXISTS ma_watch (code TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, added_on TEXT NOT NULL, sort INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ma_close (code TEXT NOT NULL, date TEXT NOT NULL, close REAL NOT NULL, PRIMARY KEY (code, date));
CREATE TABLE IF NOT EXISTS ma_result (date TEXT NOT NULL, code TEXT NOT NULL, kind TEXT NOT NULL, m5 REAL, m20 REAL, m60 REAL, PRIMARY KEY (date, code));
CREATE INDEX IF NOT EXISTS idx_ma_result_code ON ma_result (code);
```

store 新增方法（stub 同介面，記憶體實作）：

```js
listWatch()                           // → [{ code, name, active: boolean, addedOn, sort }]，依 sort 由小到大
addWatch({ code, name, addedOn })     // 新增，sort ＝目前最大 sort＋1；已存在則不動
setWatchActive(code, active)          // 標記是否追蹤；不存在 → 丟 Error('MA_NOT_FOUND')
upsertCloses(code, rows)              // rows: [{ date, close }]；INSERT OR REPLACE
listCloses(code, limit)               // → [{ date, close }] 由舊到新，只取最新 limit 筆
upsertResults(asOf, results)          // results: [{ code, kind, ma: [m5, m20, m60] | null }]；INSERT OR REPLACE
listResultDates(limit)                // → 收盤日字串，由新到舊，不重複，最多 limit 個
listResults(dates)                    // → [{ date, code, kind, m5, m20, m60 }]
```
既有的 `readSetting`／`writeSetting` 用於 `ma.sentOn`（最後一次推播成功的報告日）、`ma.last`（JSON 字串 `{"reportDate","asOf","status","failed":[代號…]}`，`status` 為 `ok` 或 `failed`）、`ma.refreshedAt`（毫秒）。鍵名見 `ma-contract.json` 的 `settingsKeys`。

### 4.4 D：Worker 規則（`handlers.js`）

**`runMaReport(deps, nowMs, { push })`**（匯出，回傳 `{ status, reportDate, asOf }`，`status` 為 `ok`、`failed`、`holiday`、`empty`、`unknown`、`skipped`）：

1. `today` 為台北日期。`deps.twse` 不存在 → `skipped`。取休市日曆 `listClosedDates(今年)`（今天在 1 月時再加 `listClosedDates(去年)`）；**例外 → `unknown`，不送推播、不寫任何東西**，只記 `console.error` 錯誤代碼。
2. `isTradingDay(today)` 為 false → `holiday`（不連證交所、不寫歷史、不送推播）。
3. 追蹤中（`active`）的標的是 0 檔 → `empty`（不送推播、不寫歷史）。
4. `push` 為 true 且 `ma.sentOn` 等於今天 → 直接回上次結果，**不重算、不重送**（同一天排程重複觸發）。
5. `asOf = prevTradingDay(today, 休市日曆)`。對每一檔追蹤中的標的**依序**處理（每次 TWSE 呼叫之間 `deps.sleep(twseDelayMs)`；單檔失敗不影響其他檔）：
   - 先 `listCloses(code, 70)`。少於 `minCloses` 筆 → 補抓 `asOf` 所在月份往前共 `backfillMonths` 個月的 `getMonth`，`upsertCloses`；否則若最新一筆日期早於 `asOf` → 只補抓 `asOf` 所在月份。
   - 補完再 `listCloses(code, 70)`；**最新一筆日期不是 `asOf`**（資料過期、停牌、查無）或補抓丟例外 → 這檔列為失敗。
   - 否則 `computeStock(closes)`。
6. 全部都失敗 → `ma.last` 寫 `{reportDate: today, asOf: null, status: 'failed', failed: []}`；`push` 為 true 且推播已設定 → 送**失敗推播**（文字取 `lines.failed`，沒有 `script`，`ma` 為 `buildMaPayload(today, '', {0,0,0}, 'failed')`）；回 `failed`。
7. 否則 `upsertResults(asOf, 成功的)`，`ma.last` 寫 `{reportDate: today, asOf, status: 'ok', failed: [失敗的代號]}`。`push` 為 true 且推播已設定 → 送**報告推播**（見下）；回 `ok`。
8. 推播成功才寫 `ma.sentOn = today`。推播失敗不寫、不丟例外。

**報告推播**：開場台詞由語言模型依人設產生（系統提示沿用 `buildSystemPrompt`＋`ma-script-prompt.md`，用量照 M2 記錄）。台詞剝標籤後**含任何數字（`0-9`、`０-９`）、超過 `openingMaxChars`（40）字、或是空字串** → 重試 1 次；仍不行或語言模型失敗 → `lines.opening[0]`。
- FCM data：`{ id, text, script, ma }`。`id` 為 `ma-YYYYMMDD`（報告日）。`script` 為帶標籤的開場。`text` 為「剝標籤後的開場」＋空白＋`lines.countsSentence`（`{u}`、`{d}`、`{m}` 填檔數）。`ma` 為 `buildMaPayload(今天, asOf, 檔數, 'ok')`。
- `push.js` 不改：D 在 `handlers.js` 把 `ma` 欄位加進 `buildFcmMessage` 的結果 `message.data`（做法同 M3R 的 `todoist` 欄位）。

**`runScheduled` 排程**：`wrangler.toml` 的 crons 不用改（`30 0 * * *` 已存在）。台北時間 `08:30` 時呼叫 `runMaReport(deps, nowMs, { push: true })`，**位置在 Todoist 判斷之前**，自己 try/catch（A41）。同一個 08:30，F3 先跑、P3 掃描後跑。F3 不計入 F2「每天最多出聲 2 次」。

**路由**（既有 `x-app-secret` 授權，失敗行為照既有路由；不認得的 `/api/ma/*` 路徑 404，方法不對 405）：

| 路由 | 行為 | 成功回應 |
|---|---|---|
| `GET /api/ma/report` | 回最新一份報告 | `{ kind:'report', status, reportDate, asOf, counts:{u,d,m}, items, disclaimer }` |
| `GET /api/ma/history` | 近 `historyDays`（7）個收盤日 | `{ kind:'history', days:[日期由舊到新], rows:[{ code, name, cells:[{ kind, prev, changed }] }] }` |
| `GET /api/ma/watchlist` | 追蹤清單 | `{ kind:'watchlist', items:[{ code, name, pending }], limit }` |
| `POST /api/ma/watchlist` | `{action:'add', code}`、`{action:'untrack', code}`、`{action:'restore', code}` | `{ ok:true, item? }` |
| `POST /api/ma/refresh` | 重算今天的報告（不推播），回與 report 相同的內容；`ma.refreshedAt` 距今不到 `refreshMinIntervalSec` 秒 → 429 `{ error:'tooSoon' }` | 同 report |

**報告內容**（`GET /api/ma/report`）：
- 追蹤中是 0 檔 → `status:'empty'`，`items:[]`。
- 沒有 `ma.last` → `status:'none'`。
- `ma.last.status` 為 `failed` → `status:'failed'`，`items:[]`，`counts` 全 0，`asOf:null`。
- 否則 `status:'ok'`；`items` 依追蹤順序，每項為：有結果 → `{ code, name, kind, desc: lines.desc[kind], ma }`；在 `ma.last.failed` 內 → `{ code, name, failed:true, tag: lines.tags.failedStock, desc: lines.failedStock }`；沒有結果也沒失敗 → `{ code, name, pending:true, tag: lines.tags.pending, desc: lines.pending }`。`counts` 用 `countKinds`。`disclaimer` 取 `lines.disclaimer`。

**歷史**：`days` 是 `listResultDates(7)` 反轉成由舊到新。每列的 `cells` 與 `days` 等長：有結果 → `kind`；沒有（新加入、失敗）→ `kind: null`。`prev` 為前一格的 `kind`（第一格與前一格為 null 時為 null）；`changed` 為 `kind` 與 `prev` 都不是 null 且不相等。沒有任何收盤日 → `days:[]`。

**追蹤清單寫入**：
- `add`：`code` 先過 `validateWatchInput` 的格式檢查（失敗 400 `{ error:'format', message }`）；呼叫 `twse.listAll()` 取 `rows`（例外 → 502 `{ error:'unavailable', message }`）；再 `validateWatchInput(raw, rows, 追蹤中的代號, limit)`。失敗 → 400 `{ error, message }`（`message` 取 `lines.errors[error]`，填 `{input}`、`{code}`、`{name}`、`{limit}`）。成功：已存在但停止追蹤中 → `setWatchActive(code, true)`（等同復原，歷史保留）；否則 `addWatch`，再補抓近 `backfillMonths` 個月的收盤價（每次呼叫之間 `deps.sleep`；單月失敗只記錯誤代碼，不讓整個新增失敗，下一次排程會補）。回 200 `{ ok:true, item:{ code, name, pending:true } }`。
- `untrack`：代號不在清單 → 400 `{ error:'notFound' }`；否則 `setWatchActive(code, false)`，回 200 `{ ok:true }`。
- `restore`：代號不在清單 → 400 `notFound`；追蹤中已達 `limit` → 400 `limit`；否則 `setWatchActive(code, true)`，回 200 `{ ok:true }`。
- 欄位不合（`action` 不在 `watchActions`、`code` 不是字串）→ 400 `{ error:'format' }`，**不呼叫證交所、不寫 D1**。

**deps 新增**（`index.js` 組裝）：`twse`（`createTwseClient(fetch, maDefaults)`，Stub 模式用 stub）、`maDefaults`、`maLines`、`maContract`、`maGlossary`（網頁直接讀靜態檔，Worker 不需要）、`maPrompt`、`sleep`。規格測試靠訊息內容分辨呼叫種類：開場台詞呼叫含 `maPrompt` 全文。

## 4. 規格範例表（使用者已確認，2026-10-10）【條款 7】

共通前提：「現在」是交易日 08:30（台北時間）；證交所資料、語言模型的回覆、休市日曆都是測試給定的固定內容；代號與編號用英數字。M4-S01～S15 為使用者 2026-10-10 確認；其中 S03～S06 的種類名稱與 S04 的描述文字依同日原型修訂（使用者要求「轉弱、轉強要說清楚」）。M4-S16、M4-S17 為衍生新增列，使用者已於 2026-10-10 確認。

本表只列**你這條線負責的列**；其他列由另外兩條線實作。

| 編號 | 情境 | 預期結果 | 線 |
|---|---|---|---|
| M4-S01 | 某檔最近 60 個交易日的收盤價依序是 1、2、3……60 | 5 日均線 58、20 日 50.5、60 日 30.5，種類 `U`（多頭排列），描述「5 > 20 > 60，三條線依序往上排。」 | D |
| M4-S02 | 收盤價依序是 60、59、58……1 | 5 日 3、20 日 10.5、60 日 30.5，種類 `D`（空頭排列），描述「60 > 20 > 5，三條線依序往下排。」 | D |
| M4-S03 | 前 40 天收盤 100、中間 15 天 130、最後 5 天 110 | 5 日 110、20 日 125、60 日約 108.33，種類 `W`（轉弱），描述「5 日線跌破 20 日線，短線轉弱。」 | D |
| M4-S04 | 排列為 20 > 60 > 5（5 日線在最下） | 種類 `V`（明顯轉弱），描述「5 日線跌破 20 日線與 60 日線，短線明顯轉弱。」 | D |
| M4-S05 | 任兩條均線的值剛好相等（例如 5 日＝20 日） | 不算多頭或空頭，種類 `T`（糾結），描述「均線糾結，方向未明。」 | D |
| M4-S06 | 某檔上市只有 40 個交易日，湊不滿 60 日 | 不排列，種類 `N`（資料不足），描述「上市未滿 60 個交易日，資料不足。」，不計入多頭與空頭檔數 | D |
| M4-S07 | 08:30 排程，今天是週六、週日或證交所休市日 | 不送推播、不連證交所取收盤價、不寫歷史 | D |
| M4-S08 | 交易日 08:30，證交所連不上或回錯誤，或最新一筆日期早於前一交易日；另一情境只有 1 檔查不到資料 | 全部失敗：送一則「資料沒拿到」推播（`ma.status` 為 `failed`，沒有 `script`），不寫歷史。只 1 檔失敗：其餘照報，那檔描述寫「這檔資料沒拿到。」。兩種情況下，同一時刻的 P3 掃描與戒飲詢問都照常 | D |
| M4-S09 | 同一天 08:30 排程被觸發兩次 | 只送一則推播、歷史只寫一筆 | D |
| M4-S10 | 追蹤清單是空的，08:30 排程 | 不送推播 | D |
| M4-S11 | 清單有 5 檔：加入 2412（中華電）；另三種情況：加入已在清單的 2330、加入查不到的 9999、清單已有 10 檔再加 1 檔 | 加入成功：清單變 6 檔，這檔標「明天納入」，並補近 4 個月的收盤價（證交所收到 4 次當月資料請求）。其餘三種各回 400：「已經在清單」「查不到」「最多 10 檔」，清單都不變 | D |
| M4-S12 | 對 2603 按「停止追蹤」；6 秒內按「復原」；另一次沒復原 | 停止後 2603 不再出現在報告與下次排程，歷史保留。復原後回到原位置，歷史還在。沒復原則維持停止 | D |
| M4-S13 | 查歷史：5 檔、近 7 個交易日；其中 2454 在第 6 天由多頭轉其他；剛加入的 2412 | 回傳每檔每天的種類；2454 第 6 天標記「轉換」且帶前一天的種類；2412 每天都是沒有資料，不補算 | D |
| M4-S14 | 報告推播：語言模型回了含阿拉伯數字的開場台詞；另一次語言模型失敗 | 兩種都改用預設開場台詞。推播帶 `ma` 欄位（日期與多頭、空頭、其他檔數），`id` 為 `ma-YYYYMMDD`。每檔描述與「僅供參考，非投資建議。」一律規則產生，不經語言模型 | D |
| M4-S16 | 六種由高到低的排列（5>20>60、60>20>5、20>5>60、20>60>5、5>60>20、60>5>20）各給一組均線 | 依序得到 `U`、`D`、`W`、`V`、`S`、`B`；`S`（轉強）的描述「5 日線站上 20 日線與 60 日線，20 日線仍在最下，短線轉強。」，`B`（初步轉強）的描述「5 日線站上 20 日線，仍在 60 日線下方，築底回升。」 | D |

轉寫與實作規則：
- 規格測試已凍結在 `backend/tests/spec/m4/ma.test.js`（共 15 個測試，函式名稱含列編號），你的實作要讓它們全部通過。
- 規格測試一律**呼叫實作**，證交所、語言模型、FCM、D1 都用你寫的 stub；S07～S14 透過 `runScheduled`、`createHandler` 驗證；S01～S06、S16 呼叫 `computeStock`、`classify`、`descFor`。
- 預期結果照表為準，不得放寬。

## 4B. 入口與接線驗證【條款 11、12】

**W-A 產線入口驗證（你要寫，`backend/tests/ma-pipeline.test.js`）**：從真實入口 `runScheduled(deps, nowMs)`（台北 08:30）進入，在記憶體 stub 上跑一輪，檢查最終成品：
- FCM stub 收到一則訊息，`data.ma` 可解析且鍵順序為 date、asOf、u、d、m、status；`data.id` 為 `ma-YYYYMMDD`；`data.text` 含「多頭 N、空頭 N、其他 N。」；
- 接著用 `createHandler(deps)` 呼叫 `GET /api/ma/report`、`GET /api/ma/history`、`POST /api/ma/watchlist`（`add`、`untrack`、`restore`），回應內容與推播一致、格式符合 §3；
- 沒有 Todoist 權杖（`deps.todoist` 為 null）時，F3 仍然會跑；追蹤清單是空的時，不產生推播、不丟例外（F3 沒有獨立開關，清單空即等同關閉）。
只准替換外部服務（證交所、語言模型、FCM、D1、`sleep`）；`runMaReport`、`core/ma.js`、`handlers.js` 一律用真的，**不得 monkeypatch**（檔案中不得出現 `mock.method`、`monkeypatch`、`jest.mock`、`sinon.stub`，V36 會 grep）。

**W-C 靜默降級掃描（V35，你的程式必須通過）**：不得有 `catch` 內回傳假成品（`catch (…) { return {…}` 或 `return [`）、`Math.random`、寫死的範例收盤價或範例排列、`DELETE FROM ma_`。證交所用戶端失敗必須丟 `Error('TWSE_…')`，由 `runMaReport` 的失敗處理接手。範圍：`backend/core/ma.js`、`backend/worker/twse-client.js`、`backend/worker/handlers.js` 中與 `ma`／`Ma` 相關的段落。

## 5. 實作階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| T0a | 確認 CHEAP-PLAN 的產出檔案全部存在且非空（§0 前提列的五個設定檔）；缺檔就停止，寫入紀錄檔「阻擋」，**不要自行補寫** | 清單齊全 |
| D1 | `core/ma.js` 全部函式＋輔助測試 | `--lane D` 全綠，S01～S06、S16 通過 |
| D2 | `twse-client.js`＋`twse-client.stub.js`＋輔助測試；`store.js`、`store.stub.js`、`schema.sql` 追加 | `--lane D` 全綠 |
| D3 | `handlers.js`：`runMaReport`、四條路由；`index.js` 組 deps | `--lane D` 全綠，S08～S14 通過 |
| D4 | `runScheduled` 接入 08:30（**位置在 Todoist 判斷 `if (!deps.todoist …) return` 之前**，自己 try/catch）；`ma-pipeline.test.js` | `--lane D` 全綠，S07 通過，15 個規格測試全部通過 |

每階段的完成條件，都包含與該階段模組相關的規格測試通過。完成 D4 後輸出 §9 的回報。

## 6. 驗收清單

你的完成條件：`./verify.sh --lane D` 全綠（L1 全部＋L2 的 V26），且你負責的 15 個規格測試全部通過，既有驗收無退化。與你直接有關的驗收項是 V04、V05、V24、V26、V31、V32、V34、V35、V36（下表為全部驗收項，供對照）。

**特別注意 V34**：`handlers.js` 中呼叫 `runMaReport` 的行號必須小於 Todoist 判斷的行號，且呼叫在自己的 `try` 內。現有 `runScheduled` 在沒有 Todoist 時會提早 return，F3 排在後面就永遠不會執行。
**特別注意 V32**：`ma-lines.json`、`ma-glossary.json` 的句子只能從設定檔讀，程式裡不得另寫一份。

### 6.1 全部自動驗收項（供對照；你只需讓 `--lane D` 全綠） 自動驗收項【條款 5】

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
- 不得連到真正的證交所（測試一律用 stub 或假的 `fetchImpl`）。
- 不得對 `ma_*` 資料表執行 `DELETE`，不得改既有資料表。
- 不得修改 `push.js`、`wrangler.toml`、`backend/web/`、`app/`、`core/`（那些是別條線或規劃者的）。
- 不得讓 F3 的排程段放在 Todoist 判斷之後。
- 不得在 log、錯誤訊息、回應中寫出存取密鑰；證交所回應內容不得寫進 log（只記錯誤代碼）。

## 9. 完成後的回報格式

完成後輸出（不要輸出多餘內容）：

    ✅ M4 D 線完成。

    驗收結果：./verify.sh --lane D 全部通過（或：通過 n 項，m 項未通過，詳見 lanes/M4-D.md 的阻擋）
    規格測試：15/15 通過；規格爭議 <n> 項
    既有驗收無退化

    成本摘要：
    | 階段 | 修正輪數 | 觸發過的錯誤指紋 |
    |---|---|---|
    | D1 | <n> | <n> 種 |
    | D2 | <n> | <n> 種 |
    | D3 | <n> | <n> 種 |
    | D4 | <n> | <n> 種 |
    合計修正輪數：<n>

    Commit 數：<n>

    需要整合處理：<n> 項（見 lanes/M4-D.md）

## 10. 故意不做的事

- C、B 兩條線的任何內容（Kotlin、泡泡、明細網頁）。
- 修改 `push.js`、`wrangler.toml`、契約檔、規格測試。
- 追蹤清單的排序、分組；歷史超過 7 個交易日；新加入標的的歷史回補。
- 清單空時的提醒推播；盤中資料、K 線說明、買賣建議、任何預測。
- 不擴充範圍；有建議寫進 `lanes/M4-D.md` 的「決策」段落，不要實作。
