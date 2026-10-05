# M2 B 線紀錄（懸浮窗網頁）

## 進度

| 階段 | 內容 | 修正輪數 | 錯誤指紋 | 各驗收項失敗次數 |
|---|---|---|---|---|
| B0 | 確認 docs/M2-CHEAP-PLAN.md §2 的產出：全部存在且非空 | 0 | — | — |
| B1＋B2 | `drink-view.js`、`backend/tests/overlay-drink-helper.test.js`、`index.html`（載入兩支 script、`showDrink`、`thinking`、戒飲按鈕列、撤銷計時、泡泡的「沒喝」） | 1 | `6e399546ec7f` | V27 × 1（其餘 L1 全部 0） |

- 指紋 `6e399546ec7f`：輔助測試「sugarMenu：每顆的草稿互相獨立」用 `deepEqual` 比對 vm 另一個 realm 建立的陣列，`Array` 原型不同而失敗。屬於測試本身寫法問題，改成先 `plain()` 再比對（同檔其他測試的做法），實作未動。只出現一次。
- 最後一次 `./verify.sh --lane B`：L1 20 項＋V27 全部通過；角色頁測試 40 項全過（含 M2-S02-B、S04-B、S11-B、S16-B 共 4 列）。
- B1 與 B2 合成一次 commit：輔助測試同時檢查 `index.html` 的載入順序與按鈕位置，分開 commit 時 B1 那一次會因 `index.html` 還沒改而不綠。

## 決策

- `showDrink` 每次都以新的一組按鈕取代舊的一組（包含 `already`、`undone`、`other` 這種沒有按鈕的回應也會清掉舊按鈕）。理由：舊的複述按鈕帶的是舊草稿，留著會讓使用者對已經過時的草稿按「記下來」；較保守。
- `showText`、跳到演完、`thinking` 都不清除戒飲按鈕（§4.4 最後一條）。
- `thinking(true)` 先跳到演完、泡泡文字換成「…」、換 `thinking` 臉；不改泡泡顯示與否（泡泡開關仍由原生的 `showBubble` 決定，避免網頁與原生的狀態不一致）。`thinking(false)` 只換回平常的臉，文字留給接著來的 `showDrink`／`showText` 覆蓋。
- 「改甜度」換成的 5 顆糖度選項不另加「取消」（§4.4 規定 5 顆）。
- 改甜度用的草稿是 `showDrink` 收到的 `resp.draft`（記在網頁變數 `drinkDraft`）。
- 撤銷計時：一組按鈕裡有 `undo` 時排 `labels.undoMs`（60 秒）計時器，到時整組移除；換成新的一組或按下任何按鈕時取消計時（以組序號判斷，不會收掉後來的一組）。
- 所有戒飲按鈕（含泡泡上的「沒喝」）都經 `sendDrinkAction`：`PetBridge.onDrinkAction` 不存在時略過（沿用 M1.5 決定 47），因為本 worktree 沒有 C 線的改動。
- 泡泡的 `#actions` 加 `flex-wrap: wrap`：三顆按鈕在 156px 寬的泡泡放不下一列，自動換行；泡泡大小不變，內容沿用 `overflow-y: auto` 捲動（§7.2）。「沒喝」按鈕用綠色以區分。
- `drink-view.js` 的 `copyDraft` 一律複製草稿與 `toppingIds` 陣列，`toppingIds` 不是陣列時當成空陣列（§7.2），按鈕裡的草稿彼此獨立、不共用傳入物件。
- `applyChoice` 收到不認得的 `field` 時只回傳草稿的複本，不改任何欄位。
- `viewFor` 收到非物件（null、字串）時回 `{ script: '', buttons: [] }`；`script` 不是字串時當成空字串（`say` 會忽略空字串）。
- 未在瀏覽器實際點按：預覽窗格不能對本機檔案執行程式，DOM 行為（按鈕排版、改甜度、撤銷 60 秒、思考的臉）交給 DEVICE-CHECKLIST-M2.md。

## 阻擋

無。規格爭議 0 項。

## 需要整合處理

無。

## 高風險函式

| # | 模組／函式 | 檔案 | 風險類別 | 看什麼 |
|---|---|---|---|---|
| B-1 | `PetDrinkView.viewFor`（含 `confirmButtons`、`chooseButtons`、`savedButtons`、`askButtons`） | `app/src/main/assets/pet/drink-view.js` | 外部文字（Worker 回應的台詞、品名、候選名稱）顯示在畫面上 | 純函式，不碰 DOM、不改傳入物件；按鈕文字只當字串，畫面上由 `showDrinkButtons` 以 `textContent` 設定；不認得的 kind 沒有按鈕；`action` 只會是 §4.3 的 confirm／preview／cancel／undo／resist／speak 或 `local:'sugarMenu'` |
| B-2 | `PetDrinkView.applyChoice`／`sugarMenu`／`copyDraft` | `app/src/main/assets/pet/drink-view.js` | 產生要送去寫入的草稿 | 只改對應的一個欄位；配料不重複；每次都是複本；草稿最終由 Worker 的 `resolveDraft` 重新驗證（A30），網頁不送熱量 |
| B-3 | `window.pet.showDrink` | `app/src/main/assets/pet/index.html` | 外部 JSON 字串進入網頁 | `JSON.parse` 失敗或不是物件就忽略；台詞只交給既有的 `say`（stream-parser 解析、`textContent` 顯示）；不用 `innerHTML`、不 `eval` |
| B-4 | `showDrinkButtons`／`onDrinkButton`／`sendDrinkAction` | `app/src/main/assets/pet/index.html` | 網頁按鈕觸發原生對外寫入（confirm、resist、undo） | 按下即清掉整組（防重複按）；送出的是 `JSON.stringify(action)`，只含 §4.3 欄位；沒有 `onDrinkAction` 時略過；撤銷按鈕 60 秒後移除且只收掉自己那一組 |
| B-5 | `window.pet.thinking` | `app/src/main/assets/pet/index.html` | 畫面狀態 | 臉只經 `setFace`（白名單 `frameFor`）；不清除戒飲按鈕；不改泡泡顯示狀態 |
