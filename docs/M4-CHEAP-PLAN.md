# AccompanyPet M4 — 便宜批次執行計畫（盤前均線 F3：契約檔、說明文字、提示詞、文件、實測清單）

> 這份文件給協作代理人（或規劃者本人）一次執行完。
> 本批次為純產出工作（建立契約檔與設定檔、寫提示詞、寫文件、實測清單），不含修正迴圈，可用較便宜的模型執行。
> 執行順序：本批次先跑，完成後才凍結規格測試、開 worktree、平行執行 docs/M4-EXPENSIVE-PLAN.md 的 B、C、D 三條線。
> 背景：docs/wish28-pet-spec.md §4 F3、§5 M4（v1.6）；介面規格 design/prototype/（prototype.html、screens.md、ui-assertions.md、changes.md、later.md）。

## 0. 執行協定

- **全程不得向使用者提問。** 未明訂處依 §4 預設值表處理，並記錄在 DECISIONS.md（接續現有編號）。
- 本批次的驗收都是結構性檢查。失敗時補齊缺漏即可，不進入反覆修正的迴圈；補兩次仍不通過，寫入 BLOCKERS.md。
- 每完成 §1 的一個步驟就 commit；不設遠端、不 push；commit 訊息用繁體中文，以「M4 便宜批次：」開頭，結尾加 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。
- **只可追加**既有文件（README.md、CHECKLIST.md、backend/SOURCE.md、docs/ARCHITECTURE.md、docs/WORKER-SETUP.md），不得刪改既有段落。
- 含反斜線的內容一律用 Write／Edit 工具寫，不用 shell heredoc。
- JSON 檔寫完後用 `node -e "JSON.parse(require('fs').readFileSync('<檔案>','utf8'))"` 確認可解析；內容與本文逐字相同，**不得自行改寫、增刪句子**（那些句子是使用者在原型確認過的）。

## 1. 步驟（依序執行）

| 步驟 | 動作 | 對象 |
|---|---|---|
| 1 | 建立 | `backend/config/ma-contract.json`（§3.1，契約檔） |
| 2 | 建立 | `backend/config/ma-defaults.json`（§3.2，預設值契約檔） |
| 3 | 建立 | `backend/config/ma-lines.json`（§3.3，規則台詞） |
| 4 | 建立 | `backend/config/ma-glossary.json`（§3.4，轉弱、轉強等說明文字） |
| 5 | 建立 | `backend/config/ma-script-prompt.md`（§3.5，開場台詞提示詞） |
| 6 | 建立 | `app/src/main/assets/pet/ma-labels.js`（§3.6，B、C 共用契約檔） |
| 7 | 建立 | `DEVICE-CHECKLIST-M4.md`（§3.7） |
| 8 | 追加 | `CHECKLIST.md` 的「M4」段落（§3.8）、`docs/WORKER-SETUP.md` 第 9 節（§3.9）、`docs/ARCHITECTURE.md` 的 M4 段落（§3.10）、`backend/SOURCE.md`（§3.11） |
| 9 | 確認 | `design/prototype/` 與 `docs/wish28-pet-spec.md`、兩份 M4 計畫書都已存在並 commit（§3.12） |

## 2. 產出檔案清單（交接契約）

貴批次 T0a 會逐一確認以下檔案存在且非空：

- `backend/config/ma-contract.json`
- `backend/config/ma-defaults.json`
- `backend/config/ma-lines.json`
- `backend/config/ma-glossary.json`
- `backend/config/ma-script-prompt.md`
- `app/src/main/assets/pet/ma-labels.js`
- `DEVICE-CHECKLIST-M4.md`
- `CHECKLIST.md` 含 `## M4`
- `docs/WORKER-SETUP.md` 含 `## 9.`
- `docs/ARCHITECTURE.md` 含 `M4`
- `design/prototype/prototype.html`、`screens.md`、`ui-assertions.md`、`changes.md`、`later.md`

## 3. 各檔案的內容規格

### 3.1 `backend/config/ma-contract.json`（契約檔）

B、C、D 三條線的規格測試都讀這一份；任何一條線都不得修改。

