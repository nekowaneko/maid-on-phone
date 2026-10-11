# 交付後檢查清單

- [ ] 完成 DEVICE-CHECKLIST.md 全部項目
- [ ] 讀 RISK-REVIEW.md 列出的高風險函式
- [ ] 看 SECURITY-REPORT.md（Android Lint 結果）
- [ ] 看 MUTATION-REPORT.md
- [ ] 依賴套件稽核：在 Android Studio 執行 Build → Analyze APK 或 `./gradlew :app:dependencies`，確認沒有不認識的套件

## 貴批次追加

- [ ] **S12 備註**：DEVICE-CHECKLIST.md 的 S12 實測時，若泡泡顯示「目前無法使用麥克風，請打開 App 再試」，屬 Android 14+ 背景麥克風限制（見 BLOCKERS.md）。先在 App 內按「允許麥克風」再按「開始」重試。
- [ ] **S05 透明背景**：`frames/local/idle.png`、`blink.png` 是 RGB 無透明通道的圖，角色周圍會有底色；要測透明請改用含 alpha 的 PNG，或暫時移走 local 圖改用 placeholder SVG。
- [ ] `.jpg`／`.jfif` 角色圖不會被讀取（程式只讀 `frames/local/*.png`）。

## M0.5 自動恢復（docs/M0.5-RECOVERY-PLAN.md §4.1）

- [ ] R1 下拉通知欄加入「陪伴角色」磁磚，點一下角色出現、再點一下角色消失
- [x] R4 角色被收掉後，點磁磚可立即叫回

## M1

- [ ] 完成 docs/FIREBASE-SETUP.md，主畫面顯示推播代碼
- [ ] 讀 M1 的 RISK-REVIEW.md 新增項目
- [ ] 依賴套件稽核：Firebase Messaging 版本是否為最新穩定版（需要連網，自行查看）
- [ ] 自訂遊戲清單填入自己常玩、但系統沒標成遊戲的 App

## M1.5

- [ ] 完成 docs/WORKER-SETUP.md，Worker B 已部署
- [ ] 照 DEVICE-CHECKLIST-M1.5.md 實測
- [ ] 讀 M1.5 的 RISK-REVIEW.md 新增項目
- [ ] 依賴套件稽核：`backend/` 在 npm 上沒有依賴套件；wrangler 版本由 npx 取最新，自行留意
- [ ] 聊天畫面改以角色頭貼呈現表情：與 Claude 討論後另立計畫
- [ ] 聊天畫面在 App 內無法上傳背景圖（M1.5 不支援檔案選擇），需要換背景請用瀏覽器開 Worker B
- [ ] `app/build/intermediates` 下合併後的 Manifest 含 `android.permission.INTERNET`（聊天畫面靠 Firebase 套件合併進來的網路權限；原始碼 Manifest 仍不得宣告）
- [ ] V24 的規格爭議：決定是否移除 `backend/worker/llm-client.js` 的 Gemini 直連備援（見 BLOCKERS.md）
- [ ] 部署前把 `backend/wrangler.toml` 的 `database_id` 換成 `pet-maid-db` 的編號（不得填 accompany_bot 的）
- [ ] 突變報告中存活的等價突變（MUTATION-REPORT.md M1.5 段落）看一眼是否同意判斷

## M1.6

- [ ] 照 DEVICE-CHECKLIST-M1.6.md 實測
- [ ] 讀 RISK-REVIEW.md 的 M1.6 段落
- [ ] 聊天網頁換成白髮女僕：另立一案（聊天網頁的換裝功能用的是黑髮角色的分層圖，換角色會牽動換裝）
- [ ] 在聊天網頁換角色之前，聊天時 LLM 不會用到 `pout`、`shy`；懸浮窗的推播可以用
- [ ] `shy.png` 若嬌的感覺不夠，用 Nano Banana 重生 `pet-art-original/face-shy.jpg` 後重跑 `python tools/make_expression_frames.py ../pet-art-original`
- [ ] 關螢幕期間才收到的提醒，畫面恢復後是接著演（B 線決定）；若覺得應該直接跳到演完，告訴 Claude 另外調整
- [ ] `tools/send_push.py --script` 時記得同時給 `--text`（純文字），否則通知欄會顯示預設句
- [ ] App 圖示只在 debug 建置是 pout 臉；pout 表情圖更新後重跑 `python tools/make_app_icon.py` 再建置（想調整大小改 `VISIBLE_RADIUS`）

## M2

- [ ] 主倉庫的 `worker.properties` 填 `apiSecret`（值和 `APP_SECRET` 相同；**開 worktree 之前就要填**，準備腳本不會覆蓋已存在的檔案）
- [ ] 套用新 schema（在 `backend/` 執行）：`npx wrangler d1 execute pet-maid-db --remote --file worker/schema.sql`
- [ ] `npx wrangler deploy`（每小時的排程觸發會一起生效）；密鑰相關一律用 Git Bash 或 cmd，不要用 PowerShell 5.1 的管線
- [ ] 照 DEVICE-CHECKLIST-M2.md 實測
- [ ] 讀 RISK-REVIEW.md 的 M2 段落（`apiSecret` 編進 APK 的風險）
- [ ] 讀 MUTATION-REPORT.md 的 M2 範圍（`backend/core/drink.js`、`core/drink`）
- [ ] 要把資料搬去戒飲存時：先在戒飲存匯出備份，再匯入 `/api/drink/export` 下載的檔案（戒飲存匯入會整份取代）


