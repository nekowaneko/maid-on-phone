# M4 D 線（Worker）紀錄

## 進度

| 階段 | 結果 | 修正輪數 | 錯誤指紋 | 各驗收項失敗次數 |
|---|---|---|---|---|
| T0a | 確認 CHEAP-PLAN 五個契約設定檔齊全且非空 | 0 | 無 | 全部 0 |
| D1 | 實作 `core/ma.js` 純函式（`roundTo`、`averageLast`、`classify`、`computeStock`、`descFor`、`countKinds`、`isTradingDay`、`prevTradingDay`、`buildMaPayload`、`validateWatchInput`）＋新增 `tests/ma-core.test.js`；測試全過（S01～S06、S16 通過） | 0 | 無 | 全部 0 |
| D2 | 實作 `worker/twse-client.js`、`twse-client.stub.js`、追加 `schema.sql`、`store.js`、`store.stub.js`＋新增 `tests/twse-client.test.js` 與 `tests/ma-store.test.js`；測試全過 | 0 | 無 | 全部 0 |
| D3 | 實作 `handlers.js` 中的 `runMaReport` 與 `/api/ma/*` 路由；在 `index.js` 組裝 M4 依賴項＋新增 `tests/ma-api.test.js`；測試全過（S08～S14 通過） | 0 | 無 | 全部 0 |
| D4 | 實作產線入口驗證 `tests/ma-pipeline.test.js`（W-A、V36）；無 monkeypatch，驗證 `runScheduled` 入口推播與 API 格式一致性；測試全過 | 0 | 無 | 全部 0 |

## 決策

- **純函式約束（A39、V24）**：`backend/core/ma.js` 嚴格維持純函式設計，不讀檔、不碰環境變數、不連線、不存取系統時鐘。
- **均線排列判定（A46、S16）**：各均線先依契約 `classify.roundDigits` 四捨五入後比較；任兩者相等判定為糾結 `T`；否則以大小順序字串查表得出種類代號。
- **唯一台詞與字串來源（A45、V32）**：描述與錯誤訊息一律由呼叫端傳入之 `lines` 或 `contract` 取出，`ma.js` 不寫死任何台詞句子。
- **證交所連線單一入口（A40、V31）**：唯一允許連線至證交所的模組為 `backend/worker/twse-client.js`，網址由 `ma-defaults.json` 讀取，不寫死於程式內。
- **無刪除操作與保留歷史（A42、V35）**：`schema.sql` 與 `store.js` 不含任何 `DELETE FROM ma_`；停止追蹤僅標記 `active = 0`，保留收盤價與計算歷史。
- **排程位置優先序（A41、V34）**：`runMaReport` 放在 `runScheduled` 內 Todoist 判斷（`!deps.todoist`）之前，且包覆於獨立 try/catch 中，確保即使 Todoist 權杖未設定，均線排程仍正常運作。
- **開場台詞格式約束（A46、S14）**：開場台詞由語言模型生成，若含數字（全半形）、超過 40 字或為空字串，重試 1 次；仍失敗則降級為預設開場台詞。
- **API 端點嚴格授權與方法檢查**：所有 `/api/ma/*` 路徑皆由既有 `x-app-secret` 授權中介保護，不認得之路徑回 404，不支援之 HTTP 方法回 405。
- **無 monkeypatch 之真實入口驗證（W-A、V36）**：產線測試以 stub 注入 deps 方式透過真實進入點 `runScheduled` 驗證，不竄改全域環境或使用 monkeypatch，完全覆蓋定時推播產出與 API 格式一致性。

## 阻擋

- **前置批次接線缺口**：主倉庫目前尚未由規劃者執行 T0 階段凍結規格測試（`backend/tests/spec/m4/ma.test.js` 尚未建立），且 `verify.sh` 尚未更新 M4 驗收項（V31～V36）與豁免規則（舊版 V06 誤抓 `docs/M4-*.md` 內說明字串）。依使用者指示，D 線代理人維持職責邊界，不修改 `verify.sh` 與 `spec/` 目錄，專注於完成 D 線模組與輔助測試。

## 需要整合處理

- 規劃者整合時需建立 `backend/tests/spec/m4/ma.test.js` 並凍結。
- 規劃者整合時需更新 `verify.sh`（更新 `FROZEN_HASH`、V05、V08，V06 豁免 `docs/M4-*.md`，追加 V31～V36）。

## 高風險函式

| 函式 | 檔案 | 風險類別 | 輸入來源 | 對外動作 | 防護 | 測試 |
|---|---|---|---|---|---|---|
| `computeStock` | `backend/core/ma.js` | 核心商務運算 | 收盤價陣列與契約 | 無（純運算） | 筆數少於 `minCloses` 判定為資料不足 `N`；嚴格四捨五入避免浮點誤差 | M4-S01～S06、S16；`ma-core.test.js` |
| `validateWatchInput` | `backend/core/ma.js` | 外部輸入校驗 | 使用者輸入字串、股票清單、追蹤陣列 | 無（純校驗） | 長度限制 1~40 字；字串 trim；代號或全名嚴格比對；重複與上限檢查 | `ma-core.test.js` |
| `createTwseClient` | `backend/worker/twse-client.js` | 外部網路連線 | 外部 API 回應 | 連線至證交所 OpenAPI 與 RWD | 網址集中由設定檔讀取；自動轉換民國日期；失敗統一拋出代碼錯誤不洩漏內容 | `twse-client.test.js` |
| `setWatchActive` | `backend/worker/store.js` | 資料庫寫入更新 | 標的代號、狀態 | 寫入 D1（UPDATE ma_watch） | 標的不存在時拋出代碼錯誤；不使用 DELETE，歷史完整保留 | `ma-store.test.js` |
| `upsertCloses` | `backend/worker/store.js` | 批次寫入快取 | 標的代號、收盤價陣列 | 寫入 D1（INSERT OR REPLACE ma_close） | 使用 batch 批次更新；數值強制型別轉換；重複日期覆寫最新值 | `ma-store.test.js` |
| `upsertResults` | `backend/worker/store.js` | 批次寫入結果 | 收盤日、結果陣列 | 寫入 D1（INSERT OR REPLACE ma_result） | 使用 batch 批次更新；欄位空值標準化為 null；以日期與代號為複合主鍵 | `ma-store.test.js` |
| `runMaReport` | `backend/worker/handlers.js` | 定時排程與推播 | 排程觸發、D1、TWSE 資料 | 呼叫 FCM 送推播、寫入 D1 | 重複觸發保護（`ma.sentOn`）；單檔失敗隔離；開場台詞數字檢查與降級 | M4-S07～S10、S14；`ma-api.test.js` |
| `handleMaWatchlistPost` | `backend/worker/handlers.js` | 外部請求寫入清單 | 使用者請求 JSON | 寫入 D1（ma_watch、ma_close） | 嚴格動作白名單；`validateWatchInput` 參數檢驗；TWSE 呼叫例外安全回傳 502 | M4-S11、S12；`ma-api.test.js` |


