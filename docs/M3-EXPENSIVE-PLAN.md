# AccompanyPet M3 — 貴批次執行計畫（Todoist 雙軌提醒 F2；B、C、D 三條線平行開工）

> 這份文件給三個協作代理人**同時**自主執行，各自負責一條線（B：懸浮窗網頁、C：Kotlin、D：Worker）。
> 前提：docs/M3-CHEAP-PLAN.md 已執行完成；規格測試已由規劃者凍結；每條線在自己的 git worktree 與分支上工作。
> 本批次含修正迴圈，成本控制條款見 §0 與 §6。整合（合併三條線、L3、報告）由規劃者負責，**不屬於任何一條線**。
> 背景：docs/wish28-pet-spec.md §4 F2、§5 M3。

## 0. 執行協定（最高優先，違反即為失敗）

### 0.1 不提問
全程不得向使用者或規劃者提問。未明訂處依 §7 預設值表處理；§7 未涵蓋時選擇最保守的做法，並把決策與理由記錄在**自己那條線的紀錄檔**。

### 0.2 工作循環
```
階段實作 → ./verify.sh --lane <你的線> → 全綠？
                                          ├─ 是 → commit（只在自己的分支）→ 下一階段
                                          └─ 否 → 自動修正 → 重跑
```

### 0.3 錯誤指紋斷路器【條款 1】
每次修正前，取失敗訊息的前三行做正規化（去除行號、路徑中的使用者名稱與 worktree 目錄名、時間戳記、十六進位位址）後雜湊，得到一枚「錯誤指紋」，記錄在自己的紀錄檔。
若同一枚指紋第二次出現，**立刻停止該項目**，在紀錄檔的「阻擋」段落寫下指紋、完整錯誤、已嘗試的修法、你判斷的根因，然後繼續處理其他項目。
輪數上限作為第二道防線，設為 3。不得為了讓指紋不同而改寫錯誤訊息或包裝例外。

### 0.4 分層驗收【條款 2】
沿用 `verify.sh`（Git Bash 執行）：
- **L1（秒級）**：grep 類的結構、架構、安全檢查（三條線都跑全部 L1）
- **L2（十秒～一分鐘）**：只跑該線負責的部分
  - B：`backend/tests/spec/m3/overlay-todoist.test.js` 與角色頁測試
  - C：Kotlin 單元測試 `:core:test`
  - D：`backend/tests/spec/m3/todoist.test.js` 與 backend 測試
- **L3**：只在整合時由規劃者跑一次 `./verify.sh --full`。

### 0.5 耦合驗收項宣告【條款 3】

| 項目 | 與之衝突 | 衝突時的優先順序 |
|---|---|---|
| P2 每日掃描擱置任務 | 每天最多出聲 2 次限制 | 每日總次數限制優先，滿 2 次後不再出聲 |
| P3 無到期日詢問 | 只詢問一次限制 | 只詢問一次優先，標記後不可重複追問 |

### 0.6 非決定性檢查禁入自動層【條款 4】
LLM 生成之子任務拆解語氣與建議品質不寫入自動單元測試斷言，自動測試僅驗證輸出 JSON 格式合法性與子任務陣列長度。

### 0.7 自動驗收項數量上限【條款 5】
自動測試項嚴格控制在 15 項（M3-S01 ~ M3-S15），重點驗證防灌水、頻率限制、寫入安全與介面合規。

### 0.8 成本記錄【條款 6】
每階段結束時在自己的紀錄檔記錄：修正輪數、錯誤指紋清單、每個驗收項失敗次數。

---

## 1. 本批次範圍與檔案所有權

