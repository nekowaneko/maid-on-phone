# M2 D 線（Worker）紀錄

## 進度

| 階段 | 結果 | 修正輪數 | 錯誤指紋 | 各驗收項失敗次數 |
|---|---|---|---|---|
| D0 | docs/M2-CHEAP-PLAN.md §2 清單齊全：`drink-model.json`、`starbucks.json`、`calorie.js`、`ledger.js`、`costdown-calorie.test.js`、`costdown-ledger.test.js`、`drink-defaults.json`、`drink-lines.json`、`app/src/main/assets/pet/drink-labels.js`、`DEVICE-CHECKLIST-M2.md` 存在且非空；`worker.properties.example` 含 `apiSecret=`、`backend/SOURCE.md` 含 `cost_down`、`CHECKLIST.md` 含 `## M2`、`docs/WORKER-SETUP.md` 含 `## 8.`、`docs/ARCHITECTURE.md` 含 `M2` | 0 | 無 | 無 |
| D1 | `core/drink.js` 純函式＋`tests/drink-core.test.js`；輔助測試與照抄的 costdown 測試第一次執行即全過（47 個）。此時 `./verify.sh --lane D` 的 V26 必然失敗（凍結的 `spec/m2/drink.test.js` 要 import `handlers.js` 的 `runScheduled`，D2／D3 才有），所以 D1～D3 合併成一次 commit | 0 | 無 | 全部 0 |
| D2 | `schema.sql`、`store.js`、`store.stub.js`、`handlers.js` 的 `/api/drink/*`、兩份提示詞、`drink-lines.json` 的 `undone` 句子；M2 Worker 規格 15 列第一次執行即全過 | 0 | 無 | 全部 0 |
| D3 | `push.js` 第 5 參數、`runScheduled`、`index.js` 的 `scheduled`、`wrangler.toml` 的 `[triggers]`、`send_push.py --actions`、`stryker.config.json`；`tests/drink-api.test.js`、`tests/push-actions.test.js` 第一次執行即全過（27 個）；`./verify.sh --lane D` 第一次執行即全綠（L1 全部、V26 通過 414 個 ≥ 361） | 0 | 無 | 全部 0 |
| 結束 | 補齊本紀錄檔，重跑 `./verify.sh --lane D` 全綠 | 0 | 無 | 全部 0 |

規格測試：M2-S01～S12、S14～S16（Worker 的 15 列）15/15 通過；規格爭議 0 項。M1.5、M1.6 凍結規格與 accompany_bot 原有測試、`costdown-*.test.js` 全過。

## 決策

