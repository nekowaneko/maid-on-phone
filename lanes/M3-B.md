# M3 B 線紀錄檔（懸浮窗網頁 UI / 泡泡選單）

## 進度
- 階段 1：`app/src/main/assets/pet/todoist-view.js` 純函式泡泡選單產生邏輯實作完成
- 階段 2：`app/src/main/assets/pet/index.html` 引入 `todoist-view.js`
- 階段 3：`backend/tests/overlay-todoist.test.js` 單元測試全綠（3 項測試）
- 修正輪數：0
- 錯誤指紋：無
- 驗收項失敗次數：0

## 決策
- 遵守架構約束：泡泡選單採純函式設計，不直接變更全域物件，外部標籤交由原生活動以 textContent 安全轉義。
- P2 包含「今天推進一小步」、「延後一週」、「拆成小步驟」；P3 包含「今天做」、「明天再提醒」。

## 阻擋
無

## 需要整合處理
無

## 高風險函式
- `PetTodoistView.viewForSplit`：產生確認拆解子任務之結構。
