# AccompanyPet M2 — 貴批次執行計畫（戒飲記錄 F1；B、C、D 三條線平行開工）

> 這份文件給三個協作代理人**同時**自主執行，各自負責一條線（B：懸浮窗網頁、C：Kotlin、D：Worker）。
> 前提：docs/M2-CHEAP-PLAN.md 已執行完成；規格測試已由規劃者凍結；每條線在自己的 git worktree 與分支上工作。
> 本批次含修正迴圈，成本控制條款見 §0 與 §6。整合（合併三條線、L3、報告）由規劃者負責，**不屬於任何一條線**。
> 背景：docs/M2-HANDOFF.md（使用者 2026-10-05 的決定 ①～④）、docs/wish28-pet-spec.md §4 F1、§5 M2。
> **使用者 2026-10-05 的決定**：① 寫入 pet-maid 自己的 D1，欄位照戒飲存備份格式，之後可匯出；② 熱量用戒飲存的組合式模型，語言模型只負責對應編號；③ App 內有戒飲設定畫面，角色的「沒喝」＝戒飲存的「忍住」；④ App 呼叫 Worker 沿用 `APP_SECRET`。
> **使用者 2026-10-05 確認規格範例表時的追加決定**：「沒喝」全部入帳，每月額度只是「最多喝幾杯」的自我提醒，不再當入帳上限（不照戒飲存的防灌水公式）；「沒喝」以時段為單位（一個時段一次）；可以撤銷 7 天內的紀錄；常喝品項預設只有珍奶 650；M2 要做星巴克查表。
> **狀態：** §4.5 的 M2-S01～S16 與 §7 已全部確認（2026-10-05）。

## 0. 執行協定（最高優先，違反即為失敗）

### 0.1 不提問
全程不得向使用者或規劃者提問。未明訂處依 §7 預設值表處理；§7 未涵蓋時選擇最保守的做法，並把決策與理由記錄在**自己那條線的紀錄檔**（§0.9）。
需要手機或人眼判斷的項目已在 DEVICE-CHECKLIST-M2.md，不得因此停下。

### 0.2 工作循環
    階段實作 → ./verify.sh --lane <你的線> → 全綠？
                                              ├─ 是 → commit（只在自己的分支）→ 下一階段
                                              └─ 否 → 自動修正 → 重跑

### 0.3 錯誤指紋斷路器【條款 1】
每次修正前，取失敗訊息的前三行做正規化（去除行號、路徑中的使用者名稱與 worktree 目錄名、時間戳記、十六進位位址）後雜湊，得到一枚「錯誤指紋」，記錄在自己的紀錄檔。
若同一枚指紋第二次出現，**立刻停止該項目**，在紀錄檔的「阻擋」段落寫下指紋、完整錯誤、已嘗試的修法、你判斷的根因，然後繼續處理其他項目。
輪數上限作為第二道防線，設為 3。
**不得為了讓指紋不同而改寫錯誤訊息或包裝例外。**

### 0.4 分層驗收【條款 2】
沿用 `verify.sh`（Git Bash 執行），規劃者已把 `--lane` 的 L2 換成 M2 範圍：
- **L1（秒級）**：grep 類的結構、架構、安全檢查（三條線都跑全部 L1）
- **L2（十秒～一分鐘）**：只跑該線負責的部分
  - B：V27（`node tools/sync-overlay-vendor.mjs --check`＋`tests/spec/m16/overlay.test.js`＋`tests/spec/m2/overlay-drink.test.js`＋`tests/overlay-*.test.js`）
  - C：V11（`:core:test`）、V12（`:app:compileDebugKotlin`）
  - D：V26（backend 測試，不含角色頁的三組測試；通過數下限由規劃者在凍結後填入）
- **L3**：只在整合時由規劃者跑一次 `./verify.sh --full`。**各線不得執行 `--full`、`assembleDebug`、`pitest`、Stryker。**

**各線只跑 `./verify.sh --lane <你的線>`。** 不得吞掉任何一層的失敗回傳碼。

### 0.5 成本記錄【條款 6】
每階段結束時在自己的紀錄檔記錄：修正輪數、錯誤指紋清單、每個驗收項失敗次數。整合時由規劃者匯總成表，放在 `ACCEPTANCE-M2.md` 開頭。

### 0.6 版本控制
- 你已經在自己的 worktree 裡，分支為 `m2-lane-b`／`m2-lane-c`／`m2-lane-d`。**只在這個分支 commit**，不得 checkout 其他分支、不得 merge、不得 rebase、不得 push、不得設遠端。
- 每階段驗收通過後 commit 一次，訊息用繁體中文，以「M2 <線>：」開頭，結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不得加入 `.idea/`、`tools/push.json`、`frames/local/`、`backend/node_modules/`、`package-lock.json`。

### 0.7 語言與程式風格
所有註解、文件、commit 訊息、使用者看得到的文字使用**繁體中文（臺灣用語）**。
- **Kotlin**：每個函式上方一行中文註解；關鍵行尾加簡短中文註解；小而單純的頂層函式；常數集中在檔案上方並加「// 常數定義」標題。先讀 `Reminder.kt`、`Stores.kt`、`OverlayService.kt`、`SpeechBridge.kt`，照它們的寫法。
- **JavaScript（backend/）**：檔案開頭說明這支負責什麼；`// 常數定義`、`// 功能函數定義` 兩段；箭頭函式、`const`、不加分號；每個函式上方一行中文註解。先讀 `backend/worker/handlers.js`、`backend/core/push.js`。
- **JavaScript（角色頁 `app/src/main/assets/pet/`）**：一般 script，照 `performance.js`、`index.html` 既有寫法（`var`、`function`、每個函式上方一行中文註解、常數集中在上方），以 `(function (root) { ... })(this)` 掛全域。不得用 ES module。
- **程式碼檔一律用 Write／Edit 工具寫，不用 shell heredoc**（M1.6 的 `\1`、`\n` 都在這裡出過事）。

### 0.8 規格測試凍結【條款 7】
規劃者已於 T0 把 §4.5 的自動列轉成測試並 commit「凍結 M2 規格測試」，hash 記在 `verify.sh` 的 `FROZEN_HASH`。
`core/src/test/kotlin/com/accompany/pet/spec/` 與 `backend/tests/spec/` 不得有任何變動（V04 檢查）。M0～M1.6 的規格測試一字不改。
規格測試與實作衝突、且確信是規格有問題時，不得修改測試，在紀錄檔標記「規格爭議」，繼續其他項目。
輔助測試放在 spec 目錄以外（Kotlin：`core/src/test/kotlin/com/accompany/pet/helper/`；JS：`backend/tests/` 下依 §1 的檔名），可以自由增修。**複製來的 accompany_bot 原有測試與照抄的 `costdown-*.test.js` 不得修改**（例外見 M2-CHEAP-PLAN.md §3.1）。

