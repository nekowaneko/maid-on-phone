# M4.4 驗收報告（戒飲設定頁重做）

## 成本匯總

| 階段 | 修正輪數 | 觸發過的錯誤指紋 |
|---|---|---|
| T0a | 0 | 0 種 |
| T0b | 0 | 0 種 |
| T1 | 0 | 0 種 |
| T2 | 0 | 0 種 |
| T3 | 0 | 0 種 |
| T4 | 3 | 3 種 |
| T5 | 1 | 1 種（V79 缺 ACCEPTANCE-M4.4.md，報告尚未產生） |
| 合計 | 4 | 4 種 |

T4 的三種指紋（細節見 PROGRESS.md）：
1. `fp-m44-s11-regex`：凍結規格測試 S11 的正規表示式跳脫被 shell heredoc 吃掉，改以 Edit 補正後重新凍結（commit `e83ed45`），期望值未動，記錄於 DECISIONS.md。
2. `fp-v74-existing-layouts`：V74 誤把主畫面既有 layout 的色碼算進去，改為「色碼數不得比基準多」。
3. `fp-verify-backspace`：修 V74 時把 `\b` 寫成退格字元，補正後通過。

## 驗收項

- V01～V70（既有）：無退化；V08 仍恰好 6 個 `@JavascriptInterface`；M4.3 的 V66、`drink-enabled-wiring.test.js` 仍通過。
- V04、V05：規格測試與凍結版本（`e83ed45`）相同；Kotlin 規格測試 59 個（M44 九個），JS 規格含 M44-S10、S11。
- V71～V78：L1／L2 全部通過。V26 backend 通過 621 個（614＋規格 2＋W-A 5）。
- V79：RISK-REVIEW.md 的 M4.4 段落涵蓋 `DrinkSettingsActivity`、`SettingsError`；MUTATION-REPORT.md 的 M4.4 段落涵蓋 `settingsFieldOf`（8 個突變殺死 7 個，存活 1 個為編譯器產生的 null 檢查，等價突變）。最終結果見 `./verify.sh --full` 的重跑紀錄。

## 規格範例對照（12 列）

| 編號 | 自動測試 | 手機實測 |
|---|---|---|
| M44-S01 | M44SpecTest.kt 同編號 | D03 |
| M44-S02 | M44SpecTest.kt 同編號 | D06 |
| M44-S03 | M44SpecTest.kt 同編號 | — |
| M44-S04 | M44SpecTest.kt 同編號 | — |
| M44-S05 | M44SpecTest.kt 同編號 | — |
| M44-S06 | M44SpecTest.kt 同編號 | — |
| M44-S07 | M44SpecTest.kt 同編號 | — |
| M44-S08 | M44SpecTest.kt 同編號（不回滾由 M4.3 W-A 驗證） | — |
| M44-S09 | M44SpecTest.kt 同編號；清除動作見 W-A② | D04 |
| M44-S10 | drink-settings-ui.test.js 同編號 | — |
| M44-S11 | drink-settings-ui.test.js 同編號 | D01 |
| M44-S12 | V77（git diff 比對基準 commit） | D10 |

## 已知限制

- 畫面外觀（與原型一致、骨架動畫、紅框、窄螢幕與最大字體、對比度）沒有 Android 自動化環境可驗，只確認接線與資源齊全，其餘由使用者依 DEVICE-CHECKLIST-M4.4.md（D01～D10）實測。
- 沒有網路，`npm audit` 未執行，已列入 CHECKLIST.md。
