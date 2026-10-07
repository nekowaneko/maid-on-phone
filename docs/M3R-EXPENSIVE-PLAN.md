# AccompanyPet M3 第二輪 — 貴批次執行計畫（Todoist 雙軌提醒 F2 打通；B、C、D 三條線平行開工）

> 這份文件給三個協作代理人**同時**自主執行，各自負責一條線（B：懸浮窗網頁、C：Kotlin、D：Worker）。
> 前提：接口塊（`backend/config/todoist-contract.json`）與便宜批次產出已由規劃者 commit；規格測試已由規劃者凍結；每條線在自己的 git worktree 與分支上工作。
> 整合（合併三條線、L3、報告）由規劃者負責，**不屬於任何一條線**。
> 背景：docs/wish28-pet-spec.md §4 F2、§5 M3；docs/m3-end-to-end-architecture.svg（第一輪後的斷點分析）。
> **為什麼有第二輪**：第一輪（2026-10-06）的規格測試沒有呼叫任何實作（例如 `assert.equal(emotion, 'thinking')`），三條線因此「一次全綠」但功能沒有打通：沒有排程、沒有呼叫 Todoist、網頁沒掛按鈕、沒有 JS 橋接、B 與 C 的動作名稱不一致。第二輪的規格測試一律呼叫實作，接口一律寫進契約檔。
> **使用者 2026-10-07 的決定**：① 拆步驟的結果由 `/api/todoist/action` 的 HTTP 回應直接帶回；② 沒有日期的 P3 用預設日期按鈕回答（明天／下週一／下個月／不知道）；③ 排程時間（台北）P3 08:30、P2 09:00、追問 21:00，每天出聲上限 2 次（P2 一件＋P3 一件），21:00 追問不計入上限。
> **使用者 2026-10-07 確認規格範例表時的決定**：§4.5 全部照草稿；§7.1 Q1～Q7 全部照規劃者建議（Q6 未作答，依預設刪除舊測試）。
> **狀態：** §4.5 的 M3R-S01～S19 與 §7 已全部確認（2026-10-07），規格測試已凍結。

## 0. 執行協定（最高優先，違反即為失敗）

沿用 docs/M2-EXPENSIVE-PLAN.md §0.1～§0.9，以下只寫差異：

- 紀錄檔：`lanes/M3R-<線>.md`（B、C、D），五個段落同 M2。
- 分支：`m3r-lane-b`／`m3r-lane-c`／`m3r-lane-d`；commit 訊息以「M3R <線>：」開頭。
- `verify.sh --lane` 的 L2 範圍：
  - B：V27（加跑 `tests/spec/m3r/overlay-todoist.test.js`）
  - C：V11（`:core:test`）、V12（`:app:compileDebugKotlin`）
  - D：V26（backend 測試，不含角色頁測試；通過數下限見 verify.sh）
- 契約檔（任何一條線都不得修改）：`backend/config/todoist-contract.json`、`backend/config/todoist-defaults.json`、`app/src/main/assets/pet/todoist-labels.js`，加上 M2 計畫書 §0.9 列的全部契約檔。`todoist-lines.json`、兩份 todoist 提示詞由 D 線擁有（可改句子，不得刪鍵或佔位符）。
- **V06 陷阱**：任何被追蹤的檔案（含測試）都不得出現「小寫 s、小寫 k、連字號」這三個連續字元（例如把 task 和數字用連字號接起來），V06 會當成金鑰。任務編號一律用英數字（例如 `8001`、`taskA`）。

## 1. 本批次範圍與檔案所有權