### 0.9 平行開工規則（違反即為失敗）
1. **檔案所有權**：每條線只能新增或修改 §1 表中屬於自己的檔案。需要改別條線的檔案時，不得修改，在紀錄檔寫下「需要整合處理：<檔案>：<原因>」，繼續其他項目。
2. **契約檔不得修改**：`backend/config/drink-model.json`、`backend/config/starbucks.json`、`backend/config/drink-defaults.json`、`backend/core/calorie.js`、`backend/core/ledger.js`、`app/src/main/assets/pet/drink-labels.js`、`app/src/main/assets/pet/emotion-map.js`、`verify.sh`、`docs/`、兩個 spec 目錄、本計畫書。
3. **共用文件不得修改**：`PROGRESS.md`、`DECISIONS.md`、`BLOCKERS.md`、`CHECKLIST.md`、`SPEC-MAP.md`、`README.md`、各種報告（`*-REPORT.md`、`RISK-REVIEW.md`、`ACCEPTANCE-*.md`）、`DEVICE-CHECKLIST-*.md`。
4. **紀錄檔**：每條線只寫自己的 `lanes/M2-<線>.md`（B、C、D），內容依序為：`## 進度`（每階段的修正輪數、錯誤指紋、各驗收項失敗次數）、`## 決策`、`## 阻擋`（斷路器停下的項目、規格爭議）、`## 需要整合處理`、`## 高風險函式`（依條款 10 的格式，列自己這條線新增或修改的函式）。
5. **接口照 §4 實作**，不得自行改名、改參數順序、改回傳格式。另外兩條線是照同一份 §4 寫的。

## 1. 本批次範圍與檔案所有權

| 線 | 可以新增或修改的檔案（其餘一律不得碰） |
|---|---|
| **D Worker** | `backend/core/drink.js`（新增）、`backend/core/push.js`、`backend/worker/handlers.js`、`backend/worker/index.js`、`backend/worker/store.js`、`backend/worker/store.stub.js`、`backend/worker/schema.sql`、`backend/wrangler.toml`、`backend/config/drink-parse-prompt.md`（新增）、`backend/config/drink-script-prompt.md`（新增）、`backend/config/drink-lines.json`（便宜批次產出，D 線可以改句子但不得刪鍵或佔位符）、`backend/tests/drink-*.test.js`、`backend/tests/push-*.test.js`、`backend/stryker.config.json`、`tools/send_push.py`、`lanes/M2-D.md` |
| **C Kotlin** | `core/src/main/kotlin/com/accompany/pet/core/drink/`（新增）、`core/src/main/kotlin/com/accompany/pet/core/reminder/Reminder.kt`、`core/src/test/kotlin/com/accompany/pet/helper/`、`app/src/main/java/com/accompany/pet/`（全部）、`app/src/main/AndroidManifest.xml`、`app/src/main/res/`、`app/build.gradle.kts`、`lanes/M2-C.md` |
| **B 懸浮窗網頁** | `app/src/main/assets/pet/index.html`、`app/src/main/assets/pet/drink-view.js`（新增）、`backend/tests/overlay-*.test.js`、`lanes/M2-B.md` |
| 規劃者（整合） | 合併三條分支、`verify.sh`、`tools/prepare-worktree.sh`、`SPEC-MAP.md`、`PROGRESS.md`、`DECISIONS.md`、`BLOCKERS.md`、`CHECKLIST.md`、各報告、`ACCEPTANCE-M2.md`、`core/build.gradle.kts`（Pitest 範圍）、`docs/` |

合併順序：D → C → B。

### 1.1 既有驗收不得退化
M0～M1.6 的規格測試、accompany_bot 原有測試、`costdown-*.test.js`，在各線負責的 L2 範圍內全部仍須通過。全套回歸只在整合時跑一次（L3）。

## 2. 不可協商的架構約束

沿用 M1～M1.6 計畫書的 A1～A29。以下為**修訂**（待使用者確認，見 §7.1 Q1、Q2）與新增：

| # | 約束 | 理由 | 檢查 |
|---|---|---|---|
| A5（修訂） | `@JavascriptInterface` 恰好 **4** 個：原有 3 個無參數方法＋`onDrinkAction(json: String)`。`onDrinkAction` 只解析 §4.3 的固定欄位，`action` 不在清單內就略過 | 網頁要把按鈕結果交回原生；只多開一個、參數只當資料 | V08 |
| A12（修訂） | App 只有 `app/src/main/java/com/accompany/pet/WorkerApi.kt` 可以連外，且只連 `apiOrigin(BuildConfig.CHAT_URL)` 算出的網址；其他檔案仍不得出現 `HttpURLConnection`、`java.net.URL(` 等 | 戒飲記錄要由 App 呼叫 Worker；連外集中一處才審得完 | V18、V29 |
| A30 | 熱量只由 `backend/core/calorie.js` 的 `calcKcal`（組合式）或 `lookupTableKcal`（星巴克查表）算出。語言模型的輸出只取 §4.1.2 列出的欄位，**任何**數字欄位（如 `kcal`、`calories`）一律丟棄；`confirm` 一律以 Worker 自己重算的熱量寫入，不採用 App 送來的熱量 | F1：查不到時不讓 LLM 估；也不能讓 App 端竄改 | M2-S01、S04 |
| A31 | 語言模型的回覆只在通過 `checkScriptNumbers`（§4.1.4）後才回給 App；最多重試 1 次，仍不通過就用 `drink-lines.json` 的預設台詞，數字由規則填入 | F0.5：數字由規則算好後交給人設說，LLM 不得改動 | M2-S05 |
| A32 | `backend/core/drink.js` 是純函式：不讀時間、不讀檔、不連線、不 import `backend/core/` 以外的東西；可以 import `calorie.js`、`ledger.js`（同屬照抄的純函式） | 沿用 A1；統計、時段都要能用固定時間測 | V24、整合時 grep |
| A33 | `apiSecret` 只經 `BuildConfig.API_SECRET` 放進 `x-app-secret` 標頭；不得寫進 log、通知、網頁、例外訊息 | 密鑰外洩 | V29、RISK-REVIEW |
| A34 | `/api/drink/*` 全部走既有授權中介（`x-app-secret`）；排程觸發不經 HTTP，不需要密鑰 | 沿用 A8 | M2 輔助測試 |

### 2.1 預期高風險模組【條款 10】

| 模組 | 風險類別 | 負責線 |
|---|---|---|
| `handleDrinkConfirm`、`handleDrinkResist`、`handleDrinkUndo` | 對外部儲存寫入（D1） | D |
| `runScheduled`（每日詢問） | 定時對外寫入（推播） | D |
| `store.js` 的 `addDrinkLog`、`markDrinkUndone` | 寫入資料庫；SQL 無法離線測 | D |
| `handleDrinkSettings`（PUT） | 覆寫使用者設定 | D |
| `WorkerApi` | 讀憑證（`API_SECRET`）、對外連線 | C |
| `DrinkActionReceiver` | 通知按鈕觸發對外寫入 | C |
| `PetBridge.onDrinkAction` | 網頁傳入的資料觸發對外寫入 | C |
| `drink-view.js` 的 `viewFor` | 外部文字顯示在畫面上（須用 textContent） | B |

### 2.2 突變測試範圍【條款 9】
- Stryker：`backend/core/drink.js`、`backend/core/push.js`（D 線把 `stryker.config.json` 的 `mutate` 加上 `core/drink.js`，`commandRunner.command` 追加 `tests/spec/m2/*.test.js tests/drink-*.test.js`）
- Pitest：`core/src/main/kotlin/com/accompany/pet/core/drink/`（規劃者在 `core/build.gradle.kts` 加入範圍）
- `calorie.js`、`ledger.js` 是照抄的，不跑突變測試（測試也是照抄的，補不了）。

整合時由規劃者執行。