| 線 | 可以新增或修改的檔案（其餘一律不得碰） |
|---|---|
| **D Worker** | `backend/core/todoist.js`（新增）、`backend/src/routes/todoist.ts`（新增）、`backend/src/cron/todoist-scan.ts`（新增）、`backend/src/services/todoist-api.ts`（新增）、`backend/migrations/*todoist*`（新增）、`backend/tests/todoist-*.test.js`、`lanes/M3-D.md` |
| **C Kotlin** | `core/src/main/kotlin/com/accompany/pet/core/todoist/`（新增）、`app/src/main/java/com/accompany/pet/todoist/`（新增）、`app/src/main/java/com/accompany/pet/WorkerApi.kt`（擴充 Todoist 端點）、`lanes/M3-C.md` |
| **B 懸浮窗網頁** | `app/src/main/assets/pet/todoist-view.js`（新增）、`app/src/main/assets/pet/index.html`（掛載）、`backend/tests/overlay-todoist.test.js`、`lanes/M3-B.md` |
| 規劃者（整合） | 合併三條分支、`verify.sh`、`SPEC-MAP.md`、`PROGRESS.md`、`DECISIONS.md`、`BLOCKERS.md`、`ACCEPTANCE-M3.md` |

合併順序：D → C → B。

---

## 2. 規格範例表（凍結測試需求 15 列）

| ID | 規格敘述 | 輸入／條件 | 預期結果 | 負責線 |
|---|---|---|---|---|
| **M3-S01** | P2 擱置掃描 | 修改時間 > 14 天的 P2 任務 3 件 | 選出最後修改時間擱置最久的一件，且 7 天內未提過 | D |
| **M3-S02** | P2 延後一週 | 使用者點擊「延後一週」 | D1 紀錄更新 `p2_snoozed_until` 為 7 天後，掃描過濾跳過 | D |
| **M3-S03** | P2 拆成小步驟 | LLM 解析返回 JSON 步驟清單 | 正確於 Todoist API 建立對應 Parent ID 之子任務 | D |
| **M3-S04** | P3 到期當日提醒 | 到期日為今日 08:30 | 發送 P3 提醒，到期日前日不提醒 | D |
| **M3-S05** | P3 無到期日詢問 | 任務無到期日，未曾詢問過 | 發送詢問推播，回應日期後正確寫入 Todoist 到期日 | D |
| **M3-S06** | P3 無到期日防重複問 | 任務已被標記為已詢問過 | 掃描時跳過該任務，不再追問 | D |
| **M3-S07** | P3 晚上未完成追問 | 當天選「今天做」，21:00 仍未完成 | 發送晚上追問提醒 | D |
| **M3-S08** | 每日出聲頻率上限 | 當天已有 2 次出聲記錄 | 即使滿足 P2/P3 條件， Cron 亦不發送出聲推播 | D |
| **M3-S09** | Todoist API 錯誤降級 | Todoist API 回傳 500 或 Token 無效 | 記錄 error log，不崩潰，改回傳預設降級訊息 | D |
| **M3-S10** | App 接收 Todoist FCM | 收到 type="todoist_p2" FCM | 角色模式開啟時調用懸浮窗泡泡演播；關閉時顯示 Native Notification | C |
| **M3-S11** | Notification Action | 點擊通知欄「延後一週」按鈕 | 呼叫 `WorkerApi.sendTodoistAction` 成功 | C |
| **M3-S12** | App 限制網路連線 | `WorkerApi` 以外的檔案包呼叫 | 不得出現 `HttpURLConnection` 等直連程式 | C |
| **M3-S13** | 懸浮窗 Todoist 泡泡渲染 | 收到 P2/P3 演播資料 | 正確切換表情（思考貌/擔心貌）並顯示 3 選 1 按鈕 | B |
| **M3-S14** | 懸浮窗點擊 action | 點擊「拆成小步驟」按鈕 | 觸發 `window.pet.onDrinkAction` / `onTodoistAction` 回傳介面 | B |
| **M3-S15** | HTML 標題安全性 | 任務標題包含 `<script>` 標籤 | 懸浮窗 UI 以 `textContent` 渲染，防範 XSS 攻擊 | B |

---

## 3. T0 交接契約

T0 階段確認 `docs/M3-CHEAP-PLAN.md` 產出之清單均已存在且非空，隨後即可展開 D/C/B 平行開發。