## M4

- ✅ 重新部署 Worker，並對 D1 重跑 `worker/schema.sql`（M4 新增三張表，指令見 docs/WORKER-SETUP.md 第 9 節）。（2026-10-10 已部署：Worker 版本 a3edac81，D1 已有 ma_watch、ma_close、ma_result 三張表）
- □ 第一次使用：在追蹤清單頁加入想追蹤的標的（上限 10 檔）。
- □ 讀 `RISK-REVIEW.md` 中 M4 新增的高風險函式。
- ✅ 看 `MUTATION-REPORT.md` 的 M4 範圍（`backend/core/ma.js`）與建議新增的規格範例。（M4-S18～S22 已採用）
- □ 看 `SECURITY-REPORT.md` 與依賴套件稽核結果（需連網，代理人不做）。
- □ 跑 `DEVICE-CHECKLIST-M4.md` 的手機實測。
- □ 開場台詞的語感、說明比喻是否好懂（使用者本人判斷）。

## M4.1

- □ 手機實測 DEVICE-CHECKLIST-M4.1.md（D01～D15），特別是 D08（明細頁「‹」關閉）
- □ 確認主畫面兩張卡片在你的手機上好不好點、好不好讀（螢幕寬度、字體大小）
- □ 聊聊卡片副標目前是固定句；若想顯示女僕最後一句話，需要另立功能（見 design/prototype/later.md）
- □ 讀 RISK-REVIEW.md 裡 MaActivity.kt 與 MainActivity.kt 的 M4.1 新增項目
- □ 看 MUTATION-REPORT.md 的 M4.1 範圍結果（或待補狀態）

## M4.2

- □ 手機實測 DEVICE-CHECKLIST-M4.2.md（D01～D16），特別是 D07（畫質）與 D11（關閉聊天）
- □ 重新部署 Worker B（新的表情圖在 backend/assets/character/frames/，不進 git，部署時才會一起上傳）
- □ 表情圖會被部署成公開的靜態檔案（與原本的 png 圖層相同的處境），確認你能接受
- □ 聊天頁的語言模型現在看得到 `[pout]`、`[shy]` 兩個標籤，聊幾輪確認語氣沒有被帶偏
- □ App 端名稱（快速設定磚「🐾 陪伴角色」等）是否也要改成「手機女僕」：見 design/prototype/later.md
- □ 讀 RISK-REVIEW.md 裡 ChatActivity.kt 與 call.js 的 M4.2 新增項目
- □ 看 MUTATION-REPORT.md 的 M4.2 範圍結果（或待補狀態）（已執行，約 92%，建議新增規格 M42-S16～S19 待你確認）
- □ 預覽框位置（D08）：背景圖裁切預覽依 `#dialog`、`#composer`、角色圖畫框，視訊版版面下角色圖放大成 118% 寬，預覽的框位置可能與實際略有出入；`background.js` 依規定不改，請在手機上確認預覽仍可用
- □ 開場話：視訊版接通時目前沒有自動的開場話（現有聊天頁本來就沒有，見 DECISIONS.md 70），需要的話另立功能

## M4.3

□ 實測 DEVICE-CHECKLIST-M4.3.md 的 D01～D08（需要手機）
□ 重新部署 Worker B：`cd backend && npx wrangler deploy -c wrangler.local.toml`；D1 資料表沒有變動
□ 重新安裝 App
□ 讀 RISK-REVIEW.md 的 M4.3 段落
□ 看 MUTATION-REPORT.md 的 M4.3 段落（或「待補」的處理方式）
□ 看 SECURITY-REPORT.md 與 `npm audit` 結果（需要網路）
□ 確認 `docs/AGENT-SETUP.md` 與 README 提到的「啟用戒飲記錄」說明和實際畫面一致
□ 確認 MUTATION-REPORT.md 的 M4.3 建議新增規格列 M43-S16（防重複詢問）是否要納入下一版規格
□ `npm audit` 需要連網，這次沒有執行；有網路時在暫存資料夾補跑

## M4.4

□ 實測 DEVICE-CHECKLIST-M4.4.md 的 D01～D10（需要手機）
□ 重新安裝 App（這次不改 Worker，不用重新部署）
□ 讀 RISK-REVIEW.md 的 M4.4 段落
□ 看 MUTATION-REPORT.md 的 M4.4 段落（或「待補」的處理方式）
□ 看 SECURITY-REPORT.md 與 `npm audit` 結果（需要網路）
□ 對照線上原型確認新畫面的配色與原型一致，不一致處寫進 design/prototype/later.md
