# AccompanyPet M3R B 線 (懸浮窗網頁) 執行紀錄

## 進度

- B1: `todoist-view.js` 改寫與單元測試更新完成，`--lane B` 驗收通過。
- B2: `index.html` 按鈕、DOM (`#todoistActions`)、`showTodoist` 介面、按鈕互斥邏輯與測試檔連同載入順序完成，`--lane B` 驗收通過。

成本紀錄：
- 修正輪數：1 輪（處理測試檔 `overlay-todoist.test.js` 跨 realm 物件比較）
- 錯誤指紋清單：無
- 驗收項失敗次數：V27 失敗 1 次 (修正輔助測試斷言後全綠)

## 決策

- 遵守 A38 與 M3R-S19 安全規範，所有任務名稱與台詞均使用 `textContent` 渲染，全案無使用 `innerHTML`、`outerHTML` 或 `insertAdjacentHTML`。
- 按鈕互斥機制：`showTodoistButtons` 呼叫時會先執行 `clearDrinkButtons()` 與 `clearTodoistButtons()`；`showDrinkButtons` 呼叫時會先執行 `clearTodoistButtons()` 與 `clearDrinkButtons()`，確保懸浮窗同一時間只會呈現一組延伸動作按鈕。

## 阻擋

- 無。

## 需要整合處理

- 無。

## 高風險函式

- `showTodoist(jsonText)` (`app/src/main/assets/pet/index.html#L303`): 接收原生轉發之 Todoist JSON 字串，安全解析後調用 `say` 演出台詞並渲染按鈕。
- `PetTodoistView.viewFor(data, labels)` (`app/src/main/assets/pet/todoist-view.js#L15`): 純函式轉換畫面資料為按鈕結構與台詞。