| 線 | 可以新增或修改的檔案（其餘一律不得碰） |
|---|---|
| **D Worker** | `backend/core/todoist.js`、`backend/worker/todoist-client.js`（新增）、`backend/worker/todoist-client.stub.js`（新增）、`backend/worker/handlers.js`、`backend/worker/index.js`、`backend/wrangler.toml`（只能改 `[triggers]`）、`backend/config/todoist-lines.json`、`backend/config/todoist-split-prompt.md`、`backend/config/todoist-script-prompt.md`、`backend/tests/todoist-*.test.js`、`lanes/M3R-D.md` |
| **C Kotlin** | `core/src/main/kotlin/com/accompany/pet/core/todoist/`、`core/src/main/kotlin/com/accompany/pet/core/reminder/Reminder.kt`、`core/src/test/kotlin/com/accompany/pet/helper/`、`core/src/test/kotlin/com/accompany/pet/core/todoist/`、`app/src/main/java/com/accompany/pet/`（全部）、`lanes/M3R-C.md` |
| **B 懸浮窗網頁** | `app/src/main/assets/pet/index.html`、`app/src/main/assets/pet/todoist-view.js`、`backend/tests/overlay-todoist*.test.js`、`lanes/M3R-B.md` |
| 規劃者 | 契約檔、`verify.sh`、兩個 spec 目錄、`docs/`、共用文件與報告、`ACCEPTANCE-M3R.md`、`DEVICE-CHECKLIST-M3R.md`、`core/build.gradle.kts`、`backend/stryker.config.json` |

合併順序：D → C → B。

## 2. 架構約束（沿用 A1～A34，以下為修訂與新增）

| # | 約束 | 理由 | 檢查 |
|---|---|---|---|
| A5（修訂，待 §7.1 Q1） | `@JavascriptInterface` 恰好 **5** 個：M2 的 4 個＋`onTodoistAction(json: String)`；只解析 §4.3 的固定欄位 | Todoist 按鈕要交回原生；只多開一個、參數只當資料 | V08 |
| A35 | 只有 `backend/worker/todoist-client.js` 可以出現 `api.todoist.com` 並連線 Todoist；`TODOIST_TOKEN` 只在 `index.js` 讀環境變數後交給 `createTodoistClient`，不得寫進 log、回應、推播 | 連外與憑證集中一處 | V30 |
| A36 | `backend/core/todoist.js` 是純函式：不讀時間、不讀檔、不連線（沿用 A1、V24） | 掃描與日期計算要能用固定時間測 | V24 |
| A37 | 寫入 Todoist 只有四種：改到期日（`doToday`、`tomorrow`、`setDate`）與建立子任務（`confirmSplit`）。不刪除、不完成、不改優先級、不改名稱 | 寫入範圍最小化 | 規格測試（stub 記錄的呼叫） |
| A38 | 推播與泡泡裡的任務名稱一律當資料：Worker 截到 200 字；網頁用 `textContent`；App 用 `JSONObject` 組字串 | 任務名稱是外部輸入 | M3R-S19、V28 |

## 3. 目錄結構（新增部分）

```
backend/config/todoist-contract.json     接口塊（規劃者）
backend/config/todoist-defaults.json     契約檔（規劃者）
backend/config/todoist-lines.json        D：預設台詞
backend/config/todoist-split-prompt.md   D：拆步驟提示詞
backend/config/todoist-script-prompt.md  D：提醒台詞提示詞
backend/worker/todoist-client.js         D：唯一連 Todoist 的檔案
backend/worker/todoist-client.stub.js    D：測試用
backend/tests/spec/m3r/todoist.test.js           凍結（D 的列）
backend/tests/spec/m3r/overlay-todoist.test.js   凍結（B 的列）
core/src/test/kotlin/com/accompany/pet/spec/m3r/M3RSpecTest.kt  凍結（C 的列）
app/src/main/assets/pet/todoist-labels.js  契約檔（規劃者）
```

## 4. 模組介面規格（固定，規格測試與另外兩條線都依賴它）

時間一律以台北時間（`config/quota.json` 的 `utcOffsetMinutes`）切日期。日期格式 `YYYY-MM-DD`。

### 4.1 Todoist 用戶端（D，`worker/todoist-client.js`）

