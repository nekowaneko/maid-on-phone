# M3R D 線（Worker）紀錄

## 進度

| 階段 | 結果 | 修正輪數 | 錯誤指紋 | 各驗收項失敗次數 |
|---|---|---|---|---|
| D1 | 實作 `core/todoist.js` 純函式（`pickP2`、`pickP3`、`setDateFor`、`validateSplitSteps`、`validateTodoistAction`）＋改寫 `tests/todoist-core.test.js`；測試全過 | 0 | 無 | 全部 0 |
| D2 | 實作 `worker/todoist-client.js` 與 `worker/todoist-client.stub.js`；支援分頁、404 回傳 null、`updateDue`、`addSubtask` | 0 | 無 | 全部 0 |
| D3 | 實作 `handlers.js` 中的 `/api/todoist/action` 路由與 `runScheduled` 分派（08:30 P3、09:00 P2、21:00 追問）；更新 `index.js` 注入 deps；更新 `wrangler.toml` triggers 排程；更新 `tests/todoist-api.test.js`；`tests/spec/m3r/todoist.test.js` 15 列規格測試全過 | 1 | `fp-syntax-import-duplicate`（handlers.js import 區塊重複貼上，已修正） | V26：1 |
| 結束 | 撰寫本紀錄檔，執行 `./verify.sh --lane D` 全綠 | 0 | 無 | 全部 0 |

規格測試：M3R-S01～M3R-S15（Worker 15 列）15/15 通過；規格爭議 0 項。

## 決策

- **Todoist 用戶端單一連線來源（A35、V30）**：`api.todoist.com` 唯一出現在 `worker/todoist-client.js`。其他模組與測試一律不得直接呼叫 Todoist API。
- **純函式約束（A36、V24）**：`core/todoist.js` 嚴格遵守純函式設計，不讀檔、不依賴系統時鐘、不連網。
- **寫入範圍最小化（A37）**：對 Todoist 的寫入只有修改到期日（`doToday`、`tomorrow`、`setDate`）與新增子任務（`confirmSplit`）。
- **任務標題長度控制（A38）**：標題統一截斷至最多 200 字，防止長字串注入或版面問題。
- **排程分派隔離**：`runScheduled` 將每日戒飲詢問與 Todoist 三段排程（08:30、09:00、21:00）分別獨立在 try/catch 內，互不影響彼此的執行與推播。

## 阻擋

無。斷路器未觸發；規格爭議 0 項。

## 需要整合處理

- 無必須由規劃者修改的檔案。
- 提醒整合者：`wrangler.toml` 的 crons 已加入 `30 0 * * *`。
- 提醒整合者：已更新 `index.js` 注入 `todoist`、`todoistDefaults`、`todoistLines`、`todoistPrompts`。

## 高風險函式

| 函式 | 檔案 | 風險類別 | 輸入來源 | 對外動作 | 防護 | 測試 |
|---|---|---|---|---|---|---|
| `handleTodoistAction` | `backend/worker/handlers.js` | 外部請求寫入 Todoist | App 送來的 JSON body | 呼叫 Todoist API 更新到期日或建子任務 | 授權在前；`validateTodoistAction` 嚴格校驗各動作參數；Todoist 失敗時一律回 200 failed；不洩漏 token | M3R-S03～S06、S08、S10、S13；`todoist-api.test.js` |
| `runScheduled` | `backend/worker/handlers.js` | 定時排程對外推播 | 排程觸發（時間戳） | 呼叫 FCM 送推播、寫入 store | 台北時間分派；出聲與間隔頻率檢查；各段排程獨立 try/catch；失敗不拋例外 | M3R-S01、S02、S07、S09、S11、S12、S13 |
| `createTodoistClient` | `backend/worker/todoist-client.js` | 外部網路連線 | API Token 與參數 | 連線至 `api.todoist.com` | 集中連線、自動分頁、404 回傳 null、非 2xx 拋出代碼錯誤不洩漏 Token | M3R-S14 |
