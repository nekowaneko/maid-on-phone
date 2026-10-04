# 阻塞項目

斷路器觸發或規格爭議的項目。
- docs/SPEC.md 不存在，ARCHITECTURE.md 依 CHEAP-PLAN §3.7 描述撰寫（專案根目錄有 wish28-pet-spec.md，疑為原始規格，未採用）。

## 貴批次

- **S12 從懸浮窗啟動麥克風（Android 14+ 背景限制）**：依預設值表，辨識失敗或被系統拒絕時泡泡顯示「目前無法使用麥克風，請打開 App 再試」，未嘗試繞過。前景服務在已授權麥克風時才宣告 `microphone` 類型，實際能否從懸浮窗收音需手機實測（見 CHECKLIST.md 的 S12 備註）。非斷路器觸發，無錯誤指紋。
- ✅ 已解決（2026-10-03）：規格書確定為 `docs/wish28-pet-spec.md`，各文件的 `docs/SPEC.md` 引用已改為此路徑。
- **M0.5 定時巡邏在 vivo 上無效**（2026-10-03 實測，V2503／Android 16）：vivo 凍結 App 時，會把該 App 的鬧鐘一起移除（`dumpsys alarm` 的移除紀錄原因為 `frozen`），所以 App 被收掉後巡邏鬧鐘不會響。用 adb 直接結束程序（沒有經過凍結）時，巡邏有正常叫回角色。vivo 上只能靠快速設定磚手動叫回；巡邏機制保留給其他廠牌。非斷路器觸發。

## M1.5 貴批次

- **規格爭議：V24／A18「googleapis.com 只能出現在 fcm-client.js」**（非斷路器觸發）：複製來的 `backend/worker/llm-client.js` 第 9 行原本就有 `const API_ORIGIN = 'https://generativelanguage.googleapis.com'`（沒設 `LLM_RELAY_ORIGIN` 時直連 Gemini 的備援）。這支檔案不在 §1 的修改範圍，改掉會改變 accompany_bot 原有行為；拆字串閃避檢查則等於改弱驗收。處理方式：V24 照原條件檢查，只豁免這一行的**完整原文**（任何新增的 googleapis 網址或該行被改動都會失敗）。請使用者決定：(a) 保留現狀；或 (b) 另立計畫移除直連備援，強制走轉送服務（`wrangler.toml` 已設定 `LLM_RELAY_ORIGIN`，部署環境本來就走轉送），之後拿掉豁免。

## M1.6 貴批次

- ✅ 已解決（2026-10-04）：B 線斷路器停在 V28（指紋 `5e3838ab558d`）。根因是 `verify.sh` 第 118 行 sed 的替換字串被寫成 0x01 位元組而不是 `\1`，只要角色頁載入任何 script 就一定失敗。B 線依契約沒有修改 verify.sh，以暫存副本佐證修正後全綠；規劃者整合時修正（`80f0d9d`）。