```js
createTodoistClient(token, fetchImpl = fetch, defaults) → {
  listTasks(),                 // GET {apiOrigin}/tasks?limit=200，跟著 next_cursor 翻頁（帶 cursor 參數），最多 maxPages 頁；回傳 results 合併後的陣列
  getTask(id),                 // GET {apiOrigin}/tasks/{id}；404 回 null（已完成或已刪除）
  updateDue(id, dateKey),      // POST {apiOrigin}/tasks/{id}，body {"due_date": dateKey}
  addSubtask(parentId, content) // POST {apiOrigin}/tasks，body {"content": content, "parent_id": parentId}
}
```
- 標頭：`Authorization: Bearer <token>`；POST 加 `Content-Type: application/json`。
- 非 2xx（`getTask` 的 404 除外）或連線例外 → 丟出 `Error('TODOIST_<狀態碼或 NETWORK>')`，訊息不含 token 與回應內容。
- `token` 不是非空字串 → `createTodoistClient` 回 `null`。
- `todoist-client.stub.js`：`createTodoistStub({ tasks, fail })` 回傳同介面，另有：
  - `calls`：**只記錄寫入**，依序為 `{ method: 'updateDue', id, dateKey }` 或 `{ method: 'addSubtask', parentId, content }`（規格測試逐字比對，不得多加欄位）
  - `remove(id)`：把這件從清單拿掉（模擬使用者在 Todoist 完成）
  - `updateDue` 會把 stub 內那件任務的 `due` 改成 `{ date: dateKey }`，之後的 `listTasks` 讀得到
  - `fail: true` 時四個方法都丟 `Error('TODOIST_500')`；`getTask` 找不到回 null
- 任務欄位只讀：`id`、`content`、`priority`（API 的 4＝P1，所以 **P2 是 3、P3 是 2**）、`updated_at`、`added_at`、`due`（`due.date` 取前 10 碼當日期）、`parent_id`。

### 4.2 Worker 規則（D，`core/todoist.js` 純函式＋`handlers.js`）

儲存一律用既有 `settings` 表（`readSetting`／`writeSetting`）：

| key | 值 | 寫入時機 |
|---|---|---|
| `todoist.p2SentOn` | 最後一次 P2 推播成功的日期 | P2 推播成功 |
| `todoist.p3SentOn` | 最後一次 P3 推播（到期或問日期）成功的日期 | P3 推播成功 |
| `todoist.p2Snooze.<id>` | 到這天（含）才可以再提 | `snooze` |
| `todoist.p3Reminded.<id>` | 已提醒過的到期日 | P3 到期提醒成功 |
| `todoist.p3Asked.<id>` | `'1'` | 問日期推播成功 |
| `todoist.doToday` | `{"taskId":..., "date":...}` | P3 的 `doToday` |

**排程 `runScheduled(deps, nowMs)`**：`wrangler.toml` 的 crons 改為 `["0 * * * *", "30 0 * * *"]`（UTC 00:30＝台北 08:30）。依台北時間的時:分分派，各段各自 try/catch、互不影響：
- `HH:00`（任何整點）→ 既有的 M2 每日詢問（**只在分鐘為 0 時**，M2-S11 不得退化）
- `08:30` → P3 掃描；`09:00` → P2 掃描；`21:00` → 追問
- `deps.todoist` 為 null 或推播未設定 → Todoist 三段都不做事

**P2 掃描**（`pickP2(tasks, todayKey, nowMs, state)`，純函式）：`p2SentOn` 存在且距今不到 `p2IntervalDays`（7）天 → null；候選＝`priority === 3`、`updated_at` 距 `nowMs` 滿 `p2StaleDays`（14）天、不是子任務（`parent_id` 為 null）、沒有 snooze 或 snooze 日期 ≤ 今天；選 `updated_at` 最早的一件（相同時選 `id` 字串較小的）。

**P3 掃描**（`pickP3(tasks, todayKey, state)`，純函式）：`p3SentOn` 等於今天 → null。先找「到期」：`priority === 2`、`due.date` ≤ 今天、`p3Reminded.<id>` 不等於該到期日；選到期日最早的（相同時 `id` 較小）→ `{ view: 'p3', task }`。沒有到期的，再找「問日期」：`priority === 2`、沒有 `due`、不是子任務、沒有 `p3Asked.<id>`；選 `added_at` 最早的 → `{ view: 'askDate', task }`。

**追問**：`todoist.doToday` 的 `date` 等於今天 → `getTask(taskId)` 不是 null → 送一則**不帶 `todoist` 欄位**的推播（台詞 `followup`）；送完（不論成功）刪除 `todoist.doToday`。日期不是今天 → 刪除，不送。