```json
{
  "_note": "M4 盤前均線接口塊（docs/M4-EXPENSIVE-PLAN.md §4）。B、C、D 三條線的規格測試都讀這一份；各線不得修改。",
  "kinds": ["U", "D", "W", "V", "S", "B", "T", "N"],
  "kindGroups": { "U": "u", "D": "d", "W": "m", "V": "m", "S": "m", "B": "m", "T": "m", "N": "m" },
  "classify": {
    "windows": [5, 20, 60],
    "roundDigits": 2,
    "byOrder": {
      "5>20>60": "U",
      "60>20>5": "D",
      "20>5>60": "W",
      "20>60>5": "V",
      "5>60>20": "S",
      "60>5>20": "B"
    },
    "tie": "T",
    "insufficient": "N"
  },
  "statuses": ["ok", "failed", "empty", "none"],
  "push": {
    "field": "ma",
    "maxChars": 2048,
    "keys": ["date", "asOf", "u", "d", "m", "status"],
    "pushStatuses": ["ok", "failed"],
    "idPrefix": "ma-"
  },
  "api": {
    "report": "/api/ma/report",
    "history": "/api/ma/history",
    "watchlist": "/api/ma/watchlist",
    "refresh": "/api/ma/refresh"
  },
  "watchActions": ["add", "untrack", "restore"],
  "watchErrors": ["format", "notFound", "duplicate", "limit", "unavailable"],
  "codePattern": "^[0-9]{4,6}[A-Z]?$",
  "limit": 10,
  "historyDays": 7,
  "backfillMonths": 4,
  "minCloses": 60,
  "page": "/web/ma.html",
  "bridge": {
    "webToNative": "onMaPressed",
    "nativeToWeb": "showMa"
  },
  "bubbleActions": ["openMa", "dismiss"],
  "settingsKeys": {
    "sentOn": "ma.sentOn",
    "last": "ma.last",
    "refreshedAt": "ma.refreshedAt"
  }
}
```

### 3.2 `backend/config/ma-defaults.json`（預設值契約檔）

```json
{
  "_note": "M4 盤前均線預設值（台北時間）。D 線讀取，不得刪鍵。",
  "twseAllUrl": "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
  "twseDayUrl": "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY",
  "twseHolidayUrl": "https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule",
  "scheduleTime": "08:30",
  "twseDelayMs": 1000,
  "refreshMinIntervalSec": 60,
  "openingMaxChars": 40,
  "holidayKeepWords": ["開始交易", "最後交易"],
  "undoSeconds": 6
}
```

### 3.3 `backend/config/ma-lines.json`（規則台詞）

這些句子由規則顯示，不經語言模型；`opening` 只在語言模型失敗或回覆不合格時使用。

```json
{
  "opening": [
    "[smile]主人早安～今天的均線我整理好了。"
  ],
  "failed": "證交所的資料今天沒拿到，我晚點再試一次。",
  "failedStock": "這檔資料沒拿到。",
  "pending": "剛加入，下一個交易日 08:30 起出現在報告裡。",
  "disclaimer": "僅供參考，非投資建議。",
  "countsSentence": "多頭 {u}、空頭 {d}、其他 {m}。",
  "tags": {
    "failedStock": "沒拿到",
    "pending": "明天納入"
  },
  "errors": {
    "format": "請輸入股票代號或名稱。",
    "notFound": "查不到「{input}」，請輸入證交所的股票代號或完整名稱。",
    "duplicate": "{code} {name} 已經在追蹤清單裡了。",
    "limit": "最多追蹤 {limit} 檔，請先停止追蹤一檔。",
    "unavailable": "證交所暫時連不上，請稍後再試。"
  },
  "desc": {
    "U": "5 > 20 > 60，三條線依序往上排。",
    "D": "60 > 20 > 5，三條線依序往下排。",
    "W": "5 日線跌破 20 日線，短線轉弱。",
    "V": "5 日線跌破 20 日線與 60 日線，短線明顯轉弱。",
    "S": "5 日線站上 20 日線與 60 日線，20 日線仍在最下，短線轉強。",
    "B": "5 日線站上 20 日線，仍在 60 日線下方，築底回升。",
    "T": "均線糾結，方向未明。",
    "N": "上市未滿 60 個交易日，資料不足。"
  }
}
```

### 3.4 `backend/config/ma-glossary.json`（說明文字）

明細頁的「什麼意思？」與「看懂排列」只讀這一份，網頁程式不得寫死任何一句。內容是使用者 2026-10-10 在原型確認的版本。`chart` 是示意圖的六個點（0 在上、100 在下，由過去到今天），`N` 沒有示意圖。

