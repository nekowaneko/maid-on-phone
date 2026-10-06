# AccompanyPet M3 — 便宜批次執行計畫（Todoist 雙軌提醒：契約檔、提示詞、文件、實測清單）

> 這份文件給協作代理人（或規劃者本人）一次執行完。
> 本批次為純產出工作（建立契約檔、寫提示詞範本、寫文件、實測清單），不含修正迴圈。
> 執行順序：本批次先跑，完成後才凍結規格測試、開 worktree、平行執行 docs/M3-EXPENSIVE-PLAN.md 的 B、C、D 三條線。
> 背景：docs/wish28-pet-spec.md §4 F2、§5 M3。

## 0. 執行協定

- **全程不得向使用者提問。** 未明訂處依 §4 預設值表處理，並記錄在 DECISIONS.md（接續現有編號）。
- 本批次的驗收都是結構性檢查。失敗時補齊缺漏即可，不進入反覆修正的迴圈；補兩次仍不通過，寫入 BLOCKERS.md。
- 每完成 §1 的一個步驟就 commit；不設遠端、不 push；commit 訊息用繁體中文，以「M3 便宜批次：」開頭。
- **只可追加**既有文件（README.md、CHECKLIST.md、backend/SOURCE.md、docs/ARCHITECTURE.md、docs/WORKER-SETUP.md），不得刪改既有段落。
- 含反斜線的內容一律用 Write／Edit 工具寫，不用 shell heredoc。

## 1. 步驟（依序執行）

| 步驟 | 動作 | 對象 |
|---|---|---|
| 1 | 建立 | `backend/config/todoist-defaults.json`（§3.1，契約檔與預設設定） |
| 2 | 建立 | `backend/config/todoist-lines.json`（§3.2，預設台詞） |
| 3 | 建立 | `backend/config/todoist-split-prompt.md`（§3.3，LLM 拆解子任務提示詞） |
| 4 | 建立 | `app/src/main/assets/pet/todoist-labels.js`（§3.4，B、C 共用契約檔） |
| 5 | 追加 | `worker.properties.example` 加 `todoistToken` 說明（§3.5） |
| 6 | 建立 | `DEVICE-CHECKLIST-M3.md`（§3.6） |
| 7 | 追加 | `CHECKLIST.md` 的「M3」段落（§3.7）、`docs/WORKER-SETUP.md` 第 9 節（§3.8）、`docs/ARCHITECTURE.md` 的 M3 段落（§3.9） |

## 2. 產出檔案清單（交接契約）

貴批次 T0 會逐一確認以下檔案存在且非空：

- `backend/config/todoist-defaults.json`
- `backend/config/todoist-lines.json`
- `backend/config/todoist-split-prompt.md`
- `app/src/main/assets/pet/todoist-labels.js`
- `worker.properties.example` 含 `todoistToken=`
- `DEVICE-CHECKLIST-M3.md`
- `CHECKLIST.md` 含 `## M3`
- `docs/WORKER-SETUP.md` 含 `## 9.`
- `docs/ARCHITECTURE.md` 含 `M3`

## 3. 各檔案的內容規格

### 3.1 `backend/config/todoist-defaults.json`（契約檔）

```json
{
  "_note": "M3 Todoist 雙軌提醒預設設定值",
  "p2StaleDays": 14,
  "p2MaxPerWeek": 1,
  "dailyMaxSpeech": 2,
  "p2CronTime": "09:00",
  "p3CronTime": "08:30",
  "p3FollowupTime": "21:00"
}
```

### 3.2 `backend/config/todoist-lines.json`（預設台詞）

```json
{
  "p2Remind": [
    "「{title}」這件事擱置了一陣子呢，要不要今天先推進最小的一步？"
  ],
  "p3Remind": [
    "今天是「{title}」預定的日子喔，準備開始處理了嗎？"
  ],
  "p3AskDate": [
    "「{title}」這件事還沒有設定開始日期，你預計什麼時候可以做呢？"
  ],
  "p3Followup": [
    "晚上好！「{title}」今天順利完成了嗎？"
  ],
  "splitConfirm": [
    "我幫你把「{title}」拆成以下步驟囉：\n{steps}\n確定要加入 Todoist 子任務嗎？"
  ],
  "actionSuccess": [
    "瞭解，已經幫你更新 Todoist 囉！"
  ],
  "errorFallback": [
    "Todoist 連線好像有點狀況，稍後我會再試試看。"
  ]
}
```

### 3.3 `backend/config/todoist-split-prompt.md`

```markdown
你是一位細心的女僕助理。使用者想要把一個懸而未決的任務拆成 2~3 個具體且容易執行的小步驟。
請分析任務名稱，輸出 JSON 格式的子任務清單：
{
  "steps": ["步驟一描述", "步驟二描述"]
}
```

### 3.4 `app/src/main/assets/pet/todoist-labels.js`

```javascript
(function (root) {
  var TodoistLabels = {
    P2_ACTIONS: [
      { id: "today", label: "今天推進一小步" },
      { id: "snooze", label: "延後一週" },
      { id: "split", label: "拆成小步驟" }
    ],
    P3_ACTIONS: [
      { id: "do_today", label: "今天做" },
      { id: "tomorrow", label: "明天再提醒" }
    ]
  };
  root.TodoistLabels = TodoistLabels;
})(this);
```

### 3.5 追加 `worker.properties.example`

追加：
```properties
# Todoist API 授權 Token（M3 Todoist 提醒功能需要）
todoistToken=your_todoist_api_token_here
```

### 3.6 `DEVICE-CHECKLIST-M3.md`

建立包含 P2/P3 手機通知按鈕點擊與懸浮泡泡演出實測項目的檢查單。

### 3.7~3.9 文件追加

在 `CHECKLIST.md`、`docs/WORKER-SETUP.md` 與 `docs/ARCHITECTURE.md` 相關檔案中追加 M3 Todoist 雙軌提醒架構說明。