**推播內容**：台詞由語言模型依人設產生（系統提示沿用 `buildSystemPrompt`＋`todoist-script-prompt.md`，用量照 M2 記錄）；台詞剝標籤後**沒有完整包含任務名稱**、超過 120 字、或含阿拉伯數字 → 重試 1 次，仍不行或語言模型失敗 → `todoist-lines.json` 對應鍵（`p2`、`p3`、`askDate`、`followup`）第一句，`{title}` 填任務名稱。任務名稱先截到 `contentMaxChars`（200）字。
- FCM data：`{ id, text, script, todoist }`，`todoist` 是 JSON **字串** `{"view":"p2"|"p3"|"askDate","taskId":"...","content":"..."}`（追問沒有這個欄位）。
- 推播 `id`：`todoist-<view>-<taskId>-<YYYYMMDD>`（追問的 view 寫 `night`）。
- `push.js` 不改：D 在 `handlers.js` 把 `todoist` 欄位加進 `buildFcmMessage` 的結果 `message.data`。

**`POST /api/todoist/action`**（既有 `x-app-secret` 授權；其他方法 405；其他 `/api/todoist/*` 路徑 404）：

| `action` | 其他欄位 | Worker 做的事 | 成功回應 |
|---|---|---|---|
| `doToday` | `taskId`、`view`（`p2` 或 `p3`） | `updateDue(taskId, 今天)`；`view` 為 `p3` 時另寫 `todoist.doToday` | `done`（`doneDoToday`） |
| `snooze` | `taskId` | 寫 `todoist.p2Snooze.<id>` ＝ 今天＋7 天；**不寫 Todoist** | `done`（`doneSnooze`） |
| `tomorrow` | `taskId` | `updateDue(taskId, 明天)` | `done`（`doneTomorrow`） |
| `setDate` | `taskId`、`when` | `tomorrow`＝明天；`nextMonday`＝今天之後的第一個星期一（今天是週一也算下週一）；`nextMonth`＝下個月 1 號 → `updateDue` | `done`（`doneSetDate`） |
| `unknownDate` | `taskId` | 不寫 Todoist（`p3Asked` 已在推播時寫入） | `done`（`doneUnknownDate`） |
| `split` | `taskId`、`content` | 呼叫語言模型（`todoist-split-prompt.md`＋任務名稱），取第一個 `{...}`，`steps` 須為 2～3 個 trim 後非空、不超過 100 字的字串；不合 → 重試 1 次 → 仍不合 → `failed`。**不寫 Todoist** | `{ kind:'split', script, text, taskId, content, steps }`（台詞 `split`，`{steps}` 以「、」連接） |
| `confirmSplit` | `taskId`、`steps` | 依序 `addSubtask(taskId, step)` | `done`（`doneSplit`） |

- 回應一律 `{ kind, script, text, ... }`，`text` 為剝標籤後的純文字（同 M2）。
- 欄位不合（`action` 不在契約的 `sent`、`taskId` 不符 `taskIdPattern`、`view` 不合、`when` 不在 `setDateWhen`、`steps` 不是 2～3 個合格字串、`content` 不是 1～200 字）→ 400 `{ error }`，**不呼叫 Todoist、不呼叫語言模型、不寫 settings**。
- `deps.todoist` 為 null、Todoist 丟例外、語言模型失敗 → 200 `{ kind:'failed', script, text }`（`failed`），只記 `console.error` 錯誤代碼。
- `confirmSplit` 中途失敗 → 停止、回 `failed`（已建立的不回滾，§10）。

**deps 新增**（`index.js` 組裝）：`todoist`（`createTodoistClient(env.TODOIST_TOKEN, fetch, todoistDefaults)`，Stub 模式用 stub）、`todoistDefaults`、`todoistLines`、`todoistPrompts: { split, script }`。規格測試靠訊息內容分辨呼叫種類：拆步驟呼叫含 `todoistPrompts.split` 全文；提醒台詞呼叫含 `todoistPrompts.script` 全文。

### 4.3 JS 介面（B 提供 `window.pet.showTodoist`、C 提供 `PetBridge.onTodoistAction`）

**C 呼叫 B**：`window.pet.showTodoist(jsonText)`（`JSONObject.quote()` 後 `evaluateJavascript`），`jsonText` 為以下之一：
- 推播來的：`{"view":"p2"|"p3"|"askDate","taskId","content","script"}`（C 用 `JSONObject` 把推播的 `todoist` 欄位加上 `script` 組成）
- Worker 回應原文：`{"kind":"done"|"split"|"failed", ...}`

