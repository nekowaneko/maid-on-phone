# M4.1 規格與驗收報告（主畫面均線與聊聊入口、明細頁關閉）

整合時間：2026-10-10
執行環境：Windows（Git Bash、Gradle、JBR 17、Node.js 22）

## 1. 成本與執行統計

本批次為 M4.1 貴批次，從 T0 至 T5 全自主串接完成。

| 階段 | 內容 | 修正輪數 | 錯誤指紋 | 各驗收項失敗次數 |
|---|---|---|---|---|
| T0a | 確認便宜批次 10 個產出檔案非空與 exitUrl | 0 | 無 | 全部 0 |
| T0b | 規格測試轉寫並凍結（10 個 Kotlin、2 個 JS） | 0 | 無 | 全部 0 |
| T1 | Core 實作純函式與模型常數 | 0 | 無 | 全部 0 |
| T2 | 網頁與 W-A 契約實作 | 0 | 無 | 全部 0 |
| T3 | App 原生端主畫面卡片與關閉攔截實作 | 1 | `fp-v12-mafetch-signature` | V12 ×1（修正 MainActivity.kt 參數簽名後通過） |
| T4 | 接線與整合驗收 | 0 | 無 | 全部 0 |
| T5 | 完整驗收與報告 | 0 | 無 | 全部 0 |

合計修正輪數：1 輪。

## 2. 驗收結果

- `./verify.sh --full`：L1 結構與安全檢查（33 項）、L2 單元測試與編譯（7 項）、L3 突變測試全數通過。
- 後端測試通過 561 個（含 2 個 JS 規格測試與 3 個 W-A 契約測試）。
- Kotlin 規格測試通過 48 個（M0～M4 38 個＋M4.1 10 個）。
- 既有驗收無退化：M0～M4 規格測試與各項安全檢查持續全部通過。

## 3. 接線三要件確認

1. **主畫面自動更新**：`MainActivity.onResume()` 在 `refreshUi()` 之後呼叫 `refreshMaEntry()`，回到主畫面自動向 `/api/ma/report` 取得最新狀態並更新副標。
2. **入口卡片點擊導航**：點擊 `cardMaEntry` 正確透過 `startActivity(Intent(this, MaActivity::class.java))` 開啟明細頁，且不含 `FLAG_ACTIVITY_NEW_TASK` 與 `finish()`；點擊 `cardChatEntry` 在已設定網址時開啟聊天頁，未設定時更新提示。
3. **明細頁關閉機制一致**：明細頁頂部返回按鈕「‹」透過 `decideBack` 導向 `MA_EXIT_URL = "ma-exit://close"`，`MaActivity` 的 `shouldOverrideUrlLoading` 精確攔截 `isMaExitUrl` 並呼叫 `finish()` 結束畫面回到主畫面；契約、前端、Android 原生端三處完全一致。

## 4. 架構約束與安全審查

- A44：`MaActivity` 仍為未導出畫面（`exported="false"`），僅同源頁面與資源放行，子資源非同源回 403。
- A48：主畫面僅由 `WorkerApi.get(MA_REPORT_PATH)` 取得摘要，不呼叫未授權路徑。
- A49 / A53：無靜默降級，副標均由 Core 純函式與常數定義提供，無寫死文字。
- A50 / A51：明細頁關閉完全依賴 URL 攔截，不新增任何 `@JavascriptInterface`。
- A52：主畫面「聊聊」入口卡片安全導航。