```json
{
  "_note": "M4 明細頁說明文字（使用者 2026-10-10 在原型確認）。網頁只讀這份，不得在程式裡寫死。",
  "key": "把 5 日線想成「今天的氣溫」，20 日線是「這個月的平均」，60 日線是「這一季的平均」。",
  "lines": {
    "ma5": "今天的氣溫",
    "ma20": "這個月的平均氣溫",
    "ma60": "這一季的平均氣候",
    "compare": "三條線的高低，就是在比：今天、這個月、這一季，誰比較暖。"
  },
  "intro": { "title": "三條線怎麼想" },
  "weakStrong": {
    "title": "轉弱與轉強",
    "weak": "轉弱：今天先變冷，但這個月、這一季還暖。",
    "strong": "轉強：今天先回暖，但這個月、這一季還冷。",
    "note": "兩者都是「今天先轉向，長期還沒跟上」，不代表一定會走成多頭或空頭。"
  },
  "sectionTitle": "八種排列",
  "chartNote": "示意圖不是實際股價。這是描述現在的位置，不是預測。",
  "footer": "示意圖不是實際股價。僅供參考，非投資建議。",
  "order": ["U", "D", "W", "V", "S", "B", "T", "N"],
  "kinds": {
    "U": {
      "name": "多頭排列", "arrow": "", "glyph": "多",
      "def": "5 日、20 日、60 日線由上到下依序排列：短、中、長期都在往上。",
      "meta": "一路升溫。今天比這個月暖，這個月又比這一季暖，三種氣溫都在往上走。",
      "chart": { "a5": [60, 50, 40, 30, 20, 10], "a20": [64, 58, 52, 46, 40, 34], "a60": [70, 66, 62, 58, 54, 50] }
    },
    "D": {
      "name": "空頭排列", "arrow": "", "glyph": "空",
      "def": "60 日、20 日、5 日線由上到下依序排列：短、中、長期都在往下。",
      "meta": "一路降溫。今天比這個月冷，這個月又比這一季冷，三種氣溫都在往下走。",
      "chart": { "a5": [40, 55, 65, 75, 85, 92], "a20": [38, 44, 50, 56, 62, 68], "a60": [34, 34, 35, 35, 36, 36] }
    },
    "W": {
      "name": "轉弱", "arrow": "↘", "glyph": "弱",
      "def": "轉弱：5 日線往下跌破 20 日線，但還在 60 日線之上。短線先變弱，長線還沒跟上。",
      "meta": "入秋前的涼風。今天比這個月的平均涼，但這個月仍比整季暖。涼風不等於入秋，只是風向變了。",
      "chart": { "a5": [34, 26, 24, 36, 44, 52], "a20": [48, 44, 40, 38, 36, 35], "a60": [75, 74, 73, 72, 71, 70] }
    },
    "V": {
      "name": "明顯轉弱", "arrow": "↘", "glyph": "弱",
      "def": "明顯轉弱：5 日線同時跌破 20 日線與 60 日線，掉到三條線的最下面。",
      "meta": "寒流來了。今天比這一季的平均都冷，這個月卻還沒跟上降溫。短期已經明顯變冷，要看會不會拖成長期變冷。",
      "chart": { "a5": [34, 40, 52, 64, 76, 88], "a20": [48, 44, 40, 38, 36, 35], "a60": [60, 59, 58, 57, 56, 55] }
    },
    "S": {
      "name": "轉強", "arrow": "↗", "glyph": "強",
      "def": "轉強：5 日線往上站回 20 日線與 60 日線之上，但 20 日線還在最下面。短線先變強，中線還沒跟上。",
      "meta": "寒流後的大晴天。這個月偏冷，但今天已經暖到整季平均以上。回溫很快，不過這個月整體還在低檔。",
      "chart": { "a5": [78, 82, 76, 60, 45, 30], "a20": [40, 48, 56, 64, 72, 80], "a60": [45, 46, 47, 48, 50, 52] }
    },
    "B": {
      "name": "初步轉強", "arrow": "↗", "glyph": "強",
      "def": "初步轉強：5 日線站上 20 日線，但仍在 60 日線之下。短線剛開始回升，離長線還有一段距離。",
      "meta": "降溫後第一個出太陽的日子。今天比這個月暖，但還沒回到整季的水準，先別急著脫外套。",
      "chart": { "a5": [70, 82, 90, 78, 62, 50], "a20": [45, 52, 60, 68, 75, 80], "a60": [25, 26, 27, 28, 29, 30] }
    },
    "T": {
      "name": "糾結", "arrow": "↔", "glyph": "糾",
      "def": "糾結：有兩條以上的均線數值相同，分不出誰高誰低。",
      "meta": "忽冷忽熱。三種氣溫擠在同一個數字附近，看不出是在升溫還是降溫，先觀望。",
      "chart": { "a5": [40, 52, 44, 50, 46, 48], "a20": [48, 48, 48, 48, 48, 48], "a60": [48, 49, 48, 48, 48, 48] }
    },
    "N": {
      "name": "資料不足", "arrow": "", "glyph": "資",
      "def": "資料不足：上市（掛牌）未滿 60 個交易日，算不出 60 日線，所以不排列。",
      "meta": "剛開張的新店。只有 40 天的帳，算不出一整季的平均，所以先不排。",
      "chart": null
    }
  }
}
```

