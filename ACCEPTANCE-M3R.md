# M3R 規格與成本驗收報告

交接與整合時間：2026-10-07
執行環境：Windows (Git Bash / Gradle / JBR 17)

## 1. 成本與執行統計

| 線別 | 執行時間 (估算) | 修正輪數 | 錯誤指紋 | Token 概況 / 回報狀態 | 驗收指令 | 驗收結果 |
|---|---|---|---|---|---|---|
| **D 線 (Worker)** | ~15 分鐘 | 1 輪 | 0 種 | 由第一階段完成、單線全綠回報 | `./verify.sh --lane D` | ✅ 全部通過 (441 個測試) |
| **C 線 (Kotlin)** | ~14 分鐘 | 1 輪 | 0 種 | Subagent `84350a55` 回報完成 | `./verify.sh --lane C` | ✅ 全部通過 (V11/V12) |
| **B 線 (懸浮窗網頁)**| ~8 分鐘 | 1 輪 | 0 種 | Subagent `af86caf2` 回報完成 | `./verify.sh --lane B` | ✅ 全部通過 (V27) |

---

## 2. M3R 19 列規格測試 (M3R-S01 ～ M3R-S19) 驗收結果

| 編號 | 情境與細節 | 負責線別 | 規格測試檔 | 驗收結果 |
|---|---|---|---|---|
| M3R-S01 | 09:00 排程：只提更新最久之 P2 任務（A）帶 todoist data | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S02 | P2 7 天間隔防重複推播與重試觸發 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S03 | P2 按「延後一週」：不寫 Todoist，寫入 snooze 記錄 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S04 | P2 按「今天推進一小步」：更新 Todoist 到期日為今日 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S05 | P2 按「拆成小步驟」：語言模型解析步驟與重試機制 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S06 | 按「幫我加成子任務」：建立 2~3 個子任務，不合格則拒絕 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S07 | 08:30 排程：P3 到期提醒優先於問日期 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S08 | P3 按「明天再提醒」：更新 Todoist 到期日為明日 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S09 | P3 無到期日任務：送出「問日期」推播 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S10 | P3 「問日期」按鈕選「明天/下週一/下個月/不知道」計算與寫入 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S11 | P3 「今天做」後 21:00 未完成發送追問（無按鈕），完成則不送 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S12 | 定時觸發防護與每日上限 2 次（追問不計） | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S13 | Todoist 500 / 網路錯誤 / 無 Token 降級處理 (回傳 failed) | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S14 | Todoist API Client 翻頁與 CRUD 格式驗證 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S15 | 語言模型提醒台詞無任務名稱降級備用台詞，長度截斷 200 字 | D | `backend/tests/spec/m3r/todoist.test.js` | ✅ PASS |
| M3R-S16 | App 端解析 `todoist` payload 安全檢查 (長度 ≤ 2048、JSON 格式) | C | `core/src/test/kotlin/.../M3RSpecTest.kt` | ✅ PASS |
| M3R-S17 | App 端動作白名單、taskIdPattern 與介面合規 | C | `core/src/test/kotlin/.../M3RSpecTest.kt` | ✅ PASS |
| M3R-S18 | 懸浮窗網頁 UI 按鈕顯示、順序、互斥與事件回傳 | B | `backend/tests/spec/m3r/overlay-todoist.test.js` | ✅ PASS |
| M3R-S19 | 任務名稱 HTML 轉義防護與安全性 (textContent 繪製) | B | `backend/tests/spec/m3r/overlay-todoist.test.js` | ✅ PASS |

---

## 3. 整合結果與全域驗收

1. **分支合併**：`m3r-lane-d` → `m3r-lane-c` → `m3r-lane-b` 依次 merge 至 `master`。
2. **全域擴充驗收 (`./verify.sh --full`)**：19/19 規格全綠，L1+L2 測試全綠，Stryker & Pitest 突變測試無退化。
