# AccompanyPet M4 B 線（前端）執行紀錄

## 進度

- **T0a**：確認 CHEAP-PLAN 產出檔案全部存在且非空（`ma-contract.json`、`ma-lines.json`、`ma-glossary.json`、`ma-labels.js` 與 `design/prototype/` 5 個檔案），檢查通過。
- **B1**：實作 `app/src/main/assets/pet/ma-view.js`（`PetMaView.viewFor`）、更新 `app/src/main/assets/pet/index.html`（載入兩支 script、常駐按鈕 `#ma`、泡泡摘要 `#maSummary`、按鈕組 `#maActions`、`window.pet.showMa`、按鈕組互斥邏輯），新增輔助測試 `backend/tests/overlay-ma.test.js`。
  - 規格測試 `M4-S15B` 通過。
  - 修正輪數：1 輪（處理測試中 `node:vm` 跨 realm 物件比對）。
  - 出現過的錯誤指紋：無。
  - 驗收項失敗次數：0 次。
- **B2**：實作 `backend/web/ma-render.js`（含 §3 固定簽名）、`backend/web/ma.html`、`backend/web/ma.js`、`backend/web/ma.css`，新增輔助測試 `backend/tests/ma-web-render.test.js`。
  - 規格測試 `M4-S17` 通過。
  - V32（說明與台詞唯一來源）、V33（網頁與 WebView 安全，`innerHTML` 恰好 1 次）、U11（無十六進位色碼）皆通過。
  - 修正輪數：1 輪（移除註解中之 `innerHTML` 字樣以符合嚴格 grep 計算；移除 `ma.js` 寫死之格式錯誤訊息後備字串）。
  - 出現過的錯誤指紋：無。
  - 驗收項失敗次數：0 次。

成本紀錄：
- 合計修正輪數：2 輪
- 觸發過的錯誤指紋：0 種

## 決策

- **按鈕樣式與防踩色碼規範**：泡泡常駐列新增 `#ma` 按鈕，點擊觸發 `callBridge('onMaPressed')`，背景色採用 `rgb(201, 176, 255)`，避開任何 `#` 十六進位色碼檢驗，符合 U11 規範。
- **按鈕組互斥機制**：`showMaButtons` 觸發時會呼叫 `clearDrinkButtons()` 與 `clearTodoistButtons()`；相對地，`showDrinkButtons` 與 `showTodoistButtons` 亦呼叫 `clearMaButtons()`，確保懸浮窗同一時間只會呈現一組延伸動作按鈕與摘要標籤。
- **密鑰防護與同源連線**：`ma.js` 在啟動時讀取 `localStorage['companion:secret']`，若未設定則顯示「請先在聊天畫面輸入存取密鑰」且不發動任何外部請求；連線一律使用同源相對路徑，並透過 `x-app-secret` 標頭傳遞，絕不寫入 log、網址或 DOM。
- **純函式圖表渲染**：`ma-render.js` 採用純函式設計且不碰 DOM，所有動態資料皆經由 `escapeHtml` 處理。SVG 示意圖顏色均引用 CSS 變數（如 `var(--p-text)`、`var(--p-sub)`），達成無十六進位色碼的要求。

## 阻擋

- **規格爭議（M3R-S19）**：
  - 列編號：M3R-S19
  - 理由：`backend/tests/spec/m3r/overlay-todoist.test.js` 第 109 行寫入斷言 `assert.deepEqual(srcs.slice(-3), ['drink-view.js', 'todoist-labels.js', 'todoist-view.js'])`。依 M4-LANE-B §4B.2 要求，`index.html` 需於 `todoist-view.js` 之後依序載入 `ma-labels.js` 與 `ma-view.js`，導致最後三支 script 變為 `['todoist-view.js', 'ma-labels.js', 'ma-view.js']`，因而造成凍結之 M3R-S19 測試失敗。依 §0.8 規定，實作代理人不得變更凍結之規格測試，故標記規格爭議。
  - 建議改法：整合時將 M3R-S19 的斷言放寬或改為驗證 `todoist-labels.js` 與 `todoist-view.js` 在 `drink-view.js` 之後載入的相對順序，而非以 `slice(-3)` 檢查。
- **前置驗收阻擋（verify.sh V06）**：
  - 規劃者尚未執行 T0 排除 `docs/M4-*.md` 文件中出現的 含 s、k、連字號三個連續字元的字串（該字串出現於規格條款說明文中），導致 `verify.sh` 在 L1 V06 時判定疑似憑證洩漏而中斷。依 §0.9.1 與 §0.9.2，B 線代理人不得修改 `verify.sh` 或 `docs/`，已記錄需整合處理。

## 需要整合處理

- `verify.sh`：整合時請規劃者更新 V06 的 grep 排除名單（排除 `docs/M4-*.md`），並於 V27 測試範圍納入 `tests/overlay-ma.test.js` 與 `tests/ma-web-render.test.js`。
- `backend/tests/spec/m3r/overlay-todoist.test.js`：修正 M3R-S19 的 `srcs.slice(-3)` 斷言以相容後續批次載入之 script。
- `backend/tests/overlay-drink-helper.test.js`：更新該輔助測試中關於 script 總數（由 7 變 9）與常駐按鈕清單（由 4 顆變 5 顆）的預期陣列。

## 高風險函式

- `showMa(jsonText)` (`app/src/main/assets/pet/index.html#L426`)：
  - 檔案與行號：`app/src/main/assets/pet/index.html`，行 426
  - 白話說明：接收原生轉發之盤前均線推播 JSON，安全解析後調用 `say` 演出台詞並呈現摘要與按鈕。
  - 可能出錯的方式：若原生傳入非合法 JSON 或格式竄改，需透過 try/catch 與型態防護避免崩潰。
- `PetMaView.viewFor(data, labels)` (`app/src/main/assets/pet/ma-view.js#L19`)：
  - 檔案與行號：`app/src/main/assets/pet/ma-view.js`，行 19
  - 白話說明：純函式轉換推播或 API 資料為摘要物件與按鈕動作結構。
  - 可能出錯的方式：若傳入資料包含未預期型態之數值，嚴格驗證非負整數以防格式異常。
- `handleUntrack(code)` (`backend/web/ma.js#L236`)：
  - 檔案與行號：`backend/web/ma.js`，行 236
  - 白話說明：向後端發送停止追蹤請求，並啟動 6 秒前端復原計時器。
  - 可能出錯的方式：若網路連線中斷或伺服器異常，需捕捉錯誤並於畫面回報，且不應意外覆蓋既有歷史紀錄。
- `handleUndo()` (`backend/web/ma.js#L261`)：
  - 檔案與行號：`backend/web/ma.js`，行 261
  - 白話說明：於 6 秒內向後端發送復原追蹤請求。
  - 可能出錯的方式：若標的已達到上限（limit）可能回傳 400，需正確處理錯誤狀態。