### 3.5 `backend/config/ma-script-prompt.md`（開場台詞提示詞）

寫法比照 `todoist-script-prompt.md`，內容如下（逐字）：

```markdown
現在要用角色的口吻，在開盤前說一句開場白，告訴主人今天的均線整理好了。

規則：
- 只說一句話，總長不超過 40 個字
- 不得出現任何數字（阿拉伯數字與全形數字都不行）
- 不得提到任何個別股票的名稱或代號
- 不得預測漲跌，不得建議買賣
- 語氣溫柔、有精神，像早晨的問候
- 依情緒在句子前加上表情標籤，只能用系統提示列出的標籤
```

### 3.6 `app/src/main/assets/pet/ma-labels.js`（B、C 共用契約檔）

比照 `todoist-labels.js`，一般 script，掛全域 `PetMaLabels`：

```javascript
// 懸浮窗的盤前均線文字對照表（M4 契約檔，B、C 兩條線共用，內容不得由任何一條線修改）。
// 角色頁從手機本機開啟，讀不到 JSON 也不能用 import，所以寫成一般 script，掛在全域的 PetMaLabels。
// 動作代號與 backend/config/ma-contract.json 的 bubbleActions 一一對應。
(function (root) {
  root.PetMaLabels = {
    buttons: {
      openMa: '看明細',
      dismiss: '晚點再看',
      know: '知道了'
    },
    mainButton: '📈 盤前均線',
    summary: {
      u: '多頭',
      d: '空頭',
      m: '其他'
    }
  }
})(this)
```

### 3.7 `DEVICE-CHECKLIST-M4.md`

比照 `DEVICE-CHECKLIST-M3R.md` 的格式（標題、「使用者前置準備」、測試表格含「通過」欄 `[ ]`）。前置準備：重新部署 Worker（`cd backend && npx wrangler deploy`）、重跑 D1 建表（`npx wrangler d1 execute pet-maid-db --remote --file worker/schema.sql`，**勿用 PowerShell 管線**）、重新安裝 App、在聊天網頁確認存取密鑰已儲存。測試項目（每項一列，欄位：編號、測試情境、操作步驟、預期結果、通過）：

1. 第一次加入標的：開「📈 盤前均線」→ 追蹤清單 → 加入 2330、0050、2603 → 顯示「明天納入」。
2. 08:30 角色模式開：角色出現說開場，摘要檔數正確，按「看明細」進入明細頁。
3. 手算對照：挑 3 檔，用證交所網站的收盤價手算 5／20／60 日均線，與卡片數字與排列名稱一致（含轉弱或轉強至少一檔）。
4. 「什麼意思？」：展開、收起，定義、示意圖、比喻正確，沒有排版破掉。
5. 「看懂排列」：三條線怎麼想、轉弱與轉強、八種排列依序出現，語氣通順好懂（使用者語感判斷）。
6. 歷史分頁：連續兩個以上交易日後，矩陣出現多天資料；轉換的格子有白框；點一格看說明。
7. 追蹤清單：重複加入、輸入不存在的代號、加到第 11 檔，各自顯示正確錯誤文字；停止追蹤後 6 秒內按「復原」。
8. 角色模式關：08:30 收到一般通知，點通知進明細頁。
9. 玩遊戲中：08:30 排隊並放靜音通知；離開遊戲後點「📈 盤前均線」能看到報告。
10. 休市日（週末或國定假日）：不收到推播。
11. 清單清空：停止追蹤全部標的後，下一個交易日不收到推播；進明細頁看到「加入第一檔」。
12. 證交所資料沒拿到（可在證交所維護時段或暫時斷網的測試 Worker 觀察）：收到失敗通知，沒有「看明細」；點通知或進明細頁看到「重試」。
13. 同一時刻的 Todoist P3 提醒不受影響（有到期 P3 任務時，08:30 同時收到兩則）。
14. 免責聲明「僅供參考，非投資建議。」出現在明細頁今天、歷史、看懂排列的頁尾。
15. 開場台詞不含數字、不提個別股票、語氣符合人設（使用者語感判斷）。