**B 呼叫 C**：`PetBridge.onTodoistAction(jsonText)`，`jsonText` 是 §4.2 表中的物件（`{action, taskId, ...}`），或 `{"action":"cancel"}`。
C：`cancel` → 只記一次互動、不連線；`sent` 內的動作 → `thinking(true)` → `POST /api/todoist/action`（原文照轉，長度上限 16 KB）→ `thinking(false)` → `showTodoist(回應原文)`；連不上、非 2xx → `showText`（沿用 M2 的固定提示）。不在契約 `sent` 或 `cancel` 的動作略過。

### 4.4 懸浮窗網頁（B）

`todoist-view.js` 掛 `PetTodoistView`（純函式，不碰 DOM、不改傳入物件）：

```js
viewFor(data, labels) → { script, buttons: [{ label, action }] }
  // view p2：[今天推進一小步 → {action:'doToday', taskId, view:'p2'}]、[延後一週 → {action:'snooze', taskId}]、[拆成小步驟 → {action:'split', taskId, content}]
  // view p3：[今天做 → {action:'doToday', taskId, view:'p3'}]、[明天再提醒 → {action:'tomorrow', taskId}]
  // view askDate：[明天 → {action:'setDate', taskId, when:'tomorrow'}]、[下週一 → …'nextMonday']、[下個月 → …'nextMonth']、[不知道 → {action:'unknownDate', taskId}]
  // kind split：[幫我加成子任務 → {action:'confirmSplit', taskId, steps}]、[取消 → {action:'cancel'}]
  // kind done、failed：沒有按鈕
  // 不認得、缺 taskId：{ script: data.script 或 '', buttons: [] }
```
按鈕文字一律取自 `todoist-labels.js`（`labels.buttons.*`），順序同 `todoist-contract.json` 的 `viewButtons`。

`index.html`：載入 `todoist-labels.js` → `todoist-view.js`（在 `drink-view.js` 之後）；`window.pet.showTodoist`：解析失敗忽略；`script` 交給 `say`；按鈕放在 `#todoistActions`（新增，位置同 `#drinkActions`），文字用 `textContent`；按下後清掉這組按鈕，`cancel` 也照樣回報原生；新一組 Todoist 按鈕或戒飲按鈕出現時，清掉另一組。

### 4.5 Kotlin（C）

```kotlin
// core/todoist/TodoistModels.kt（純函式；常數與 todoist-contract.json 一致，由規格測試讀契約檔比對）
val TODOIST_SENT_ACTIONS: List<String>          // 契約 actions.sent，順序相同
val TODOIST_VIEWS: List<String>                 // 契約 views
fun isValidTaskId(id: String?): Boolean         // 符合 taskIdPattern
fun pickTodoistPayload(raw: String?): String?   // null、超過 2048 字、trim 後不是 { 開頭 } 結尾 → null；否則回 trim 後原文
fun isSendableTodoistAction(action: String?): Boolean  // 在 TODOIST_SENT_ACTIONS 內

// Reminder.kt
data class Reminder(..., val todoist: String? = null)   // parseReminder 讀 data["todoist"]，用 pickTodoistPayload
```

App：
- `ReminderDispatcher`：`SHOW_PET` 且 `todoist` 不是 null → `startPetService(context, todoistJson = r.todoist, todoistScript = r.script)`；角色出現後先報告排隊，再用 `JSONObject(todoist)` 驗 `view` 在 `TODOIST_VIEWS`、`taskId` 通過 `isValidTaskId`，通過才 `put("script", script)` 交給 `showTodoist`，不通過改用 `showScript(script)`。
- `NOTIFY`（角色模式關）、`QUEUE`（玩遊戲中）：照 M1.6 只顯示／報告台詞，**沒有按鈕**（§10）。
- `PetBridge`：加 `@JavascriptInterface fun onTodoistAction(json: String)`，超過 16 KB 略過，轉主執行緒。
- `OverlayService`：處理 `onTodoistAction`（§4.3）、新增 `showTodoist(json)`（寫法同 `showDrink`，頁面未載入時暫存）。
- 刪除舊的 `todoist/TodoistActionHandler.kt` 與 `buildTodoistActionJson`（字串拼接，未跳脫）；連線一律經 `WorkerApi.post`。