## 3. 目錄結構（新增部分）

```
backend/config/drink-model.json          契約檔（照抄戒飲存）
backend/config/starbucks.json            契約檔（照抄戒飲存，重複編號已改成唯一）
backend/config/drink-defaults.json       契約檔（預設值）
backend/config/drink-lines.json          預設台詞（便宜批次產出，D 可改句子）
backend/config/drink-parse-prompt.md     D：解析用提示詞
backend/config/drink-script-prompt.md    D：台詞用提示詞
backend/core/calorie.js、ledger.js       契約檔（照抄戒飲存）
backend/core/drink.js                    D：純函式
backend/tests/spec/m2/drink.test.js      凍結（D 線的列）
backend/tests/spec/m2/overlay-drink.test.js  凍結（B 線的列）
backend/tests/drink-*.test.js            D：輔助測試
app/src/main/assets/pet/drink-labels.js  契約檔
app/src/main/assets/pet/drink-view.js    B：純函式
core/src/main/kotlin/com/accompany/pet/core/drink/Drink.kt   C：純函式
core/src/test/kotlin/com/accompany/pet/spec/m2/M2SpecTest.kt 凍結
app/src/main/java/com/accompany/pet/WorkerApi.kt             C：唯一連外的檔案
app/src/main/java/com/accompany/pet/DrinkActionReceiver.kt   C：通知按鈕
app/src/main/java/com/accompany/pet/DrinkSettingsActivity.kt C：戒飲設定畫面
lanes/M2-B.md、M2-C.md、M2-D.md          各線紀錄檔
```

## 4. 模組介面規格（固定，規格測試與另外兩條線都依賴它）

時間一律以台北時間（UTC+8，沿用 `config/quota.json` 的 `utcOffsetMinutes`）切日期、週、月。週從星期一開始。

### 4.1 Worker（D）

#### 4.1.1 資料格式

```js
// 草稿：編號都對應 drink-model.json（starbucksId 對應 starbucks.json）；null 表示使用者沒說
draft = { name, starbucksId, baseId, sizeId, sugarLevelId, iceId, toppingIds: [], price }   // price：整數或 null

// 統計（所有數字都是整數）
stats = { weekCups, monthCups, monthResists, savedCups, monthSavedMoney, paybackPct, monthSavedKcal }

// API 回應的共同形狀：一律帶 kind、script（含表情標籤）、text（剝掉標籤、trim 後的純文字，通知欄用）
{ kind: 'confirm', script, text, draft, kcal, source: 'model'|'table', assumed: ['size'|'sugar'...] }
{ kind: 'choose',  script, text, draft, field: 'starbucks'|'base'|'size'|'sugar'|'topping', candidates: [{ id, name }] }
{ kind: 'saved',   script, text, logId, stats }
{ kind: 'already', script, text }                 // 今天已經記過、或這筆不能撤銷；沒有新增或修改任何資料
{ kind: 'undone',  script, text, stats }
{ kind: 'other',   script, text }                 // 跟飲料無關、看不懂、或用量到頂
```

#### 4.1.2 路由（全部在 `/api/` 底下，走既有 `x-app-secret` 授權）

| 方法與路徑 | 送出 | 回應 |
|---|---|---|
| `POST /api/drink/parse` | `{ text }`（trim 後 1～200 字，否則 400） | `confirm`／`choose`／`other` |
| `POST /api/drink/preview` | `{ draft }` | `confirm`／`choose`（**不呼叫解析用的語言模型**，只重算並產生台詞） |
| `POST /api/drink/confirm` | `{ draft }` | `saved`；草稿驗不過時回 `choose`，不寫入 |
| `POST /api/drink/resist` | `{}` | `saved`／`already` |
| `POST /api/drink/undo` | `{ logId }` | `undone`／`already` |
| `GET /api/drink/stats` | — | `stats` |
| `GET /api/drink/settings`、`PUT /api/drink/settings` | PUT：`{ subscriptionName, monthlyFee, resistValue, monthlyQuota, askTime }`（五個欄位都要給） | 目前的設定（同 PUT 的形狀）；驗不過回 400 `{ error }`，不寫入任何欄位 |
| `GET /api/drink/export` | — | 戒飲存備份格式（§4.1.6） |

**parse 的處理順序（固定）**：驗 text → 用量到頂？（是 → `other`，台詞用 `fallback-lines.json` 的 capped）→ 呼叫語言模型一次（提示詞 `drink-parse-prompt.md`，列出 `drink-model.json` 與 `starbucks.json` 全部編號與名稱，要求只回一個 JSON 物件；說的是星巴克品項時填 `starbucksId`、其餘欄位留 null）→ 從回覆取第一個 `{...}` 解析 → 只取 `isDrink, name, starbucksId, baseId, sizeId, sugarLevelId, iceId, toppingIds, price` 九個欄位（A30）→ `isDrink` 不是 `true`：`other`（台詞用語言模型以人設回一句，失敗用 `notDrink`）；解析失敗：`other`（`notUnderstood`）→ `resolveDraft` → 產生台詞（§4.1.4）。

**resolveDraft(draft, model, table) → { kind:'confirm', draft, kcal, source, assumed } 或 { kind:'choose', draft, field, candidates }**（`drink.js`，純函式）：
0. `starbucksId` 不是 null → 星巴克查表：`lookupTableKcal(starbucksId, table)` 有值 → `confirm`，`source:'table'`，`assumed` 為空，`baseId`、`sizeId`、`sugarLevelId`、`toppingIds` 一律清成 null／空陣列（不混算），`name` 用表上的品名；查不到（不在表上或值仍是 `<TODO:...>`）→ `choose`，`field:'starbucks'`，`candidates` 為表上全部有數值的品項，`starbucksId` 換成 null。以下 1～4 只在 `starbucksId` 為 null 時執行
1. `sizeId` 為 null → `'L'`，`assumed` 加 `'size'`；`sugarLevelId` 為 null → `'full'`，`assumed` 加 `'sugar'`；`iceId` 為 null 或不在清單 → `'normal'`（冰量不影響熱量，不列入 assumed）
2. 依序檢查 `baseId`、`sizeId`、`sugarLevelId`、`toppingIds` 的每一個：第一個不在 `drink-model.json` 清單內的欄位 → `choose`，`field` 為該欄位，`candidates` 為該清單全部項目（`{id, name}`，順序同 `drink-model.json`）；`draft` 中把那個不在清單的值換成 null（配料則移除那一個）
3. 全部合法 → `kcal = calcKcal({ baseId, sizeId, sugarLevelId, toppingIds }, model)`
4. `price` 不是 0 以上的整數 → 當成 null；`name` 不是非空字串 → 用基底名稱

`choose` 的回應**不含**任何熱量欄位，台詞不得含阿拉伯數字（`checkScriptNumbers(script, [])`）。

#### 4.1.3 寫入與統計

