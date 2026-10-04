# 驗收結果（M1.5 貴批次：Worker B 送推播、泡泡「聊聊」）

## 成本匯總

| 階段 | 修正輪數 | 錯誤指紋 | 失敗過的驗收項 |
|---|---|---|---|
| T0b | 0 | 0 種 | 無 |
| T1 | 1 | 1 種：`fp-b41341f6f5fc`（M15-S13 找不到「聊聊」按鈕，按鈕提前到 T1） | V11 ×1 |
| T2 | 0 | 0 種 | 無 |
| T3 | 0 | 0 種 | 無 |
| T4 | 0 | 0 種（`./verify.sh --full` 一次全綠） | 無 |
| **合計** | **1** | 1 種，無重複指紋，斷路器未觸發 | |

T4 另外為了殺突變補了 4 個輔助測試、簡化 `push.js` 的 `parseAccount`；這些是在跑 `--full` 之前根據突變報告做的，不是驗收失敗後的修正。

## 自動驗收（`./verify.sh --full`）

V01～V26 全部通過。

- 規格測試：Kotlin M0 10/10、M1 14/14、M1.5 4/4；JS M1.5 9/9；accompany_bot 原有測試 269/269（backend 合計 306 個通過，含輔助測試）
- 凍結 commit：`c119cfe56128d03e00dc983d6c8f7b484f2df8df`
- 規格爭議：1 項（V24／A18：`llm-client.js` 原有的 Gemini 直連網址，只豁免那一行原文，見 BLOCKERS.md）
- 突變測試：Pitest 141 個殺死 124 個（88%），未殺死的都是等價突變或編譯器產生的程式碼；Stryker 71 個殺死 70 個（98.59%），存活 1 個為等價突變。見 MUTATION-REPORT.md
- Lint：error 0、warning 16（與 M1 相同）

## APK

`app/build/outputs/apk/debug/app-debug.apk`（本機沒有 `worker.properties`，「聊聊」會顯示未設定；本機有 `firebase.properties`，推播照 M1 設定）

## 尚需人工完成

1. 照 docs/WORKER-SETUP.md 部署 Worker B（含填入 `database_id`、設定 `FCM_SERVICE_ACCOUNT`、`FCM_DEVICE_TOKEN` 等密鑰），並填 `worker.properties` 後重新建置
2. 照 DEVICE-CHECKLIST-M1.5.md 實測
3. 讀 RISK-REVIEW.md 的 M1.5 段落（8 個項目）
4. 看 MUTATION-REPORT.md（範圍 core/permission、core/reminder、core/chat、backend/core/push.js）
5. 掃一遍 CHECKLIST.md 的 M1.5 段落，並決定 V24 規格爭議的處理方式
