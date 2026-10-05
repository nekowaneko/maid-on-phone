# AccompanyPet M2 — 便宜批次執行計畫（戒飲記錄：搬模型資料、契約檔、文件、實測清單）

> 這份文件給協作代理人（或規劃者本人）一次執行完。
> 本批次為純產出工作（照抄檔案、寫契約檔、寫文件），不含修正迴圈。
> 執行順序：本批次先跑，完成後才凍結規格測試、開 worktree、平行執行 docs/M2-EXPENSIVE-PLAN.md 的 B、C、D 三條線。
> 背景：docs/M2-HANDOFF.md、docs/wish28-pet-spec.md §4 F1、§5 M2。
> **前提**：docs/M2-EXPENSIVE-PLAN.md §4.5 規格範例表與 §7.1 待確認事項已由使用者逐列確認。確認結果若改動了本文件 §3 的內容，以確認結果為準。

## 0. 執行協定

- **全程不得向使用者提問。** 未明訂處依 §4 預設值表處理，並記錄在 DECISIONS.md（接續現有編號）。
- 本批次的驗收都是結構性檢查。失敗時補齊缺漏即可，不進入反覆修正的迴圈；補兩次仍不通過，寫入 BLOCKERS.md。
- 每完成 §1 的一個步驟就 commit；不設遠端、不 push；`.idea/`、`tools/push.json` 不加入。commit 訊息用繁體中文，以「M2 便宜批次：」開頭，結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **只可追加**既有文件（README.md、CHECKLIST.md、backend/SOURCE.md、docs/ARCHITECTURE.md、docs/WORKER-SETUP.md），不得刪改既有段落。
- 照抄的檔案**逐字照抄**，只允許 §3 明訂的改動（開頭加一行來源註解、測試的 import 路徑）。
- 含反斜線的內容一律用 Write／Edit 工具寫，不用 shell heredoc。

## 1. 步驟（依序執行）

來源根目錄：`C:\Users\Dominic\Desktop\ml_demo\cost_down`（以下簡稱 `cost_down/`），commit `9fc08b2`。開始前先確認 `git -C cost_down rev-parse --short HEAD` 為 `9fc08b2`；不是的話照抄 `9fc08b2` 版本（`git -C cost_down show 9fc08b2:<路徑>`），並記在 DECISIONS.md。

| 步驟 | 動作 | 對象 |
|---|---|---|
| 1 | 照抄 | `cost_down/netlify_deploy/data/drink-model.json` → `backend/config/drink-model.json`（逐字，不加註解，JSON 不能加） |
| 2 | 照抄 | `cost_down/netlify_deploy/core/calorie.js` → `backend/core/calorie.js`；`core/ledger.js` → `backend/core/ledger.js`（§3.1） |
| 3 | 照抄 | `cost_down/tests/calorie.test.js` → `backend/tests/costdown-calorie.test.js`；`tests/ledger.test.js` → `backend/tests/costdown-ledger.test.js`（§3.1） |
| 4 | 建立 | `backend/config/drink-defaults.json`（§3.2，契約檔） |
| 5 | 建立 | `backend/config/drink-lines.json`（§3.3，預設台詞） |
| 6 | 建立 | `app/src/main/assets/pet/drink-labels.js`（§3.4，B、C 共用契約檔） |
| 7 | 追加 | `worker.properties.example` 加 `apiSecret`（§3.5） |
| 8 | 建立 | `DEVICE-CHECKLIST-M2.md`（§3.6） |
| 9 | 追加 | `backend/SOURCE.md`（§3.7）、`CHECKLIST.md` 的「M2」段落（§3.8）、`docs/WORKER-SETUP.md` 第 8 節（§3.9）、`docs/ARCHITECTURE.md` 的 M2 段落（§3.10） |

## 2. 產出檔案清單（交接契約）

貴批次 T0 會逐一確認以下檔案存在且非空：

- `backend/config/drink-model.json`
- `backend/core/calorie.js`、`backend/core/ledger.js`
- `backend/tests/costdown-calorie.test.js`、`backend/tests/costdown-ledger.test.js`
- `backend/config/drink-defaults.json`、`backend/config/drink-lines.json`
- `app/src/main/assets/pet/drink-labels.js`
- `worker.properties.example` 含 `apiSecret=`
- `DEVICE-CHECKLIST-M2.md`
- `backend/SOURCE.md` 含 `cost_down`
- `CHECKLIST.md` 含 `## M2`
- `docs/WORKER-SETUP.md` 含 `## 8.`
- `docs/ARCHITECTURE.md` 含 `M2`

## 3. 各檔案的內容規格

### 3.1 照抄的程式與測試

