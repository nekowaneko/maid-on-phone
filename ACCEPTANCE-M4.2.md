# M4.2 規格與驗收報告（聊天頁視訊版）

整合時間：2026-10-11
執行環境：Windows（Git Bash、Gradle、JBR 17、Node.js 22）

## 1. 成本摘要

| 階段 | 內容 | 修正輪數 | 錯誤指紋 | 各驗收項失敗次數 |
|---|---|---|---|---|
| T0 | 確認便宜批次產出、規格測試轉寫並凍結、verify.sh 加 V47～V58 | 0 | 無 | 全部 0 |
| T1 | `call-state.js`、`blink.js`、`emotion-map.json`、`Chat.kt` | 0 | 無 | 全部 0 |
| T2 | 網頁視訊版、`call.js`、W-A 契約測試、刪除換裝檔 | 0 | 無 | 全部 0 |
| T3 | `ChatActivity.kt` 攔截關閉網址 | 0 | 無 | 全部 0 |
| T4 | `check-dom-ids.mjs`、V59、接線確認 | 0 | 無 | 全部 0 |
| T5 | 完整驗收、突變測試、報告 | 0 | 無 | 全部 0 |

合計修正輪數：0。

## 2. 驗收結果

- `./verify.sh --full`（L1＋L2＋L3）全綠：V01～V59 全部通過（共 59 個 ✅），包含 V13 assembleDebug、V14 Lint、V15 突變報告、V16、V46、V58、V17。
- 既有驗收 V01～V46 完整回歸，無退化；`@JavascriptInterface` 仍恰好 6 個（V08）。
- backend 測試通過 590 個、失敗 0（V26 下限由 511 填為實際值 590）。
- Kotlin：`:core:test` 全綠，規格測試 49 個（M0～M4.1 共 48 個＋M42-S09）。

## 3. 規格測試

| 項目 | 結果 |
|---|---|
| 自動 14/14 | JS 13（S01～S05、S07～S13、S15）＋Kotlin 1（S09）全部通過 |
| 手機實測 | S06、S14 待使用者（DEVICE-CHECKLIST-M4.2.md：S06＝D04，S14＝D06） |
| 規格爭議 | 0 項 |
| 規格目錄 | 凍結後未動（V04 通過） |

## 4. 突變與安全

- 突變測試：`call-state.js` 約 91.9%、`blink.js` 約 93.1%、`isChatExitUrl` 100%；存活 12 個（2 個等價、10 個未涵蓋），整理成 4 列建議新增的規格範例（M42-S16～S19，未納入凍結）。詳見 MUTATION-REPORT.md 的 M4.2 段落。
- 安全：高嚴重度 0；`npm audit` 0 個漏洞（無任何依賴）。詳見 SECURITY-REPORT.md。
- 高風險項目：RISK-REVIEW.md 的 M4.2 段落共 5 項（#70～#74）。

## 5. 接線確認（T4）

- `companion:send`、`companion:reply-start`、`companion:reply-failed` 兩端名稱相同。
- `renderer.blink` 由 `call.js` 在通話中呼叫；`zOrder` 只剩 `face` 時 `createRenderer` 可建立。
- `chat-exit://close` 在 `call.json`、`Chat.kt`、`call-state.js` 相同；`call.js` 導向它、`ChatActivity` 以 `isChatExitUrl` 攔截。
- `check-dom-ids.mjs` 零缺漏，且負向測試（少一個 id）確實失敗（V59）。

## 6. 限制

畫面實際行為（D01～D16，特別是 D07 畫質與 D11 關閉聊天）無法在無手機環境自動驗證，需使用者手機實測。