## 4.5 規格範例表（使用者 2026-10-07 確認）

共通前提：「現在」是 2026-10-07（星期三）台北時間；Todoist 回傳的任務、語言模型的回覆都是測試給定的固定內容；任務編號用英數字。

| 編號 | 情境 | 預期結果 | 線 |
|---|---|---|---|
| M3R-S01 | 09:00 排程；任務有：A（P2，30 天沒動）、B（P2，20 天沒動）、C（P2，10 天沒動）、D（P1，60 天沒動）、E（A 的子任務，P2，60 天沒動） | 送出一則推播，只提 A；推播帶 `todoist` 欄位（view p2、A 的編號與名稱）；台詞含「A 的名稱」 | D |
| M3R-S02 | 10/3 送過 P2；10/7、10/9 的 09:00 排程；10/10 的 09:00 排程 | 10/7、10/9 都不送；10/10 送 | D |
| M3R-S03 | 10/7 對 A 按「延後一週」 | 回覆延後的台詞；Todoist **沒有任何寫入**；（假設這段期間沒有送過其他 P2）10/13 的 09:00 跳過 A、改提 B；10/14 的 09:00 又提 A | D |
| M3R-S04 | 對 A 按「今天推進一小步」 | Todoist 收到「A 的到期日改成 2026-10-07」一次；回覆 done | D |
| M3R-S05 | 對 A 按「拆成小步驟」，語言模型回「好的 {"steps":["列出需要的文件","上網預約","到現場辦理"]}」；另一次語言模型兩次都只回 1 個步驟 | 第一次：回 split，帶 3 個步驟，台詞含 3 個步驟，Todoist 沒有寫入；第二次：回 failed，Todoist 沒有寫入 | D |
| M3R-S06 | 對 A 按「幫我加成子任務」（3 個步驟）；另一次送 4 個步驟或含空字串 | 第一次：Todoist 依序建立 3 個子任務，都掛在 A 底下；第二次：回 400，Todoist 沒有寫入 | D |
| M3R-S07 | 08:30 排程；P3 任務 X 到期 10/7、Y 到期 10/9；10/8 08:30 再跑（X 還沒完成）；10/9 08:30 再跑 | 10/7 只提 X（view p3）；10/8 不提（X 這個到期日已提過）；10/9 提 Y | D |
| M3R-S08 | 10/7 對 X 按「明天再提醒」；10/8 08:30 排程 | Todoist 收到「X 的到期日改成 2026-10-08」；10/8 再提 X 一次 | D |
| M3R-S09 | P3 任務 Z 沒有日期，今天沒有到期的 P3；10/8 再跑一次；另一情境：今天同時有到期的 X | 10/7 送「問日期」（view askDate，關於 Z）；10/8 不再問 Z；有 X 時當天先提 X，Z 不問 | D |
| M3R-S10 | 10/7（週三）對 Z 分別按「明天」「下週一」「下個月」「不知道」；另外 10/12（週一）按「下週一」 | 到期日依序寫入 2026-10-08、2026-10-12、2026-11-01；「不知道」不寫 Todoist；10/12 按「下週一」寫入 2026-10-19 | D |
| M3R-S11 | 10/7 對 X 按「今天做」；21:00 排程時 X 還沒完成；另一情境 X 已完成；另一情境「今天做」是 10/6 按的 | 第一種：送一則追問推播（台詞含 X 的名稱，沒有按鈕）；第二、三種：不送 | D |
| M3R-S12 | 同一天 08:30 排程被觸發兩次、09:00 被觸發兩次；戒飲詢問設在 08:00 | 當天最多一則 P3、一則 P2（21:00 追問另計）；08:30 不會補送 08:00 的戒飲詢問 | D |
| M3R-S13 | 掃描時 Todoist 回 500；按鈕動作時 Todoist 回 500；沒有設定 Todoist 權杖 | 掃描：不送推播、不記錄已送、不中斷其他排程（同一整點的戒飲詢問照常）；動作：回 failed 台詞，不是 500 錯誤；沒權杖：排程不做事、動作回 failed | D |
| M3R-S14 | 用假的連線測 Todoist 用戶端：任務分兩頁；改到期日；建子任務；查一件已完成的任務 | 第一頁後帶 cursor 取第二頁、合併結果；網址都在 `https://api.todoist.com/api/v1/`；帶 Bearer 權杖；改到期日送 `{"due_date":...}`；建子任務送 `content` 與 `parent_id`；已完成（404）回「沒有這件」而不是錯誤 | D |
| M3R-S15 | 語言模型的提醒台詞兩次都沒提到任務名稱；任務名稱超過 200 字 | 改用預設台詞（含任務名稱）；名稱截到 200 字 | D |
| M3R-S16 | 手機收到帶 `todoist` 欄位的推播；`todoist` 超過 2048 字或不是 `{…}`；舊格式推播 | 第一則保留 `todoist`；第二則丟掉 `todoist`、只當一般提醒；舊格式照舊 | C |
| M3R-S17 | App 端的動作清單、畫面種類、任務編號格式 | 與 `todoist-contract.json` 完全一致；`task"1`、空字串、65 個字元的編號都不合格 | C |
| M3R-S18 | 泡泡收到 p2、p3、askDate 的推播資料，以及 split、done、failed 的回應 | 按鈕文字、順序、送出的動作與 §4.4 完全一致，按鈕順序與契約 `viewButtons` 相同；done、failed 沒有按鈕；缺編號時沒有按鈕 | B |
| M3R-S19 | 任務名稱是 `<img src=x onerror=alert(1)>` | 泡泡把它當純文字顯示，`index.html` 的 Todoist 段落不用 `innerHTML` | B |

