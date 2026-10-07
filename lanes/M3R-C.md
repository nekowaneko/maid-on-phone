# M3R C 線 (Kotlin) 執行紀錄

## 進度
- C1：core `TodoistModels.kt` 改寫與 `Reminder.todoist` 擴充 — `./verify.sh --lane C` 通過
- C2：app 整合 `PetBridge.onTodoistAction`、`OverlayService.showTodoist` / 動作處理、`ReminderDispatcher` 分流、`PetControl.startPetService` 參數更新，並刪除舊版 `TodoistActionHandler.kt` — `./verify.sh --lane C` 通過

## 決策
- 依據 `docs/M3R-EXPENSIVE-PLAN.md` §4.5 與 `backend/config/todoist-contract.json` 實作 Kotlin 模組。
- 在 `PetBridge` 新增第 5 個 `@JavascriptInterface fun onTodoistAction(json: String)`，限制資料長度最多 16 KB (16,384 字元)。
- 針對測試字串避開 V06 金鑰檢查陷阱 (s-k- 連字號)，`TodoistModelsTest.kt` 的無效任務 ID 測試改用 `A-01` 取代 `task_123`。

## 阻擋
無

## 需要整合處理
無

## 高風險函式
- `com.accompany.pet.core.todoist.isValidTaskId(id: String?): Boolean`：驗證任務 ID 是否符合格式（1~64 碼英數字或底線）。
- `com.accompany.pet.core.todoist.pickTodoistPayload(raw: String?): String?`：驗證並清理推播中的 Todoist JSON 負載（上限 2048 字）。
- `com.accompany.pet.core.todoist.isSendableTodoistAction(action: String?): Boolean`：檢查動作是否為契約中的送出動作 (`sent`)。
- `com.accompany.pet.PetBridge.onTodoistAction(json: String)`：原生與懸浮窗 JavaScript 橋接介面（第 5 個 `@JavascriptInterface`），轉交主執行緒處理。
- `com.accompany.pet.OverlayService.showTodoist(json: String)`：將 Todoist 狀態或回應送至懸浮窗頁面 `window.pet.showTodoist`。
- `com.accompany.pet.OverlayService.onTodoistAction(json: String)`：處理來自懸浮窗的 Todoist 動作請求，轉發至 Worker API。
