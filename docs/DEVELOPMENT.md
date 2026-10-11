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

## 已知阻塞項目

見根目錄 `BLOCKERS.md`。