- `calorie.js`、`ledger.js`：檔案第一行前面加一行 `// 照抄自 cost_down（戒飲存）commit 9fc08b2 的 netlify_deploy/core/<檔名>，不得修改；要更新時照 backend/SOURCE.md 重抄`，其餘逐字。
- 兩個測試檔：開頭加同樣格式的一行來源註解；`'../netlify_deploy/core/` 換成 `'../core/`；`'../netlify_deploy/data/drink-model.json'` 換成 `'../config/drink-model.json'`。其餘逐字。
- 測試若讀了 `starbucks.json` 或 `drink-model.json` 以外的資料檔，**不要**搬那個資料檔：把那幾個 `test(...)` 整段保留不動，記在 BLOCKERS.md「costdown 測試缺資料檔」，交給貴批次 D 線處理（D 線可以把整個檔案改成只測 `calcKcal`、`explainKcal`，這是唯一允許改動照抄測試的情況）。
- 完成後在 `backend/` 執行 `node --test tests/costdown-*.test.js`。失敗時只檢查路徑替換有沒有漏，不改任何斷言；仍失敗就記 BLOCKERS.md。

### 3.2 `backend/config/drink-defaults.json`（契約檔）

戒飲存的預設值（`index.html` 第 387–395 行）加上 M2 的每日詢問時間：

```json
{
  "_note": "M2 戒飲記錄的預設值，來源：cost_down commit 9fc08b2 的 index.html defaultData。使用者在 App 的戒飲設定改過的值存在 D1 settings 表（drink. 開頭），這裡只是沒設定時的預設。",
  "subscriptionName": "Claude Pro",
  "monthlyFee": 650,
  "resistValue": 60,
  "monthlyQuota": 20,
  "askTime": "15:00",
  "drinks": [
    { "id": 1, "name": "珍珠奶茶", "price": 65, "sugar": 55, "kcal": 650 },
    { "id": 2, "name": "四季春茶", "price": 35, "sugar": 40, "kcal": 180 }
  ]
}
```

### 3.3 `backend/config/drink-lines.json`（預設台詞）

台詞數字不一致、語言模型失敗或用量到頂時用的預設台詞。每句都以表情標籤開頭，佔位符用 `{名稱}`。語氣：微傲、一句嬌，**喝了也不能有罪惡感**。必備鍵（每個鍵是字串陣列，至少 1 句，最多 3 句）：

| 鍵 | 什麼時候用 | 必須含的佔位符 |
|---|---|---|
| `confirm` | 複述待確認的飲料 | `{name}` `{size}` `{sugar}` `{ice}` `{kcal}` |
| `confirmWithPrice` | 同上，使用者有說價格 | 上列＋`{price}` |
| `choose` | 請使用者選最接近的品項（不得含任何數字） | 無 |
| `saved` | 喝了，已記下 | `{weekCups}` `{monthSavedMoney}` `{paybackPct}` `{monthSavedKcal}` |
| `resisted` | 沒喝，已記下 | 同上 |
| `already` | 今天已經記過了，沒有新增 | 無 |
| `undone` | 撤銷完成 | 無 |
| `cannotUndo` | 這筆不能撤銷 | 無 |
| `notUnderstood` | 語言模型回的內容看不懂 | 無 |
| `notDrink` | 說的內容跟飲料無關、語言模型又失敗時 | 無 |
| `ask` | 每天詢問「今天有喝飲料嗎？」 | 無 |

另加 `"labels"`：`{"assumedSize": "（沒說大小，先當大杯）", "assumedSugar": "（沒說甜度，先當全糖）"}`，複述時接在句尾。

### 3.4 `app/src/main/assets/pet/drink-labels.js`（契約檔）

一般 script（不是 module），以 `(function (root) { root.PetDrinkLabels = {...} })(this)` 掛上全域，寫法照 `emotion-map.js`。內容：

- `sugarLevels`：`[{id:'full',name:'全糖'},{id:'less',name:'少糖'},{id:'half',name:'半糖'},{id:'quarter',name:'微糖'},{id:'none',name:'無糖'}]`（順序與 `drink-model.json` 相同）
- `buttons`：`{confirm:'對，記下來', changeSugar:'改甜度', cancel:'取消', resist:'沒喝', speak:'有喝，用說的', undo:'撤銷'}`
- `undoMs: 60000`（撤銷按鈕保留的時間）

### 3.5 `worker.properties.example` 追加

```
# 戒飲記錄（M2）：App 呼叫 Worker API 用的存取密鑰，跟 wrangler secret put APP_SECRET 設的是同一把。
# API 的網址由上面的 chatUrl 取出 https://網域 這一段，不用另外填。沒填時「沒喝」與語音記錄會提示尚未設定。
apiSecret=
```

### 3.6 `DEVICE-CHECKLIST-M2.md`

照 DEVICE-CHECKLIST-M1.6.md 的格式。開頭「實測前準備」：套用新 schema、填 `apiSecret`、重新部署 Worker、重新安裝 App（指向 docs/WORKER-SETUP.md 第 8 節）。