- `drink_logs` 表（`schema.sql`，冪等）：`id TEXT PRIMARY KEY, date TEXT NOT NULL, slot TEXT NOT NULL, type TEXT NOT NULL, name TEXT, price INTEGER, kcal INTEGER, source TEXT, ice TEXT, size_id TEXT, sugar_level_id TEXT, base_id TEXT, topping_ids TEXT, created_at INTEGER NOT NULL, undone INTEGER NOT NULL DEFAULT 0`，另建 `date` 索引。
- 設定值存在既有 `settings` 表：`drink.subscriptionName`、`drink.monthlyFee`、`drink.resistValue`、`drink.monthlyQuota`、`drink.askTime`、`drink.askedOn`（每日詢問最後送出的日期）。沒存過的用 `drink-defaults.json`。
- 儲存層（`store.js` 與 `store.stub.js` 介面相同）新增：`addDrinkLog(log)`、`listDrinkLogs()`（不含已撤銷）、`markDrinkUndone(id) → boolean`（找不到或已撤銷回 false）、`findDrinkLog(id)`。
- `slotOf(hour)`：台北時間的小時 `<11` morning、`<13` lunch、`<17` afternoon、`<20` dinner、其餘 latenight（照抄戒飲存 `index.html` 的 `SLOT_HOUR_BOUNDS`）。
- `drink_logs` 另加 `starbucks_id TEXT` 欄位。
- `confirm`：重新 `resolveDraft`（A30）→ 寫入 `{ type:'drink', source, kcal, price, ice: iceId, ... }`（`source` 為 `model` 或 `table`）。
- `resist`：現在這個時段（今天、`slotOf(現在的小時)`）已有未撤銷的 resist，**或**今天任何時段已有未撤銷的 drink → `already`，不寫入；否則寫入 `{ type:'resist' }`。同一天不同時段可以各按一次。
- `undo`：`logId` 存在、未撤銷、日期在 7 天內（今天往回 6 天，含今天）→ 標記 undone，回 `undone`；否則 `already`（台詞 `cannotUndo`）。
- `statsOf(logs, settings, todayKey)`（純函式），只算未撤銷的紀錄：
  - `monthCups`：本月 drink 筆數（含沒有價格的）；`weekCups`：本週一到今天的 drink 筆數
  - `monthResists`：本月 resist 筆數
  - `savedCups = monthResists`（使用者 2026-10-05 決定：「沒喝」全部入帳；**不用**戒飲存的防灌水公式，`monthlyQuota` 不參與任何計算）
  - `monthSavedMoney = round(savedCups × resistValue)`
  - `paybackPct = min(100, round(monthSavedMoney ÷ monthlyFee × 100))`（四捨五入）
  - `monthSavedKcal = round(savedCups × 平均熱量)`，平均熱量＝`drink-defaults.json` 的 `drinks` 各杯 `kcal` 的平均（預設只有珍奶，650；照抄戒飲存 `avgKcal`）
  - `monthlyQuota` 只存起來、匯出，M2 不拿它做任何提醒（§10）

#### 4.1.4 台詞

- `confirm`、`choose`、`saved`、`undone`、`other`（與飲料無關）、每日詢問的台詞，由語言模型依人設產生（提示詞 `drink-script-prompt.md`，系統提示沿用 `buildSystemPrompt` 帶 `persona.md`，再附上這次要說的事實與數字）。
- `checkScriptNumbers(script, required) → boolean`（`drink.js`，純函式）：先剝掉表情標籤；取出所有阿拉伯數字串（去掉千分位逗號後轉整數）；**通過條件**＝每個 `required` 數字都出現至少一次，且出現的每個數字都在 `required` 之中。
- 各情境的 `required`：`confirm` → `[kcal]`（有價格再加 `price`）；`choose`、`already`、`other`、詢問 → `[]`；`saved`、`undone` → `[weekCups, monthSavedMoney, paybackPct, monthSavedKcal]`。
- 不通過 → 再呼叫一次；仍不通過、或語言模型失敗、或用量到頂 → 從 `drink-lines.json` 對應的鍵取第一句，佔位符以規則算出的值填入（`{size}`、`{sugar}`、`{ice}` 填名稱；`assumed` 有值時句尾接 `labels`）。
- 每一次語言模型呼叫都照 `handleChat` 記入用量（`recordUsage`）。

#### 4.1.5 每日詢問（排程）

- `wrangler.toml` 加 `[triggers] crons = ["0 * * * *"]`；`index.js` 加 `scheduled: (event, env, ctx) => ctx.waitUntil(runScheduled(buildDeps(env), event.scheduledTime))`，邏輯全部在 `handlers.js` 匯出的 `runScheduled(deps, nowMs)`（A9）。
- `runScheduled`：台北時間的小時 ≠ `askTime` 的小時 → 不做事；`drink.askedOn` 等於今天 → 不做事；`askTime` 所在的時段（`slotOf(askTime 的小時)`，15:00 → 下午）今天已有未撤銷的紀錄（喝了或沒喝）→ 不做事；推播未設定 → 不做事；否則產生詢問台詞（失敗用 `ask`）→ 送一則推播（§4.2，`actions` 為 `resist,speak`）→ 推播成功才寫 `drink.askedOn`。
- `askTime` 只能是整點（`HH:00`，00～23 點）。

#### 4.1.6 匯出

`GET /api/drink/export` 回：
```js
{ subscription: { name, monthlyFee }, monthlyQuota, resistValue, drinks /* drink-defaults.json */, lastSeenMonth: '', logs }
```
`logs` 依 `created_at` 排序、不含已撤銷：喝了 `{ date, slot, type:'drink', drinkId:null, name, price, kcal, source, ice }`（`source` 為 `model` 或 `table`；`price` 沒說時為 `null`）；沒喝 `{ date, slot, type:'resist' }`。

#### 4.1.7 設定驗證

`subscriptionName`：trim 後 1～30 字；`monthlyFee`：1～100000 的整數；`resistValue`：0～10000 的整數；`monthlyQuota`：0～300 的整數；`askTime`：`/^([01]\d|2[0-3]):00$/`。任一欄位不合 → 400 `{ error: '設定值不正確：<中文欄位名>' }`，五個欄位都不寫入。

#### 4.1.8 deps 新增（`index.js` 組裝，測試直接注入）

`drinkModel`（drink-model.json）、`starbucksTable`（starbucks.json）、`drinkDefaults`（drink-defaults.json）、`drinkLines`（drink-lines.json）、`drinkPrompts: { parse, script }`（兩份 .md 的文字）。語言模型沿用 `deps.streamer`：把串流的 `text` 事件串起來當作一次完整回覆。

### 4.2 推播（D 送出、C 解析）

FCM `data` 沿用 `{ id, text, script? }`，再加選用的 `actions`：**以逗號分隔的動作編號字串**（FCM data 只能放字串），例如 `"resist,speak"`。按鈕文字由 App 依編號決定（`drink-labels.js` 的 `buttons` 同一套字）。
- `push.js`：`buildFcmMessage(deviceToken, id, text, script, actions)`，第 5 個參數為非空字串時 data 才加 `actions`；沒給時與 M1.6 逐字相同。
- `tools/send_push.py` 加選用參數 `--actions`。

### 4.3 JS 介面（B 提供 `window.pet.*`、C 提供 `PetBridge.onDrinkAction`）

**C 呼叫 B**（字串一律 `JSONObject.quote()` 後 `evaluateJavascript`，A26）：
- `window.pet.thinking(on)`：`on` 為 `true` 時換思考的臉（`thinking`）並在泡泡顯示「…」；`false` 時換回平常的臉。
- `window.pet.showDrink(jsonText)`：`jsonText` 是 §4.1.1 回應的 JSON 字串原文，或 App 自己組的 `{"kind":"ask","script":"..."}`（每日詢問推播在角色模式開時）。B 以 `JSON.parse` 解析，失敗就忽略。