## 5. 實作階段

| 階段 | 誰 | 內容 | 完成條件 |
|---|---|---|---|
| T0 | 規劃者 | 使用者確認 §4.5 與 §7.1；凍結規格測試（先用草稿實作確認能被滿足，再刪掉草稿）；舊的 M3 規格測試（`tests/spec/m3/`、`spec/m3/M3SpecTest.kt`）刪除；`verify.sh` 更新 `FROZEN_HASH`、V05、V08、新增 V30；起跑檢查；開三個 worktree | — |
| D1 | D | 第一輪的 `tests/todoist-core.test.js`、`tests/todoist-api.test.js` 測的是舊介面，改寫或刪除；`core/todoist.js`（`pickP2`、`pickP3`、`setDateFor`、`validateSplitSteps` 改 2～3 步、`validateTodoistAction`）＋輔助測試 | `--lane D` 全綠 |
| D2 | D | `todoist-client.js`＋stub＋輔助測試 | `--lane D` 全綠 |
| D3 | D | `handlers.js`：`/api/todoist/action`（取代第一輪寫在 `createHandler` 中間的 `handleTodoist`）、`runScheduled` 分派、`index.js` deps、`wrangler.toml` crons | `--lane D` 全綠 |
| C1 | C | core：`TodoistModels.kt` 改寫、`Reminder.todoist`；第一輪的 `core/src/test/.../core/todoist/TodoistModelsTest.kt` 測的是舊介面，移到 `helper/` 改寫或刪除 | `--lane C` 全綠 |
| C2 | C | app：`PetBridge.onTodoistAction`、`OverlayService.showTodoist` 與動作處理、`ReminderDispatcher`、`PetControl.startPetService` 參數；刪除 `TodoistActionHandler.kt` | `--lane C` 全綠 |
| B1 | B | `todoist-view.js` 改寫＋輔助測試（第一輪的 `tests/overlay-todoist.test.js` 測的是舊介面，改寫） | `--lane B` 全綠 |
| B2 | B | `index.html`：載入兩支 script、`#todoistActions`、`showTodoist`、按鈕互斥 | `--lane B` 全綠 |
| T4 | 規劃者 | 合併 D → C → B → `./verify.sh --full` → 報告 → 手機實測（Todoist 測試專案） | 全部通過 |

## 6. 驗收清單

### 6.1 自動驗收項（修訂與新增）

