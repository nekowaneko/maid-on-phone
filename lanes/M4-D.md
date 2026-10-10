# M4 D 線（Worker）紀錄

## 進度

| 階段 | 結果 | 修正輪數 | 錯誤指紋 | 各驗收項失敗次數 |
|---|---|---|---|---|
| T0a | 確認 CHEAP-PLAN 五個契約設定檔齊全且非空 | 0 | 無 | 全部 0 |
| D1 | 實作 `core/ma.js` 純函式（`roundTo`、`averageLast`、`classify`、`computeStock`、`descFor`、`countKinds`、`isTradingDay`、`prevTradingDay`、`buildMaPayload`、`validateWatchInput`）＋新增 `tests/ma-core.test.js`；測試全過（S01～S06、S16 通過） | 0 | 無 | 全部 0 |
| D2 | 實作 `worker/twse-client.js`、`twse-client.stub.js`、追加 `schema.sql`、`store.js`、`store.stub.js`＋新增 `tests/twse-client.test.js` 與 `tests/ma-store.test.js`；測試全過 | 0 | 無 | 全部 0 |

## 決策

- **純函式約束（A39、V24）**：`backend/core/ma.js` 嚴格維持純函式設計，不讀檔、不碰環境變數、不連線、不存取系統時鐘。
- **均線排列判定（A46、S16）**：各均線先依契約 `classify.roundDigits` 四捨五入後比較；任兩者相等判定為糾結 `T`；否則以大小順序字串查表得出種類代號。
- **唯一台詞與字串來源（A45、V32）**：描述與錯誤訊息一律由呼叫端傳入之 `lines` 或 `contract` 取出，`ma.js` 不寫死任何台詞句子。
- **證交所連線單一入口（A40、V31）**：唯一允許連線至證交所的模組為 `backend/worker/twse-client.js`，網址由 `ma-defaults.json` 讀取，不寫死於程式內。
- **無刪除操作與保留歷史（A42、V35）**：`schema.sql` 與 `store.js` 不含任何 `DELETE FROM ma_`；停止追蹤僅標記 `active = 0`，保留收盤價與計算歷史。

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

