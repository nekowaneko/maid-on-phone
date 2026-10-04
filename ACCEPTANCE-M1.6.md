# M1.6 驗收結果（懸浮窗表情演出）

## 成本匯總

本案第一次以三條線平行開工（B 角色頁、C Kotlin、D Worker），各在自己的 git worktree 執行，最後由規劃者合併。

| 線 | 修正輪數 | 錯誤指紋 | 備註 |
|---|---|---|---|
| B 角色頁 | 0 | 1 種（`5e3838ab558d`，V28） | 卡在 verify.sh 本身的缺陷，依斷路器停下並回報；程式本身第一次就正確 |
| C Kotlin | 1 | 1 種（`2db8780e1929`） | 寫檔時換行跳脫錯誤，第二次通過 |
| D Worker | 0 | 0 | 第一次就全綠 |
| 整合 | 0 | — | 修 verify.sh 一行；三次合併無衝突；`--full` 第一次停在 V16（報告尚未寫，屬整合工作），補齊後全綠 |

合計修正輪數：1（不含規劃者自己的 verify.sh 缺陷）。

## 自動驗收

`./verify.sh --full`：V01～V28 全部通過。

- 規格測試：Kotlin M0 10／10、M1 14／14、M1.5 4／4、M1.6 6／6；JS M1.5 9／9、M1.6 8／8；規格爭議 0 項
- backend 測試共 346 個全過（含 accompany_bot 原有測試）；core 測試全過
- 突變測試：`core/reminder` 與 `backend/core/push.js` 只有既有的等價突變存活，見 MUTATION-REPORT.md M1.6 段落

## 規格範例表對照

| 編號 | 驗證 | 結果 |
|---|---|---|
| M16-S01、S02 | 自動（JS） | 通過 |
| M16-S03～S08 | 自動（Kotlin） | 通過（S03、S07 另需手機） |
| M16-S09 | 手機 | 待實測（DEVICE-CHECKLIST-M1.6.md A 節） |
| M16-S10～S15 | 自動（JS） | 通過（S10、S12～S14 另需手機） |

## 產出

- APK：`app/build/outputs/apk/debug/app-debug.apk`
- 角色頁：`app/src/main/assets/pet/`（`emotion-map.js`、`vendor/stream-parser.js`、`performance.js`、`index.html`）
- 同步腳本：`tools/sync-overlay-vendor.mjs`（backend 的 stream-parser 改了以後重跑它）

## 需要使用者完成的事

1. 重新部署 Worker B（`backend/` 有改動），照 docs/WORKER-SETUP.md 第 4 節
2. 把 APK 裝到手機，照 DEVICE-CHECKLIST-M1.6.md 實測
3. 讀 RISK-REVIEW.md 的 M1.6 段落（第 26～37 項）
4. 掃一遍 CHECKLIST.md 的 M1.6 段落