### 3.8 追加 `CHECKLIST.md`

在檔尾追加 `## M4` 段落，內容為：
- □ 重新部署 Worker，並對 D1 重跑 `worker/schema.sql`（M4 新增三張表，指令見 docs/WORKER-SETUP.md 第 9 節）。
- □ 第一次使用：在追蹤清單頁加入想追蹤的標的（上限 10 檔）。
- □ 讀 `RISK-REVIEW.md` 中 M4 新增的高風險函式。
- □ 看 `MUTATION-REPORT.md` 的 M4 範圍（`backend/core/ma.js`）與建議新增的規格範例。
- □ 看 `SECURITY-REPORT.md` 與依賴套件稽核結果（需連網，代理人不做）。
- □ 跑 `DEVICE-CHECKLIST-M4.md` 的手機實測。
- □ 開場台詞的語感、說明比喻是否好懂（使用者本人判斷）。

### 3.9 追加 `docs/WORKER-SETUP.md`

在檔尾追加 `## 9. 盤前均線（M4 貴批次完成後才有這個功能）`，內容：
1. 不需要新的金鑰；證交所資料是公開資料，不需要權杖。
2. `wrangler.toml` 的 crons 不用改：`30 0 * * *`（UTC 00:30＝台北 08:30）已經存在，M4 的盤前報告掛在同一個時間點。
3. 重新套用 D1 建表（新增 `ma_watch`、`ma_close`、`ma_result` 三張表，語句全部冪等）：在 Git Bash 執行 `cd backend && npx wrangler d1 execute pet-maid-db --remote --file worker/schema.sql`。
4. 重新部署：`npx wrangler deploy`。
5. 確認網頁：用手機瀏覽器開 `<Worker 網址>/web/ma.html`，第一次需要先在聊天網頁輸入存取密鑰（同網域共用）。
6. 第一次加入標的時，Worker 會向證交所補抓近 4 個月的收盤價；證交所有流量限制，請一檔一檔加，不要一次連按。

### 3.10 追加 `docs/ARCHITECTURE.md`

追加 `## M4 盤前均線` 段落：
- 資料流：08:30 Cron → 證交所（每檔當月日資料）→ D1（`ma_close`、`ma_result`）→ 規則算排列 → 語言模型只說開場一句 → FCM `ma` 欄位 → 角色泡泡 → `onMaPressed` → `MaActivity` → `ma.html` → `/api/ma/*`。
- 三張 D1 表、`/api/ma/*` 四條路由、設定檔五份（`ma-contract.json`、`ma-defaults.json`、`ma-lines.json`、`ma-glossary.json`、`ma-script-prompt.md`）。
- 載體決定：明細頁是 Worker B 網頁，不新增給遠端網頁用的 JS 介面；原生只多一個 `onMaPressed()`（第 6 個 `@JavascriptInterface`）。
- 說明文字與免責聲明不經語言模型。

### 3.11 追加 `backend/SOURCE.md`

追加一行：M4 新增的 `ma-*` 設定檔與 `ma.html` 為 pet-maid 自有，不來自 accompany_bot。

### 3.12 確認與 commit

- 確認 `design/prototype/` 內五個檔案存在（`prototype.html`、`screens.md`、`ui-assertions.md`、`changes.md`、`later.md`）；`f3-abc-compare.html` 是三種介面深度的比較檔，**一併保留**。
- 確認 `docs/wish28-pet-spec.md` 含「v1.6」與「### M4：盤前均線（F3）」。
- 這些檔案若尚未 commit，一併 commit（不得修改內容）。

## 4. 預設值表（不要為這些提問）