**B 呼叫 C**：`PetBridge.onDrinkAction(jsonText)`，`jsonText` 是以下其中之一：

| `action` | 其他欄位 | C 要做的事 |
|---|---|---|
| `confirm` | `draft` | `POST /api/drink/confirm { draft }` |
| `preview` | `draft` | `POST /api/drink/preview { draft }`（改甜度、選品項之後） |
| `resist` | — | `POST /api/drink/resist {}` |
| `undo` | `logId` | `POST /api/drink/undo { logId }` |
| `speak` | — | 開始語音辨識（同按「說話」） |
| `cancel` | — | 不連線，只記一次互動（重設閒置計時） |

C 呼叫 Worker 前先 `thinking(true)`，拿到回應後 `thinking(false)` 再 `showDrink(回應原文)`。連不上、逾時（15 秒）、非 2xx → `thinking(false)` 後用 `showText` 顯示固定的提示（§7）。`window.pet` 沒有對應方法時沿用 M1.5 決定 47：`callBridge` 略過，不出錯。

### 4.4 懸浮窗網頁（B）

`drink-view.js` 掛 `PetDrinkView`（全部是純函式，不碰 DOM、不讀時間、不改傳入的物件）：

```js
viewFor(resp, labels) → { script, buttons: [{ label, action }] }   // action 是要交給 onDrinkAction 的物件，或 { local: 'sugarMenu' }
  // confirm：[對，記下來 → {action:'confirm', draft}]、[改甜度 → {local:'sugarMenu'}]、[取消 → {action:'cancel'}]
  //          source 為 'table'（星巴克）時沒有「改甜度」
  // choose：candidates 每項一顆（label 為 name → {action:'preview', draft: applyChoice(draft, field, id)}），最後加 [取消]
  // saved：[撤銷 → {action:'undo', logId}]（只有 logId 存在時）
  // ask：[沒喝 → {action:'resist'}]、[有喝，用說的 → {action:'speak'}]
  // already、undone、other：沒有按鈕
  // 不認得的 kind：{ script: resp.script 或 '', buttons: [] }
sugarMenu(draft, labels) → [{ label, action }]   // 5 顆，順序同 labels.sugarLevels，action 為 {action:'preview', draft: {...draft, sugarLevelId}}
applyChoice(draft, field, id) → draft            // starbucks/base/size/sugar：設定對應欄位；topping：加進 toppingIds（不重複）
```

`index.html`：
- 載入順序：`emotion-map.js` → `vendor/stream-parser.js` → `performance.js` → `drink-labels.js` → `drink-view.js` → 內嵌程式。
- `window.pet.showDrink`：`script` 交給既有的 `say` 演出；按鈕放在泡泡的 `#text` 下方、`#actions` 上方，用 `textContent` 設文字；按下後清掉這組按鈕，`local:'sugarMenu'` 就換成 `sugarMenu` 的 5 顆，其餘呼叫 `PetBridge.onDrinkAction(JSON.stringify(action))`。
- 撤銷按鈕在出現 `labels.undoMs`（60 秒）後自動移除。
- `window.pet.thinking(on)`：見 §4.3。
- 泡泡的 `#actions` 列加一顆「沒喝」（`{action:'resist'}`），在「說話」與「聊聊」之後。
- 新一組按鈕出現時取代舊的一組；`showText`、跳到演完不清除按鈕。

### 4.5 Kotlin（C）

```kotlin
// core/drink/Drink.kt（純函式）
fun apiOrigin(chatUrl: String): String?            // https:// 開頭時回「https://網域[:埠]」（不含路徑與結尾斜線），否則 null
fun drinkEndpointFor(action: String): String?      // confirm→/api/drink/confirm、preview→/api/drink/preview、resist→/api/drink/resist、undo→/api/drink/undo，其餘 null
fun parseDrinkActions(raw: String?): List<String>  // 逗號分隔、trim、只留 resist 與 speak、去重、保留順序；null 或空字串回空清單

// Reminder.kt
data class Reminder(..., val actions: List<String> = emptyList())   // parseReminder 讀 data["actions"]，用 parseDrinkActions
```

App 端：
- `app/build.gradle.kts`：`buildConfigField("String", "API_SECRET", workerValue("apiSecret"))`。
- `WorkerApi.kt`：唯一連外的檔案（A12 修訂）。`post(path, bodyJson, callback)`、`get(path, callback)`；網址＝`apiOrigin(BuildConfig.CHAT_URL) + path`；標頭 `x-app-secret: BuildConfig.API_SECRET`、`content-type: application/json`；連線與讀取逾時各 15 秒；在背景執行緒執行，結果回主執行緒；`apiOrigin` 為 null 或 `API_SECRET` 為空 → 不連線，直接回「尚未設定」。回應內容與密鑰不得寫進 log（只記狀態碼）。
- `PetBridge`：加 `@JavascriptInterface fun onDrinkAction(json: String)`，轉回主執行緒交給服務。
- `OverlayService`：語音辨識**成功的結果**（不含「我在聽…」與錯誤提示）送 `POST /api/drink/parse { text }`；處理 `onDrinkAction`（§4.3 表）；新增 `showDrink(json)`、`thinking(on)`，寫法同 `showScript`（頁面未載入完成時暫存）。`SpeechBridge` 需要把「辨識結果」和「狀態提示」分成兩個回呼。
- 推播：`actions` 非空且角色模式開 → 角色出現並 `showDrink("{\"kind\":\"ask\",\"script\":...}")`（用 `JSONObject` 組）；角色模式關 → 一般通知加上按鈕（`沒喝`、`有喝，用說的`），按下送到 `DrinkActionReceiver`。排隊（玩遊戲中）時照 M1.6 排隊，按鈕不保留（§10）。
- `DrinkActionReceiver`（Manifest `exported="false"`）：`resist` → `goAsync()` 呼叫 `WorkerApi`，結果以通知顯示回應的 `text`（取代原通知）；`speak` → 開啟角色並開始語音辨識（沒有麥克風權限時照現有提示）。
- `DrinkSettingsActivity`（Manifest `exported="false"`，從主畫面的「戒飲設定」按鈕開啟）：五個欄位（訂閱名稱、月費、忍住一杯的入帳金額、每月額度、每天詢問時間〔整點下拉選單〕）；開啟時 `GET /api/drink/settings` 填入；「儲存」→ `PUT`，成功顯示「已儲存」，400 顯示回應的 `error`，連不上顯示固定提示。
- Manifest 仍不得宣告 INTERNET（V03；合併後的權限來自 Firebase 程式庫，與聊天畫面相同）。

## 4.5 規格範例表（使用者 2026-10-05 確認）【條款 7】

使用者逐列確認 M2-S01～S16（S16 是星巴克查表加入 M2 後補的列）：S10、S11 由使用者改寫；S07、S08、S11 依使用者後續決定（「沒喝」全部入帳、以時段為單位、常喝品項只有珍奶）由規劃者對齊，下表為最終版本。

共通前提（除非該列另外說明）：設定值為預設（訂閱 Claude Pro、月費 650、忍住一杯入帳 60、每月額度 20、每天 15:00 詢問）；「現在」是 2026-10-07（星期三）15:10 台北時間；本月沒有任何紀錄；語言模型的回覆是測試給定的固定內容。

