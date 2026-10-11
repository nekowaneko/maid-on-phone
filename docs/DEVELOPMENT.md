# 開發者說明

## 專案結構

- `app/`：Android 殼，負責服務、視窗、權限、推播接收。
- `core/`：不依賴 Android 的純 Kotlin 邏輯與規格測試。
- `backend/`：Cloudflare Worker、聊天網頁、設定檔與 JS 測試。
- `docs/`：設定教學、架構、各里程碑計畫書。

App 只有 `WorkerApi.kt` 可以連外；網頁呼叫原生的介面（`@JavascriptInterface`）固定 6 個，由驗收腳本檢查。

## 測試與驗收

```
./verify.sh          # 靜態檢查與單元測試（L1＋L2）
./verify.sh --full   # 加上 assembleDebug、Lint、突變測試（L3）
```

- 規格測試目錄凍結後不得修改，由 `verify.sh` 以 commit 雜湊檢查。
- 各里程碑的驗收結果在根目錄 `ACCEPTANCE-*.md`，需要手機實測的項目在 `DEVICE-CHECKLIST-*.md`。
- 突變測試與安全審查報告見 `MUTATION-REPORT.md`、`SECURITY-REPORT.md`、`RISK-REVIEW.md`。

## 開發方式

本專案由 AI 代理人依計畫書分階段實作，並以自動化驗收腳本把關，流程記錄在 `PROGRESS.md`、`DECISIONS.md`。第一次平行分派多個代理人的經驗見 `docs/PARALLEL-AGENTS.md`。

## 部署後端（作者本人的流程）

`backend/wrangler.toml` 進 git，裡面的 D1 `database_id` 是佔位符 `REPLACE_WITH_YOUR_D1_DATABASE_ID`，中繼站網址是註解。作者實際使用的值放在 `backend/wrangler.local.toml`（已加入 `.gitignore`，也被 `backend/.assetsignore` 的 `*.toml` 擋住，不會上傳成公開靜態檔）。

作者部署時要指定這份設定：

```bash
cd backend
npx wrangler deploy -c wrangler.local.toml
npx wrangler d1 execute pet-maid-db --remote --file worker/schema.sql -c wrangler.local.toml
```

- 直接執行 `npx wrangler deploy` 會使用佔位符，部署會失敗或連到錯的資料庫。
- 修改 `wrangler.toml` 的排程或變數時，要手動同步到 `wrangler.local.toml`，兩份不會自動同步。
- 其他人 clone 後不需要 `wrangler.local.toml`：直接把自己的 id 填進 `wrangler.toml`，步驟見 [AGENT-SETUP.md](AGENT-SETUP.md)。

## 已知阻塞項目

見根目錄 `BLOCKERS.md`。
