# M4 規格與成本驗收報告（盤前均線 F3）

整合時間：2026-10-10
執行環境：Windows（Git Bash、Gradle、JBR 17）

## 1. 成本與執行統計

三條線是在規劃者尚未凍結規格測試、未開 worktree 的情況下被提早啟動的（D、C 線直接在主工作目錄切分支工作，C 的分支疊在 D 之上），所以各線的「驗收」是整合時用凍結版本補跑的。

| 線別 | 自己回報的修正輪數 | 整合時補跑結果 | 規劃者在整合階段處理的問題 |
|---|---|---|---|
| D 線（Worker） | 0 | `--lane D` 通過（489 個測試，15 個規格全過） | M4-S11：重複代號的訊息漏了股票名稱（已修，並同步輔助測試） |
| C 線（Kotlin） | 0（1 次指紋為 V06 阻擋） | `--lane C` 通過（V11、V12） | V07 需排除 `MaActivity.kt` |
| B 線（前端） | 2 | `--lane B` 通過 | script 載入順序與已凍結的 M3R-S19 衝突（改規格與 `index.html`）；輔助測試的 script 數與按鈕數需同步 |

整合階段規劃者修正輪數：6 項（V06 文字誤判、V36 誤判、V07 排除、D 的 S11、M4 規格載入順序、B 的輔助測試）。

## 2. 驗收結果

- `./verify.sh --full`：L1＋L2＋L3 全部通過（V01～V36 與 V13～V17 等），backend 測試 551 個通過。
- 規格測試：M4 共 18 個（Worker 15、前端 2、Kotlin 1）全部通過；規格爭議 0 項。
- 接線：`ma-pipeline.test.js`（D）與 `ma-wiring.test.js`（規劃者）通過；八種排列都從真實排程走到泡泡檢視與明細網頁渲染函式。
- 既有驗收無退化（M0～M3R 規格測試全部仍通過）。

## 3. 規格修訂紀錄

- M4-S15B 的 script 載入順序從「在 `todoist-view.js` 之後」改為「在 `drink-labels.js` 之前」，原因是 M3R-S19 已凍結要求最後三支是 drink-view、todoist-labels、todoist-view。FROZEN_HASH 改為 `0e1e3fe`。

## 4. 突變測試

範圍 `backend/core/ma.js`：237 個突變、殺死 189 個、分數約 79.7%；細節與建議新增的規格範例列見 MUTATION-REPORT.md「M4」段落。Pitest 的 Kotlin 範圍 `core.ma` 殺死 225／252（89%）。

## 5. 需要使用者處理

1. 部署 Worker、重跑 D1 建表（docs/WORKER-SETUP.md 第 9 節）。
2. 手機實測：DEVICE-CHECKLIST-M4.md 共 15 項。
3. 決定是否採用 MUTATION-REPORT.md 建議的 M4-S18～S22。
4. 單檔取得失敗的卡片（標籤「沒拿到」）原型沒畫，依 `design/prototype/screens.md` 實作，實機看過再決定要不要補原型。

## 6. 追加：M4-S18～S22 與部署（2026-10-10）

- 使用者採用 MUTATION-REPORT.md 建議的 M4-S18～S22，新增 `backend/tests/spec/m4/ma-edge.test.js` 並重新凍結（`ec20954`）；`verify.sh` 的 `FROZEN_HASH`、V05、V26 下限已更新。
- 五列中只有 M4-S21 需要改程式：收盤價含非數字時，`averageLast` 回傳 null、`computeStock` 整檔算資料不足（原本會算出 NaN）。其餘四列原實作就符合。
- `./verify.sh --full` 重跑全綠（backend 556 個測試）。
- 部署：已對遠端 D1 `pet-maid-db` 套用 `worker/schema.sql`（新增三張表 `ma_watch`、`ma_close`、`ma_result`），並 `wrangler deploy` 部署 `pet-maid-api`（版本 `a3edac81-ffb2-4073-897f-79948ffd7244`，排程 `0 * * * *`、`30 0 * * *`）。
- 部署後檢查：`/config/ma-glossary.json` 與 `/web/ma`（`/web/ma.html` 會 307 轉到 `/web/ma`，與聊天頁相同行為）回 200，`/api/ma/report` 無密鑰回 401。尚未用真實密鑰與證交所資料實測，那一步屬於手機實測。
