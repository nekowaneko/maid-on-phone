# M4.3 驗收報告（戒飲記錄開關）

## 成本匯總

| 階段 | 修正輪數 | 觸發過的錯誤指紋 |
|---|---|---|
| T0a | 0 | 0 種 |
| T0b | 0 | 0 種 |
| T1 | 0 | 0 種 |
| T2 | 0 | 0 種 |
| T3 | 0 | 0 種 |
| T4 | 0 | 0 種 |
| T5 | 0 | 0 種 |
| 合計 | 0 | 0 種 |

（T4 寫契約測試時遇到 CRLF 換行讓函式切段失效，是測試自己的問題，已在測試內修正；T5 第一次完整回歸停在 V70，是報告尚未產生，補齊後重跑。）

## 驗收項

- V01～V59（既有）：無退化；V08 仍恰好 6 個 `@JavascriptInterface`；M2-S12 仍通過。
- V60～V69：L1／L2 全部通過（T4 結束時 `./verify.sh` 全綠）。
- V70：RISK-REVIEW.md 的 M4.3 段落涵蓋 `handlers.js`、`DrinkSettingsActivity`、`OverlayService`；MUTATION-REPORT.md 的 M4.3 段落涵蓋 `backend/core/drink.js` 與 `drinkUiEnabled`、`workerErrorMessage`。最終結果見 `./verify.sh --full` 的重跑紀錄（PROGRESS.md 的 T5）。

## 規格範例對照（15 列）

| 編號 | 自動測試 | 手機實測 |
|---|---|---|
| M43-S01 | JS 規格同編號 | —（由 V05、V26 保證 M2 既有規格全綠） |
| M43-S02 | JS 規格同編號 | D01 |
| M43-S03 | JS 規格同編號 | D04 |
| M43-S04 | JS 規格同編號 | D03、D04 |
| M43-S05、S06 | JS 規格同編號 | D05 |
| M43-S07 | JS 規格同編號 | D03 |
| M43-S08 | JS 規格同編號（`controlsVisibility`）＋V65 | D02 |
| M43-S09 | JS 規格同編號 | D03 |
| M43-S10 | `M43SpecTest.kt`（`drinkUiEnabled`）＋V67 | D06 |
| M43-S11 | JS 規格同編號 | D08 |
| M43-S12 | JS 規格同編號＋V64 | D07 |
| M43-S13～S15 | JS 規格同編號 | —（僅自動測試） |

（D 編號與 S 編號的細部對應以 SPEC-MAP.md 的 M4.3 段落為準。）

## 其他

- 輔助與契約測試：`M43HelperTest.kt`（3 個）、`drink-enabled-core.test.js`（6 個）、`drink-enabled-wiring.test.js`（4 個）。
- 突變測試：98.3%（59/60），存活 1 個，建議規格列 M43-S16，詳見 MUTATION-REPORT.md。
- BLOCKERS：0 項；規格爭議：0 項。
- 未做：手機實測（D01～D08）、`npm audit`（無網路）。