- **choose 回傳的草稿**：§4.1.2 第 2 步只說「把不在清單的值換成 null」。choose 時回傳的是使用者原本說的草稿（沒說的大小、甜度維持 null，不先填大杯、全糖），只把不合法的那個欄位清掉；這樣使用者選完後 `preview` 仍會說出「沒說大小，先當大杯」。confirm 時才回填預設值。
- **星巴克的冰量**：§4.1.2 第 0 步只列出要清空 base、size、sugar、topping；`iceId` 在清單內就保留（匯出的 `ice` 有值），不在清單就是 null，不補 `normal`（星巴克不走組合式）。
- **品名**：trim 後非空才採用，最多 30 字（避免語言模型把一長串文字塞進預設台詞）；沒有品名用基底名稱。
- **台詞數字檢查的補強**：`checkScriptNumbers` 先把全形數字 `０-９` 換成半形再檢查（語言模型用全形數字就能繞過規則）。中文數字（例如「五百」）無法可靠辨識，不檢查，列入 DEVICE-CHECKLIST 的人眼項目即可（整合時可評估）。
- **語言模型台詞的額外條件**：剝掉標籤後必須有文字、全長不超過 200 字，不符合時與數字不符一樣算不通過（重試 1 次、仍不行用預設台詞）。避免空白台詞或超長台詞塞進泡泡與推播。
- **語言模型失敗時不重試**：A31 的「重試 1 次」只用在數字不通過；呼叫本身失敗（例外、空回覆）或用量到頂直接用預設台詞，省一次呼叫。
- **用量到頂的判斷**：parse 入口檢查一次（到頂回 `other`＋capped）；之後每一次台詞呼叫前也檢查，到頂就直接用預設台詞（§4.1.4「用量到頂 → 預設台詞」）。
- **already／cannotUndo／notUnderstood**：§4.1.4 沒列為語言模型產生的情境，直接取 `drink-lines.json` 對應鍵的第一句，不呼叫語言模型。
- **`drink-lines.json` 的 `undone`**：§4.1.4 規定 undone 的必含數字是四個統計數字，但原句沒有佔位符；兩句都補上 `{weekCups}`、`{monthSavedMoney}`、`{paybackPct}`、`{monthSavedKcal}`（只改句子、未刪鍵、未刪佔位符）。
- **台詞可用的表情**：系統提示的 `EMOTION_LIST` 用 backend `emotion-map.json` 的鍵再加上角色頁另有的 `pout`、`shy`（常數在 `handlers.js`），提示詞也寫明只能用 `[pout]`、`[shy]`、`[smile]`、`[thinking]`、`[troubled]`。不改 backend 的 `emotion-map.json`。
- **設定的數字欄位**：`PUT` 只接受 JSON 數字型別的整數（`"300"` 字串回 400）；C 線用 `JSONObject.put(Int)` 送出即可。設定存在 `settings` 表時是文字，讀回時逐欄驗證，存壞的欄位退回 `drink-defaults.json` 的預設值。`PUT` 成功回傳讀回後的五個欄位（名稱已 trim），多餘欄位不寫入。
- **`/api/drink/*` 的請求格式錯誤**：`preview`、`confirm` 的 `draft` 不是物件、`undo` 的 `logId` 不是非空字串 → 400 `{ error }`（§4.1.2 沒規定，選較保守的做法，不寫入任何資料）。路徑不認得回 404、方法不對回 405。
- **`runScheduled`**：推播是否已設定在產生台詞之前檢查（未設定就不呼叫語言模型）；整個流程包在 try/catch，儲存層出錯只記錯誤訊息，不讓排程丟例外。日誌只記成功、失敗與錯誤代碼，不記台詞與推播代碼。
- **store.js 的撤銷**：`UPDATE ... WHERE id = ?1 AND undone = 0`，以 `meta.changes > 0` 判斷，重複撤銷不會改到任何列，也沒有先讀再寫的競態。
- **`schema.sql`**：`drink_logs` 是新表，`starbucks_id` 直接寫進 `CREATE TABLE`（沒有舊表需要 `ALTER`）。這個 SQL 檔是用 Git Bash 的 heredoc 附加的（內容沒有反斜線，已逐行確認），其餘程式碼檔都用 Write／Edit。
- **Stryker**：`mutate` 加 `core/drink.js`；`command` 依計畫追加 `tests/spec/m2/*.test.js tests/drink-*.test.js`，另外加上本線新增的 `tests/push-actions.test.js`（殺 `push.js` 第 5 參數的突變）。
- **建議（未實作）**：語言模型台詞若把標籤放在句中而不是開頭，推播的 `script` 不會以標籤開頭（規格只要求「沒有任何標籤才補」）；如果角色頁需要一定以標籤開頭，整合時可考慮改成「開頭不是標籤就補」。依 §8 不擴充，僅記錄。

## 阻擋

無。斷路器未觸發；規格爭議 0 項。

## 需要整合處理

- 無必須由規劃者修改的檔案。
- 提醒：`stryker.config.json` 的 `command` 含 `tests/spec/m2/*.test.js`，合併 B 線之前這個萬用字元只會比對到 `drink.test.js`，合併後會連同 `overlay-drink.test.js` 一起跑（依計畫 §2.2）。
- 提醒 C 線（依 §4 介面，不需改動）：`PUT /api/drink/settings` 的數字欄位要送 JSON 數字；`undo` 的 `logId` 是 `saved` 回應中的字串。

## 高風險函式

