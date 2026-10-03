# 驗收結果（M1 貴批次：角色需要時才出現）

## 成本匯總

| 階段 | 修正輪數 | 錯誤指紋 | 失敗過的驗收項 |
|---|---|---|---|
| T0b | 0 | 0 種 | 無 |
| T1 | 2 | 2 種：`fp-v02-spec-forbidden-words`、`fp-bash-syntax-eof`（皆為 verify.sh 自身問題） | V02 ×1 |
| T2 | 1 | 1 種：`fp-kts-unresolved-java-util` | V11 ×1（Gradle 腳本編譯失敗連帶） |
| T3 | 0 | 0 種 | 無 |
| T4 | 0 | 0 種 | 無 |
| **合計** | **3** | 3 種，無重複指紋，斷路器未觸發 | |

## 自動驗收（`./verify.sh --full`）

V01～V22 全部通過（V15 的突變測試範圍已擴為 `core/permission`＋`core/reminder`；V16 已加入 M1 的六個高風險名稱）。

- 規格測試：M0 10/10、M1 14/14 通過（計畫書寫 13 個，實為 14 列，見 DECISIONS.md 第 31 項）；規格爭議 0 項
- 凍結 commit：`4f9208aa29cd471cd64f499f1bbe86bc1db492d5`
- 突變測試：86 個突變殺死 80 個（93%），存活 6 個皆為等價突變，見 MUTATION-REPORT.md
- Lint：error 0、warning 16，見 SECURITY-REPORT.md

## APK

`app/build/outputs/apk/debug/app-debug.apk`（未設定 `firebase.properties` 的建置，推播停用，可用「測試推播」按鈕）

## 尚需人工完成

- 照 docs/FIREBASE-SETUP.md 建立 Firebase 專案並填 `firebase.properties`，重新建置
- 照 DEVICE-CHECKLIST-M1.md 手機實測
- 讀 RISK-REVIEW.md 的 M1 段落（9 個項目）
- 掃一遍 CHECKLIST.md 的 M1 段落
