# M3 C 線紀錄檔（Kotlin / Android Notifications & WorkerApi）

## 進度
- 階段 1：`core/src/main/kotlin/com/accompany/pet/core/todoist/TodoistModels.kt` 領域模型與單元測試完成
- 階段 2：`app/src/main/java/com/accompany/pet/todoist/TodoistActionHandler.kt` 連接 `WorkerApi.post` 實作完成
- 階段 3：`:core:test` 與 `:app:compileDebugKotlin` 驗證通過
- 修正輪數：0
- 錯誤指紋：無
- 驗收項失敗次數：0

## 決策
- 遵守 A12 架構約束：所有連網操作集中透過 `WorkerApi` 執行，不在其它地方發出網路連線。
- 動作代碼包含 `snooze`、`do_today`、`split`、`ask_date` 4 種標準動作。

## 阻擋
無

## 需要整合處理
無

## 高風險函式
- `TodoistActionHandler.sendAction`：呼叫外部 WorkerApi 連線。