| 編號 | 情境（輸入） | 預期結果 | 驗證方式 |
|---|---|---|---|
| M2-S01 | 說「剛喝大杯珍奶半糖去冰」，語言模型對應成：奶茶、大杯、半糖、去冰、配料珍珠，而且自己另外附了「熱量 999」 | 角色複述「珍珠奶茶、大杯、半糖、去冰，約 450 大卡」，附「對，記下來／改甜度／取消」；999 完全不採用；資料庫沒有新增任何紀錄 | 自動（JS）＋手機 |
| M2-S02 | M2-S01 之後按「改甜度」，再選「微糖」 | 出現 5 個糖度選項（全糖、少糖、半糖、微糖、無糖）；選微糖後重新複述「…微糖…約 400 大卡」，仍附三個按鈕；資料庫仍沒有新增紀錄 | 自動（JS：Worker 重算＋網頁按鈕）＋手機 |
| M2-S03 | M2-S01 之後按「對，記下來」 | 新增一筆：日期 2026-10-07、時段下午、喝了、珍珠奶茶、價格空白、450 大卡、冰量去冰；角色回報本週 1 杯、本月省下 0 元、回本 0%、少攝取 0 大卡，數字與資料庫算出來的一致 | 自動（JS）＋手機 |
| M2-S04 | 說「喝了一杯咖啡」，語言模型給的基底「咖啡」不在清單上 | 不出現任何熱量數字（台詞與畫面都沒有）；角色請使用者選最接近的基底，列出 7 種（純茶、奶茶、鮮奶茶、拿鐵、水果茶、冬瓜茶、多多）加「取消」；選「拿鐵」後才重新複述熱量 | 自動（JS：Worker＋網頁按鈕）＋手機 |
| M2-S05 | 複述時語言模型說「大約 500 大卡」（規則算出來是 450） | 重新產生一次台詞；第二次還是錯的數字，就改用預設台詞，台詞中的熱量是 450；使用者不會看到 500 | 自動（JS） |
| M2-S06 | 說「喝了一杯綠茶」，沒說大小和甜度 | 以大杯、全糖計算，複述「…大杯、全糖…約 250 大卡」並說明「沒說大小，先當大杯」「沒說甜度，先當全糖」，使用者可以按「改甜度」 | 自動（JS） |
| M2-S07 | 本月 10/1、10/3 各按過一次「沒喝」，今天再按「沒喝」 | 新增一筆「沒喝」（時段下午）；角色回報本週 0 杯、本月省下 180 元、回本 28%、少攝取 1950 大卡 | 自動（JS）＋手機 |
| M2-S08 | 今天下午已經按過「沒喝」，下午又按一次；或今天上午已經記過喝了一杯，下午再按「沒喝」；另外今天上午按過「沒喝」，下午再按 | 前兩種都回覆「今天已經記過了」，不新增任何紀錄，統計數字不變；第三種（不同時段）照常新增一筆 | 自動（JS） |
| M2-S09 | M2-S07 之後在 1 分鐘內按「撤銷」；再對同一筆按一次撤銷 | 第一次：那筆「沒喝」不再計入，回報本月省下 120 元；第二次：回覆「這筆不能撤銷了」，數字不變 | 自動（JS） |
| M2-S10 | 本月已喝 19 杯、按過 3 次「沒喝」（額度 20） | 省下杯數算 3 杯：本月省下 180 元、回本 28%（額度只是告知自己不應喝這麼多，是喝的額度，不是「沒喝」的入帳上限） | 自動（JS） |
| M2-S11 | 每天詢問設 15:00；排程在 10/7 的 15:00、16:00 各跑一次；10/8 早上已按過「沒喝」，15:00 排程再跑；10/9 14:30 已按過「沒喝」，15:00 排程再跑 | 10/7 只在 15:00 送出一則推播，內容是角色用演出的方式（帶表情標籤）微傲地問「今天有喝飲料嗎？」並附「沒喝／有喝，用說的」兩個按鈕；16:00 不再送；10/8 照樣送（早上不是 15:00 所在的下午時段）；10/9 不送（下午時段已記過） | 自動（JS：送出時機、帶標籤、帶按鈕）＋手機（語氣） |
| M2-S12 | 在戒飲設定把月費改成 0 並儲存；之後改成 300 並儲存 | 改成 0：顯示「設定值不正確：月費」，所有設定都維持原值；改成 300：成功，之後回報的回本 % 以 300 計算（省下 60 元時回本 20%） | 自動（JS）＋手機 |
| M2-S13 | 角色模式關時，手機收到附「沒喝、有喝，用說的」的詢問推播；另一則附了不認得的按鈕「跳舞」；另一則是 M1.6 的舊格式推播 | 第一則通知有兩個按鈕「沒喝」「有喝，用說的」；第二則（按鈕是「沒喝、跳舞」）只有「沒喝」一個按鈕，不認得的略過、不閃退；舊格式照 M1.6 顯示，沒有按鈕 | 自動（Kotlin：解析按鈕）＋手機 |
| M2-S14 | 記過 M2-S03 那杯、一筆「沒喝」、另一杯喝了又撤銷，然後匯出 | 匯出的檔案是戒飲存的備份格式：訂閱 Claude Pro／650、額度 20、入帳 60；紀錄只有 2 筆（撤銷的不在內）；喝了的那筆編號欄位是空的（null）、來源標示為組合式模型；「沒喝」那筆只有日期、時段、類型三個欄位 | 自動（JS） |
| M2-S15 | 分別在 10:59、11:00、16:59、17:00、20:00、凌晨 00:30 記一杯；另外 9/30 23:30（台北時間）記一杯 | 時段依序為上午、午餐、下午、晚餐、宵夜、上午；9/30 23:30 那杯算在 9 月、不算進 10 月的杯數（台北時間切日，不是 UTC） | 自動（JS） |

| M2-S16 | 說「喝了一杯大杯伯爵茶那堤」，語言模型對應到星巴克表上的「伯爵茶那堤（大杯）」；另一次對應到表上沒有的星巴克品項 | 第一次：複述「伯爵茶那堤（大杯），約 204 大卡」（官方公告值，不四捨五入），附「對，記下來／取消」、沒有「改甜度」；記下後來源標示為查表。第二次：不出現任何熱量數字，列出表上的 4 個品項請使用者選 | 自動（JS） |

計算依據（不另列）：珍奶大杯半糖＝糖 120＋奶茶 170＋珍珠 160＝450；改微糖＝72＋170＋160＝402→400；綠茶大杯全糖＝240＋5＝245→250（四捨五入到 10）；M2-S07：省下 3 杯 ×60＝180，180÷650＝27.7%→28%（四捨五入），3×650＝1950（常喝品項只有珍奶 650）；M2-S09：撤銷後剩 2 杯 ×60＝120；M2-S10：沒喝全部入帳，3×60＝180→28%。

凍結時的測試命名：Worker 部分 `test('M2-Sxx ...')` 放 `backend/tests/spec/m2/drink.test.js`；網頁部分（M2-S02、S04 的按鈕、M2-S11 的 ask 按鈕）命名 `test('M2-Sxx-B ...')` 放 `backend/tests/spec/m2/overlay-drink.test.js`（用 `node:vm` 載入，同 m16）；Kotlin（M2-S13）放 `core/src/test/kotlin/com/accompany/pet/spec/m2/M2SpecTest.kt`。