| 函式 | 檔案 | 風險類別 | 輸入來源 | 對外動作 | 防護 | 測試 |
|---|---|---|---|---|---|---|
| `handleDrinkConfirm`（新增） | `backend/worker/handlers.js` | 對外部儲存寫入（D1） | App 送來的 `draft`（已過授權） | `store.addDrinkLog` 一筆 | 授權在前；`draft` 不是物件回 400；Worker 自己 `resolveDraft` 重算熱量，App 送的熱量與任何多餘欄位都不採用（A30）；驗不過回 choose 不寫入；`logId` 由 Worker 產生 | M2-S03、S10、S14、S15、S16；drink-api（熱量竄改、驗不過不寫入、價格） |
| `handleDrinkResist`（新增） | `backend/worker/handlers.js` | 對外部儲存寫入（D1） | `POST /api/drink/resist`（已過授權，無內容） | `store.addDrinkLog` 一筆 | `canResist`：同時段已有沒喝或今天已喝過就回 already 不寫入；時段與日期一律用台北時間 | M2-S07、S08、S09；drink-api（撤銷後可再按） |
| `handleDrinkUndo`（新增） | `backend/worker/handlers.js` | 對外部儲存寫入（D1） | App 送來的 `logId` | `store.markDrinkUndone` | `logId` 須為非空字串；`canUndo`（存在、未撤銷、7 天內）＋儲存層條件式 UPDATE，兩道都過才算撤銷 | M2-S09、S14；drink-api（7 天界線、不存在、型別錯誤） |
| `handleDrinkSettingsWrite`（新增） | `backend/worker/handlers.js` | 覆寫使用者設定 | App 送來的五個欄位 | `store.writeSetting` 五次 | `validateDrinkSettings` 全部通過才開始寫；任一不合回 400 且一個欄位都不寫；只寫五個固定鍵 | M2-S12；drink-core（每個欄位的界線）；drink-api（字串數字、缺欄位、多餘欄位） |
| `runScheduled`（新增） | `backend/worker/handlers.js` | 定時對外寫入（推播） | 排程時間、D1 的設定與紀錄 | `deps.pusher` 送 FCM 一次；成功才寫 `drink.askedOn` | `shouldAsk`（整點、今天沒問過、詢問時段沒有紀錄）；推播未設定不做事；只送一次不重試；台詞數字檢查；try/catch 不讓排程丟例外；日誌不記內容 | M2-S11；drink-api（未設定、送出失敗不補送、台詞退回預設、設定的時間、撤銷的紀錄、儲存層出錯） |
| `handleDrinkParse`（新增） | `backend/worker/handlers.js` | 外部文字交給語言模型 | 使用者說的話（1～200 字） | 呼叫語言模型 1～3 次 | 長度檢查；用量到頂不呼叫；只取九個欄位（A30）；JSON 擷取失敗回 other；台詞數字檢查（A31） | M2-S01、S04、S05、S06、S16；drink-api（長度、非 JSON、無關話題、用量到頂、用量記錄） |
| `generateScript`／`finishScript`（新增） | `backend/worker/handlers.js` | 語言模型輸出顯示給使用者 | 語言模型回覆 | 無（回傳台詞） | `checkScriptNumbers`、長度與空白檢查、最多重試 1 次、預設台詞數字由規則填入、沒有標籤補 `[pout]` | M2-S05、S06、S11；drink-api |
| `addDrinkLog`、`markDrinkUndone`、`listDrinkLogs`、`findDrinkLog`（新增） | `backend/worker/store.js` | 寫入資料庫；SQL 無法離線測 | 路由層組好的紀錄 | D1 INSERT／UPDATE／SELECT | 全部參數化查詢（`?1`…），不拼字串；撤銷用 `AND undone = 0` 條件式 UPDATE；配料存 JSON 文字、讀回解析失敗當空陣列 | 介面同 `store.stub.js`（規格與輔助測試走 stub）；實際 SQL 需手機實測（§6.3）與整合時的 RISK-REVIEW |
| `resolveDraft`、`checkScriptNumbers`、`statsOf`、`validateDrinkSettings`、`shouldAsk`（新增） | `backend/core/drink.js` | 純函式（決定寫入內容與對外推播時機） | 呼叫端傳入 | 無 | 純函式、不讀時間、不改傳入物件；熱量只來自 `calorie.js` | drink-core（47 個中的大部分）＋M2 規格 15 列 |
| `buildFcmMessage`（修改） | `backend/core/push.js` | 組出對外訊息 | handler 傳入的 actions | 無（純函式） | 第 5 參數必須是非空字串才加入，其餘輸入與 M1.6 逐字相同 | push-actions；M1.5／M1.6 推播規格 |
| `build_data`／`build_message`（修改） | `tools/send_push.py` | 測試工具對外送推播 | 命令列參數 | 由使用者手動執行時才連 FCM | `--actions` 沒給或空字串時不帶；不印出金鑰與推播代碼（沿用） | 無自動測試（手機實測，見 DEVICE-CHECKLIST-M2.md） |
