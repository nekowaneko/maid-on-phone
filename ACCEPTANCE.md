# 驗收結果（M0 貴批次）

## 成本匯總

| 階段 | 修正輪數 | 錯誤指紋 | 失敗過的驗收項 |
|---|---|---|---|
| T0b＋T1 | 2 | 1 種：`fp-pitest-reporting-basedir` | 無（另修正 verify.sh 自身 V06 的回傳碼誤判） |
| T2 | 2 | 2 種：`fp-v06-decisions-pattern`、`fp-unresolved-servicecompat-startforeground` | V06 ×1、V12 ×1 |
| T3 | 0 | 0 種 | 無 |
| T4 | 0 | 0 種 | 無（Pitest 的 `targetTests` 調整屬設定，非失敗） |
| **合計** | **4** | 3 種，無重複指紋，斷路器未觸發 | |

## 自動驗收（`./verify.sh --full`）

V01～V17 全部通過。

| # | 結果 | # | 結果 | # | 結果 |
|---|---|---|---|---|---|
| V01 | ✅ | V07 | ✅ | V13 | ✅ |
| V02 | ✅ | V08 | ✅ | V14 | ✅ |
| V03 | ✅ | V09 | ✅ | V15 | ✅ |
| V04 | ✅ | V10 | ✅ | V16 | ✅ |
| V05 | ✅ | V11 | ✅ | V17 | ✅ |
| V06 | ✅ | V12 | ✅ | | |

- 規格測試：10/10 通過；規格爭議 0 項
- 凍結 commit：`9f5111379052d49416ab4233dc27142c407863cc`
- 突變測試：範圍 `core/permission`，分數 100%（1/1），見 MUTATION-REPORT.md
- Lint：error 0、warning 16，見 SECURITY-REPORT.md

## APK

`app/build/outputs/apk/debug/app-debug.apk`

## 尚需手機實測

見 DEVICE-CHECKLIST.md（S04～S06、S11、S12、8 小時耗電等）與 CHECKLIST.md 的貴批次追加項。