## 5. 實作階段

| 階段 | 誰 | 內容 | 完成條件 |
|---|---|---|---|
| T0 | 規劃者 | 便宜批次；凍結規格測試（凍結前用草稿實作確認能被滿足，再刪掉草稿）；`verify.sh` 換 M2 的 lane、V05、V08、V18、V29；起跑檢查；建立三個 worktree | — |
| B0／C0／D0 | 各線 | 確認 docs/M2-CHEAP-PLAN.md §2 的產出存在且非空；缺檔即在紀錄檔「阻擋」記下並停止，不自行補寫 | 清單齊全 |
| D1 | D | `drink.js` 純函式（`resolveDraft`、`slotOf`、`statsOf`、`checkScriptNumbers`、`toBackupLog`、`validateDrinkSettings`、`shouldAsk`）＋輔助測試 | `./verify.sh --lane D` 全綠 |
| D2 | D | `schema.sql`、兩個儲存層、`handlers.js` 的 `/api/drink/*`、兩份提示詞 | `./verify.sh --lane D` 全綠 |
| D3 | D | `push.js` 第 5 參數、`runScheduled`、`index.js` 的 `scheduled`、`wrangler.toml` 的 `[triggers]`、`send_push.py --actions`、`stryker.config.json` | `./verify.sh --lane D` 全綠 |
| C1 | C | core：`Drink.kt`、`Reminder.actions`；輔助測試 | `./verify.sh --lane C` 全綠 |
| C2 | C | app：`build.gradle.kts`、`WorkerApi`、`PetBridge.onDrinkAction`、`OverlayService`（parse、showDrink、thinking）、`SpeechBridge` 分兩個回呼 | `./verify.sh --lane C` 全綠 |
| C3 | C | app：通知按鈕、`DrinkActionReceiver`、`DrinkSettingsActivity`、主畫面按鈕、Manifest | `./verify.sh --lane C` 全綠 |
| B1 | B | `drink-view.js`＋`backend/tests/overlay-drink-helper.test.js` | `./verify.sh --lane B` 全綠 |
| B2 | B | `index.html`：載入兩支 script、`showDrink`、`thinking`、按鈕列、撤銷計時、泡泡的「沒喝」 | `./verify.sh --lane B` 全綠 |
| 結束 | 各線 | 紀錄檔補齊 §0.9 的五個段落；最後一次 commit | 工作樹乾淨 |
| T4 | 規劃者 | 依序合併 D、C、B → `./verify.sh --full` → MUTATION-REPORT、SECURITY-REPORT、RISK-REVIEW 加 M2 段落 → ACCEPTANCE-M2.md | 全部通過 |

## 6. 驗收清單

### 6.1 自動驗收項【條款 5】

沿用 V01～V28，新增 V29，共 29 項（超過 20 項上限的理由同 M1.5；本案只新增 1 項）。

| # | 層 | 驗收項 | 判定方式 |
|---|---|---|---|
| V04（修訂） | L1 | 規格測試目錄與 M2 凍結版本相同 | `git diff --quiet <FROZEN_HASH>` |
| V05（修訂） | L1 | Kotlin 規格加 M2-S13；JS 規格加 M2 的 Worker 列與 `-B` 列，各一次；沒有略過或獨跑標記 | grep 計數 |
| V08（修訂） | L1 | `@JavascriptInterface` 恰好 4 次 | grep 計數 |
| V18（修訂） | L1 | `HttpURLConnection`、`java.net.URL(` 只出現在 `WorkerApi.kt`；仍不得有 okhttp、retrofit、ktor | grep |
| V29 | L1 | A12、A33：`WorkerApi.kt` 的網址只來自 `apiOrigin(BuildConfig.CHAT_URL)`；`API_SECRET` 只出現在 `WorkerApi.kt` 與 `build.gradle.kts`；`Log.` 那一行不含 `secret`／`SECRET`／`body` | grep |
| V26（修訂） | L2 | backend 測試全過；`--lane D` 不含角色頁三組測試；通過數下限由規劃者凍結後填入 | 讀輸出 |
| V27（修訂） | L2 | 加跑 `tests/spec/m2/overlay-drink.test.js` | 回傳碼 |
| V15、V16（修訂） | L3 | 突變範圍加 `core/drink`、`backend/core/drink.js`；RISK-REVIEW 加 §2.1 的 M2 模組 | grep |

**禁止為了通過驗收而做的事**：修改 spec 目錄、修改 `verify.sh`、修改複製來的 accompany_bot 原有測試與照抄的 `costdown-*.test.js`、修改契約檔、加 `@Ignore`／`test.skip`／`.only`、放寬斷言、改弱 grep 條件、手改 vendor 檔、吞掉失敗回傳碼、包裝例外以改變錯誤指紋。確實無法通過的項目走 §0.3 斷路器流程。

### 6.2 耦合驗收項【條款 3】

| 項目 | 與之衝突 | 衝突時的優先順序 |
|---|---|---|
| A12 修訂：App 可以連 Worker | V18：App 不自行連外 | **兩者並存**：只放行 `WorkerApi.kt` 一個檔案、只連一個網址（V29） |
| A5 修訂：第 4 個 JS 介面 | V08：介面數量固定 | **兩者並存**：數量改成恰好 4，不得再多 |
| M2-S02：改甜度後要重新複述 | 決定 ②：LLM 不重新解析 | **兩者並存**：`preview` 只重算＋產生台詞，不呼叫解析用的語言模型 |
| M2-S05：台詞數字要和規則一致 | F0.5：台詞要經過人設 | **數字優先**：重試 1 次後改用預設台詞 |
| M2-S08：一個時段只能按一次「沒喝」 | M2-S09：可以撤銷 | **兩者並存**：撤銷後同一時段可以再按（已撤銷的不算「已經記過」） |
| M2-S10：「沒喝」全部入帳 | 照抄的 `ledger.js`、戒飲存的防灌水公式 | **使用者決定優先**：`statsOf` 不套防灌水公式；`ledger.js` 照抄不改，只用它的計數函式 |
| M2-S11：每天問一次 | 推播失敗 | **不補送**：推播失敗不寫 `askedOn`，但下一小時已不是詢問時間，當天就不問了 |
| A4.2：推播加 `actions` | M15-S07、M16-S01：推播格式逐字相同 | **兩者並存**：只有每日詢問帶 `actions`；其餘推播與 M1.6 逐字相同 |
| 檔案所有權（§0.9） | 為了讓測試通過想改別條線的檔案 | **所有權優先**：記入「需要整合處理」，不得修改 |

### 6.3 移出自動層的項目【條款 4】

| 項目 | 原因 | 改為 |
|---|---|---|
| 語言模型把各種口語對應到編號準不準 | 非決定性 | DEVICE-CHECKLIST-M2.md B 節（自動層只測「拿固定的解析結果去算」） |
| 台詞語氣（微傲、喝了不罪惡） | 需要人判斷 | DEVICE-CHECKLIST-M2.md B 節 |
| D1 實際的 SQL（`store.js`） | 需要 Cloudflare | 手機實測＋RISK-REVIEW |
| 排程在 Cloudflare 上準時觸發 | 依賴外部服務與時間 | DEVICE-CHECKLIST-M2.md A 節 |
| 通知按鈕、設定畫面、思考的臉、按鈕捲動 | 需要手機與人眼 | DEVICE-CHECKLIST-M2.md |
| 匯出檔在戒飲存能否匯入 | 需要瀏覽器 | DEVICE-CHECKLIST-M2.md B 節 |
| 突變分數 | 規格測試已凍結 | MUTATION-REPORT.md |