- A 節（規格範例表的手機部分）：M2-S01 說「剛喝大杯珍奶半糖去冰」聽到正確複述；M2-S02 改甜度選微糖後重新複述；M2-S03 確認後回報四個數字；M2-S04 說「喝了一杯咖啡」出現基底清單；M2-S11 15:00 收到詢問推播，按「沒喝」記下、按「有喝，用說的」角色出現並開始聽；M2-S13 角色模式關時通知有兩個按鈕。
- B 節（移出自動層的項目）：語言模型把各種口語（「波霸奶綠少冰」「無糖綠」「一杯拿鐵 55 塊」）對應得準不準，記下錯誤的說法；台詞語氣是否微傲、喝了也沒有罪惡感；等待時是思考的臉；泡泡按鈕太多時能捲動、不會擋住角色；撤銷按鈕 1 分鐘後消失；網路斷掉時泡泡顯示連不上的提示、不閃退；`GET /api/drink/export` 下載的檔案能匯入戒飲存（**注意：戒飲存匯入會整份取代原本的資料，先在戒飲存匯出備份**）。

### 3.7 `backend/SOURCE.md` 追加

一節「戒飲存（cost_down）的來源」：本機路徑 `C:\Users\Dominic\Desktop\ml_demo\cost_down`、commit `9fc08b2`、照抄的 5 個檔案與改了什麼（只有 §3.1 的路徑與來源註解）、沒搬的東西（`starbucks.json` 查表、Gemini 代打估熱量、`slots.js`、`migrate.js`）與原因、之後要更新時的步驟（同 accompany_bot 那一節的做法）。

### 3.8 `CHECKLIST.md` 追加「## M2」

- 套用新 schema：`npx wrangler d1 execute pet-maid-db --remote --file worker/schema.sql`
- 主倉庫的 `worker.properties` 填 `apiSecret`（**開 worktree 之前就要填**）
- `npx wrangler deploy`（排程觸發會一起生效），密鑰相關一律用 Git Bash 或 cmd
- 照 DEVICE-CHECKLIST-M2.md 實測
- 看 RISK-REVIEW.md 的 M2 段落（`apiSecret` 編進 APK 的風險）
- 突變測試報告的 M2 範圍

### 3.9 `docs/WORKER-SETUP.md` 第 8 節「戒飲記錄（M2）」

依序：套用 schema（指令同上，說明是冪等、不會清掉資料）、`worker.properties` 加 `apiSecret`（值與 `APP_SECRET` 相同；為什麼 App 也要這把）、重新部署（`wrangler.toml` 的 `[triggers]` 每小時跑一次，依台北時間在設定的整點送詢問）、用 curl 測一次（Git Bash：`curl -H "x-app-secret: $SECRET" https://<網域>/api/drink/stats`）、匯出（`/api/drink/export`，存成檔案後在戒飲存匯入；匯入會整份取代）。

### 3.10 `docs/ARCHITECTURE.md` 追加

一段「M2 戒飲記錄」：資料流（語音 → App → `POST /api/drink/parse` → 語言模型只回編號 → Worker 用組合式模型算熱量 → 角色複述 → 按鈕 → App → `confirm`／`preview`）；Worker 的每小時排程；`drink_logs` 表；App 唯一連外的檔案 `WorkerApi.kt`；第 4 個 JS 介面 `onDrinkAction`。

## 4. 預設值表

| 問題 | 預設值 |
|---|---|
| `cost_down` 的 HEAD 不是 `9fc08b2` | 用 `git show 9fc08b2:<路徑>` 取舊版，記 DECISIONS.md |
| 照抄的測試跑不過 | 只檢查路徑替換；仍失敗記 BLOCKERS.md，不改斷言 |
| `drink-lines.json` 每個鍵要幾句 | 2 句（`ask` 3 句） |
| 既有文件沒有可追加的位置 | 追加在檔尾 |
| `docs/WORKER-SETUP.md` 第 8 節編號已被占用 | 用下一個沒用過的編號，§2 的檢查跟著改，記 DECISIONS.md |

## 5. 驗收

§2 清單逐項存在且非空；`node --test tests/costdown-*.test.js` 通過（或已記 BLOCKERS.md）；`node -e "JSON.parse(require('fs').readFileSync('backend/config/drink-lines.json','utf8'))"` 與 `drink-defaults.json` 同樣能解析；`drink-lines.json` 的 `choose`、`already`、`ask` 句子不含任何阿拉伯數字；`./verify.sh` 的 L1 仍通過（V06 不得因新檔案失敗）；`git status` 乾淨（`.idea/`、`tools/push.json` 除外）。

## 6. 故意不做的事

- 不寫任何 Worker、Kotlin、角色頁的程式（屬貴批次）
- 不搬 `starbucks.json`、Gemini 代打估熱量、`slots.js`、`migrate.js`
- 不改 `backend/schema.sql`、`wrangler.toml`（屬 D 線）
- 不建立 worktree、不凍結規格測試（由規劃者處理）
- 不部署、不填真正的 `worker.properties`