| 問題 | 預設值 |
|---|---|
| JSON 內容與本文有出入時 | 以本文為準，逐字照抄 |
| 檔案已存在 | 不覆蓋，既有檔改名為 `.bak` 保留，並記錄在 DECISIONS.md |
| 開場台詞提示詞缺少哪些標籤 | 不列標籤；標籤清單由系統提示（`buildSystemPrompt`）提供 |
| `DEVICE-CHECKLIST-M4.md` 的欄位 | 比照 `DEVICE-CHECKLIST-M3R.md` |
| 需要使用者本人判斷的內容（語感、比喻是否好懂） | 在檢查表中寫成「使用者語感判斷」項，不自行評價 |
| 字數超出時 | 不適用（內容已逐字給定） |

## 5. 驗收清單

全部為結構性檢查，用 grep 或解析完成，不需要執行任何程式邏輯。

| # | 驗收項 | 判定方式 |
|---|---|---|
| C01 | §2 清單中的檔案全部存在且非空 | 逐一檢查 |
| C02 | 四個設定檔（`ma-contract.json`、`ma-defaults.json`、`ma-lines.json`、`ma-glossary.json`）可被 JSON 解析 | `node -e` 解析 |
| C03 | `ma-contract.json` 的 `kinds` 恰好 8 個、`classify.byOrder` 恰好 6 條、`limit` 為 10、`watchErrors` 恰好 5 個 | 解析並斷言 |
| C04 | `ma-lines.json` 的 `desc` 與 `ma-glossary.json` 的 `kinds` 都恰好有 `kinds` 全部 8 個鍵 | 解析並斷言 |
| C05 | `ma-glossary.json` 的 `order` 與 `ma-contract.json` 的 `kinds` 順序相同；除 `N` 外每個 `chart` 有 `a5`、`a20`、`a60` 各 6 個數字 | 解析並斷言 |
| C06 | `ma-glossary.json` 每種排列的 `def`、`meta` 非空 | 解析並斷言 |
| C07 | `ma-lines.json` 的 `disclaimer` 為「僅供參考，非投資建議。」，且 `errors` 的鍵與 `ma-contract.json` 的 `watchErrors` 相同 | 解析並斷言 |
| C08 | `ma-script-prompt.md` 含「不得出現任何數字」「不得預測漲跌」 | grep |
| C09 | `ma-labels.js` 掛 `PetMaLabels`，含 `openMa`、`dismiss`、`mainButton` | grep |
| C10 | `DEVICE-CHECKLIST-M4.md` 有 15 個測試項目，每項一個 `[ ]` | 計數 |
| C11 | `CHECKLIST.md` 含 `## M4`；`docs/WORKER-SETUP.md` 含 `## 9.`；`docs/ARCHITECTURE.md` 含 `M4` | grep |
| C12 | 沒有任何既有檔案的既有段落被刪改 | `git diff` 只含追加行 |
| C13 | 設定檔中沒有真實金鑰、沒有 `TODOIST` 或 `FCM` 字樣的賦值 | grep |
| C14 | git 工作區乾淨 | `git status --porcelain` 為空 |

**不得為了通過驗收而放寬標準、刪減章節、或改寫驗收條件本身。**

## 6. 絕對禁止事項

- 不得向使用者提問。
- 不得建立含真實憑證的檔案，只建範例檔。
- 不得刪除或覆蓋既有檔案；有衝突則將既有檔案改名保留。
- 不得設遠端、不得 push。
- 不得連線證交所或任何外部服務。
- 不得執行 EXPENSIVE-PLAN.md 的任何內容，即使看起來很順手。
- 不得修改 `design/prototype/` 內的檔案內容。
- 不得改寫 §3 給定的任何句子（比喻、描述、台詞）。

## 7. 完成後的通知格式

輸出以下格式，不要輸出多餘內容：

    ✅ 便宜批次完成，請查核。

    驗收結果：C01–C14 全部通過（或：通過 n 項，m 項未通過，詳見 BLOCKERS.md）
    產出檔案：<n> 個
    Commit 數：<n>
    補齊次數：<n>

    需要你人工確認的部分：
    1. `ma-glossary.json` 的比喻與定義（使用者語感）
    2. `DEVICE-CHECKLIST-M4.md` 的測試項目

    自主決策列在 DECISIONS.md，共 <n> 項。

## 8. 故意不做的事

- 不修改任何程式邏輯，不寫規格測試——那屬於 EXPENSIVE-PLAN.md。
- 不執行測試套件。
- 不部署 Worker、不套用 D1 建表（那是使用者的事，步驟寫在 WORKER-SETUP.md）。
- 不建立 `ma.html`（屬於 B 線）。
- 不自行擴充範圍；有建議寫進 DECISIONS.md 的「建議後續」段落，不要實作。