## 7. 預設值表

### 7.1 使用者 2026-10-05 確認的事項

| # | 事項 | 決定 |
|---|---|---|
| Q1 | App 連外 | 放行 `WorkerApi.kt` 一個檔案連 Worker，只能連 chatUrl 取出的網域；修訂 A12／V18 並新增 V29 |
| Q2 | 第 4 個 JS 介面 | 新增 `onDrinkAction(json)`，修訂 A5／V08 為恰好 4 個 |
| Q3 | 改甜度、選品項之後 | 新增 `POST /api/drink/preview`，重新複述後按「對，記下來」才寫入 |
| Q4 | 推播按鈕格式 | `actions` 用逗號分隔的編號字串，按鈕文字由 App 決定 |
| Q5 | 價格 | 有說才記，沒說存 null、複述時不追問；匯出時照樣是 null（戒飲存會當成「別人請客」：算熱量、不算花費） |
| Q6 | 時段 | 照抄戒飲存的小時界線（<11 上午、<13 午餐、<17 下午、<20 晚餐、其餘宵夜） |
| Q7 | 「沒喝」的限制 | 一個時段一次；今天已經記過喝了也不能按；撤銷後可以再按 |
| Q8 | 撤銷 | 可以撤銷 7 天內（含今天）的紀錄，喝了與沒喝都可以；泡泡上的撤銷按鈕保留 1 分鐘 |
| Q9 | 匯出 | M2 只做 API，App 沒有匯出按鈕；戒飲存匯入會整份取代原本的資料，實測清單提醒先備份 |
| Q10 | 「說話」的範圍 | M2 起按「說話」說的內容一律送 parse；跟飲料無關時角色用人設回一句 |
| Q11 | 回報內容 | 只有規格四項：本週杯數、本月省下金額、回本 %、少攝取熱量 |
| Q12 | 「少攝取熱量」 | 照抄戒飲存：省下杯數 × 常喝品項的平均熱量；常喝品項預設只有珍奶 650 |
| Q13 | 沒說大小、甜度、冰量 | 大小當大杯、甜度當全糖，並在複述時說出來；冰量當正常冰 |
| Q14 | 泡泡上的「沒喝」 | 泡泡的「說話」「聊聊」後面加一顆「沒喝」 |
| Q15 | 星巴克查表 | M2 要做；照抄時把重複的編號改成唯一（M2-CHEAP-PLAN.md §3.11），規格列 M2-S16 |
| Q16 | 每日詢問 | 只能設整點；詢問時間所在的時段已有任何紀錄（喝了或沒喝）就不問 |
| — | 省下杯數 | 「沒喝」全部入帳；每月額度只是自我提醒，不參與計算 |
| — | 回本 % 取整 | 四捨五入 |

### 7.2 已定案

| 問題 | 預設值 |
|---|---|
| parse 的文字長度上限 | 200 字（trim 後），超過回 400 |
| 語言模型回覆中 JSON 前後有其他文字 | 取第一個 `{` 到與它配對的 `}` 解析 |
| `toppingIds` 不是陣列 | 當成空陣列 |
| 同一個配料出現兩次 | 只算一次 |
| `logId` 的格式 | `d-<毫秒時間>-<randomText 8 碼>`（測試注入 `randomText`） |
| 用量到頂時 parse | 回 `other`，台詞用 `fallback-lines.json` 的 capped |
| 呼叫 Worker 失敗時 App 顯示的提示 | 連不上：「連不上伺服器，晚點再試一次」；尚未設定：「還沒設定 apiSecret，見 docs/WORKER-SETUP.md 第 8 節」；回 401：「密鑰不對，檢查 apiSecret」 |
| 泡泡按鈕太多 | 泡泡維持現有大小，內容可捲動（`overflow-y: auto` 沿用） |
| 撤銷按鈕的 60 秒 | 由網頁計時；Worker 不限秒數，只限 7 天內 |
| `DrinkSettingsActivity` 的介面 | 照 `MainActivity` 用程式碼組版面，不新增 layout XML |
| 設定畫面的每日詢問時間 | 00:00～23:00 的下拉選單 |
| 主畫面的入口 | `MainActivity` 加一顆「戒飲設定」按鈕 |
| 每日詢問的推播 `id` | `drink-question-<台北日期>`（同一天重送也會被 App 去重；編號不要用 ask 加連字號，會被 V06 的金鑰樣式誤判） |
| 兩種實作都合理 | 選較保守、較容易測試的那個 |
| 規格範例與 §4 介面衝突 | 不修改任何一方，紀錄檔標記「規格爭議」 |

## 8. 絕對禁止事項

- 不得向使用者或規劃者提問。
- 不得修改 §1 中不屬於自己這條線的檔案；不得修改契約檔、共用文件、`verify.sh`、spec 目錄。
- 不得 checkout 其他分支、merge、rebase、push、設遠端；不得刪除或移動 worktree。
- 不得部署、不得登入 Cloudflare、不得執行 `wrangler d1 execute`、不得執行任何會連到 Cloudflare 或 Google 的指令。
- 不得建立或讀取真正的 `.dev.vars`、`worker.properties`、`firebase.properties`、`google-services.json` 的內容，不得輸出任何金鑰或推播代碼。
- 不得在原始碼 Manifest 宣告 INTERNET；`WorkerApi.kt` 以外不得連外。
- 不得新增第 5 個 `@JavascriptInterface`；角色頁不得連外、不得用 module。
- 不得讓語言模型的數字進入熱量、統計或寫入的資料（A30）。
- 不得把 `frames/local/`、`backend/assets/**/*.png` 加入 git。
- 不得執行 `./verify.sh --full`、`assembleDebug`、`pitest`、Stryker（整合時才跑）。
- 不得擴充範圍；有建議寫進紀錄檔的「決策」段落，不要實作。

## 9. 完成後的回報格式（各線）

    ✅ M2 <線> 完成，請整合。

    分支：m2-lane-<x>，最後 commit：<hash>
    驗收：./verify.sh --lane <X> 全部通過（或：未通過項目與原因）
    規格測試：<這條線負責的列> <n>/<m> 通過；規格爭議 <n> 項
    成本：修正輪數 <n>；錯誤指紋 <n> 種
    需要整合處理：<無／清單>
    紀錄檔：lanes/M2-<X>.md

## 10. 故意不做的事

- 不做 App 的匯出按鈕、不做匯入（從戒飲存搬進 pet-maid）
- 不補星巴克新品項、不做「品項 → 熱量」表、不讓語言模型估熱量
- 不做「本月喝超過額度」的提醒（額度在 M2 只存起來、匯出）
- 不做補登過去的日期（戒飲存的 7 天補登）、不做一個時段多筆的特別處理
- 不做手動輸入熱量、不做常喝品項清單的編輯
- 排隊（玩遊戲中）的詢問推播不保留按鈕，報告時只演出台詞
- 不改聊天網頁、不改 M1.6 的演出節奏
- 不做月報回顧（戒飲存的換月回顧）、不做糖量統計
- 不改用量上限、排隊上限、過期時間、去重規則