| # | 層 | 驗收項 |
|---|---|---|
| V04（修訂） | L1 | 規格測試目錄與 M3R 凍結版本相同 |
| V05（修訂） | L1 | 加 M3R 的 Kotlin 列（S16、S17）、JS 列（S01～S15、S18、S19）各一次；移除舊 M3 的編號 |
| V08（修訂） | L1 | `@JavascriptInterface` 恰好 5 次（`--lane B`、`--lane D` 的 worktree 4 或 5 次都算通過） |
| V30 | L1 | `api.todoist.com` 只出現在 `backend/worker/todoist-client.js`（與契約檔 `todoist-defaults.json`）；`wrangler.toml` 不得有 `TODOIST_TOKEN =`；`TODOIST_TOKEN` 在 `backend/worker` 只出現在 `index.js` |

### 6.2 耦合驗收項

| 項目 | 與之衝突 | 優先順序 |
|---|---|---|
| 08:30 多一個 cron | M2-S11：每日詢問只在整點 | **兩者並存**：戒飲詢問只在分鐘為 0 時執行 |
| 每天 2 次上限 | 21:00 追問 | **使用者決定**：追問不計入上限 |
| 「延後一週」 | A37 寫入範圍 | **只存在 Worker**，不寫 Todoist |
| 推播多一個 `todoist` 欄位 | M15-S07、M16-S01：推播格式逐字相同 | **兩者並存**：只有 Todoist 推播帶這個欄位 |

### 6.3 移出自動層的項目

語言模型拆得好不好、台詞語氣、Cloudflare 上 08:30 準時觸發、真正的 Todoist 寫入、泡泡按鈕的外觀 → `DEVICE-CHECKLIST-M3R.md`（用 Todoist 測試專案）。

## 7. 預設值表

### 7.1 使用者 2026-10-07 確認的事項

| # | 事項 | 決定 |
|---|---|---|
| Q1 | 第 5 個 JS 介面 | 新增 `onTodoistAction(json)`，A5／V08 改為恰好 5 個 |
| Q2 | 角色模式關、或玩遊戲排隊時的 Todoist 提醒 | 只顯示台詞，沒有按鈕（Android 通知最多 3 顆按鈕，P3 問日期有 4 顆；要按按鈕就打開角色） |
| Q3 | 提醒台詞 | 語言模型依人設產生，沒帶到任務名稱就改用預設台詞；按鈕之後的回覆用固定台詞（快、不耗用量） |
| Q4 | 「下個月」 | 下個月 1 號 |
| Q5 | 過了到期日還沒被提醒的 P3（例如那天排程失敗） | 之後的 08:30 照樣提（到期日 ≤ 今天都算），一天一件、到期日早的先 |
| Q6 | 第一輪的 M3 規格測試（沒有呼叫實作） | 刪除，改由 M3R 的規格測試取代 |
| Q7 | 「今天推進一小步」對 P2 | 到期日設今天（照 F2a）；P2 的 14 天計時因此重新開始 |

### 7.2 已定案

| 問題 | 預設值 |
|---|---|
| 任務名稱太長 | 截到 200 字 |
| P2 的「擱置」 | Todoist 的 `updated_at`；子任務不列入 |
| 同樣條件的任務 | 編號字串較小者先 |
| Todoist 一次取幾件 | 每頁 200 件、最多 10 頁 |
| 拆步驟的步數 | 2～3 步，每步 1～100 字 |
| 兩種實作都合理 | 選較保守、較容易測試的那個 |

## 8. 絕對禁止事項

沿用 M2 §8，另加：
- 不得連到真正的 Todoist（測試一律用 stub 或假的 `fetchImpl`）；不得讀取或輸出 `TODOIST_TOKEN` 的值。
- 不得刪除、完成、改名 Todoist 任務，不得改優先級（A37）。
- 不得新增第 6 個 `@JavascriptInterface`。

## 9. 完成後的回報格式

同 M2 §9，把「M2」換成「M3R」。

## 10. 故意不做的事

- 通知欄的 Todoist 按鈕（Q2）；排隊時保留按鈕
- 21:00 追問的按鈕
- `confirmSplit` 中途失敗的回滾
- 用說的回答日期（使用者 2026-10-07 選了預設按鈕）
- 在 App 裡設定掃描時間、天數（固定在 `todoist-defaults.json`）
- 處理重複任務（recurring）的特別邏輯
