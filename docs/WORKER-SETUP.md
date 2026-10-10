# Worker B 部署（使用者操作，約 20 分鐘）

> Worker B 是 accompany_bot 的獨立副本，提供聊天網頁與送推播。代理人不代為部署。
> 指令都在 `backend/` 資料夾執行（PowerShell）。第一次會要求登入 Cloudflare，用 accompany_bot 所在的同一個帳號即可。

## 1. 確認帳號
```powershell
npx wrangler whoami
```
顯示的帳號底下若已經有 `neko-companion`，就是 accompany_bot 所在的帳號。

## 2. 建立資料庫
```powershell
npx wrangler d1 create pet-maid-db
```
把輸出的 `database_id` 填進 `backend/wrangler.toml` 的 `REPLACE_WITH_PET_MAID_DB_ID`，然後建表：
```powershell
npx wrangler d1 execute pet-maid-db --remote --file worker/schema.sql
```

## 3. 設定金鑰（每個指令會要求貼上值）
```powershell
npx wrangler secret put APP_SECRET          # 自己想一串新的存取密鑰，不要和 accompany_bot 相同
npx wrangler secret put LLM_API_KEY         # 到 https://aistudio.google.com/apikey 另開一把 Gemini 金鑰
npx wrangler secret put LLM_RELAY_SECRET    # 與 accompany_bot 相同的轉送服務密鑰
cmd /c "type ""%USERPROFILE%\Downloads\pet-maid-firebase-adminsdk-fbsvc-417b80d064.json"" | npx wrangler secret put FCM_SERVICE_ACCOUNT"
cmd /c """%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"" exec-out run-as com.accompany.pet cat files/push-token.txt | npx wrangler secret put FCM_DEVICE_TOKEN"
```
最後一行需要手機接線（或無線偵錯）。重裝 App 或清除資料後推播代碼會變，要重新執行這一行。

> ⚠️ 最後兩行一定要用 `cmd /c` 包起來，不要直接在 PowerShell 用 `|` 傳給 `npx`：Windows PowerShell 5.1 會改動傳過去的內容，存進去的金鑰就壞了，送推播時會一直回「尚未設定推播」（2026-10-04 實際踩過）。
> 同時連著多支手機時，在 `adb.exe""` 後面加 `-s <IP:埠號>` 指定是哪一支。

## 4. 部署
```powershell
npx wrangler deploy
```
記下輸出的網址（例如 `https://pet-maid-api.xxx.workers.dev`）。

## 5. 讓 App 知道聊天網址
1. 把專案根目錄的 `worker.properties.example` 複製成 `worker.properties`
2. 填入 `chatUrl=https://pet-maid-api.xxx.workers.dev/web/index.html`（必須是 https）
3. 重新建置並安裝 App

## 6. 測試送推播（M1.5 貴批次完成後才有這個功能）
```powershell
Invoke-RestMethod -Method Post -Uri "https://pet-maid-api.xxx.workers.dev/api/push" `
  -Headers @{ "x-app-secret" = "你的存取密鑰" } -ContentType "application/json; charset=utf-8" `
  -Body ([Text.Encoding]::UTF8.GetBytes('{"text":"該喝水了"}'))
```
成功時回覆 `ok: True` 與這則的編號，手機依角色模式與遊戲狀態出現角色、一般通知或排隊。

## 7. 送一則帶表情的推播（M1.6 貴批次完成後才有這個功能）
指令和第 6 節相同，只把 text 換成帶表情標籤的台詞：
```powershell
Invoke-RestMethod -Method Post -Uri "https://pet-maid-api.xxx.workers.dev/api/push" `
  -Headers @{ "x-app-secret" = "你的存取密鑰" } -ContentType "application/json; charset=utf-8" `
  -Body ([Text.Encoding]::UTF8.GetBytes('{"text":"[pout]真拿主人沒辦法。[smile]水記得喝。"}'))
```
- 可用的表情鍵：`neutral`、`laugh`、`smile`、`thinking`、`troubled`、`pout`（微傲）、`shy`（嬌），定義在 `app/src/main/assets/pet/emotion-map.js`。不在清單的標籤會用平常的臉。
- 標籤寫在哪個字前面，角色就在逐字打到那個字時換臉；說完 3 秒回到平常的臉。
- 角色模式關時，通知欄只顯示去掉標籤的文字；點通知叫出角色時才照原文演出。
- 不帶標籤的推播和 M1.5 完全一樣。

### 用 cmd 送（Windows 10 內建 curl）
cmd 直接在指令裡打中文會被轉成 Big5 送出，Worker 收到亂碼。先把內容存成 UTF-8 檔案再送：
1. 用記事本建立 `push.json`，內容 `{"text":"[pout]真拿主人沒辦法。[smile]水記得喝。"}`，存檔時編碼選「UTF-8」
2. 在 `push.json` 所在的資料夾執行：
```bat
curl -X POST "https://pet-maid-api.xxx.workers.dev/api/push" -H "x-app-secret: 你的存取密鑰" -H "Content-Type: application/json; charset=utf-8" --data-binary @push.json
```
成功時回覆 `{"ok":true,"id":"push-..."}`。換台詞只要改 `push.json` 再執行同一行。

## 8. 戒飲記錄（M2 貴批次完成後才有這個功能）
1. **套用新的資料表**（在 `backend/` 執行；冪等，重複執行不會清掉既有資料）：
```bash
npx wrangler d1 execute pet-maid-db --remote --file worker/schema.sql
```
2. **讓 App 拿到存取密鑰**：主倉庫的 `worker.properties` 加一行 `apiSecret=`，值和第 3 節 `APP_SECRET` 設的那把相同。App 會用它呼叫 `/api/drink/*`（記錄喝了、沒喝、讀設定），網址從同一個檔案的 `chatUrl` 取出 `https://網域` 這一段，不用另外填。改完要重新建置、安裝 App。
3. **重新部署**（`wrangler.toml` 的 `[triggers]` 讓 Worker 每小時跑一次，依台北時間在戒飲設定的整點送「今天有喝飲料嗎？」）：
```bash
npx wrangler deploy
```
4. **測一次**（Git Bash；`SECRET` 換成你的存取密鑰）：
```bash
curl -H "x-app-secret: $SECRET" https://pet-maid-api.xxx.workers.dev/api/drink/stats
```
成功時回覆本週杯數、本月省下金額、回本 %、少攝取熱量等數字。
5. **匯出給戒飲存**：瀏覽器無法帶標頭，用 curl 存成檔案後在戒飲存的「匯入」選它：
```bash
curl -H "x-app-secret: $SECRET" -o boba-ai-backup.json https://pet-maid-api.xxx.workers.dev/api/drink/export
```
**注意：戒飲存匯入會整份取代原本的資料**，匯入前先在戒飲存按「匯出」備份。


## 9. 盤前均線（M4 貴批次完成後才有這個功能）
1. 不需要新的金鑰；證交所資料是公開資料，不需要權杖。
2. `wrangler.toml` 的 crons 不用改：`30 0 * * *`（UTC 00:30＝台北 08:30）已經存在，M4 的盤前報告掛在同一個時間點。
3. 重新套用 D1 建表（新增 `ma_watch`、`ma_close`、`ma_result` 三張表，語句全部冪等）：在 Git Bash 執行 `cd backend && npx wrangler d1 execute pet-maid-db --remote --file worker/schema.sql`。
4. 重新部署：`npx wrangler deploy`。
5. 確認網頁：用手機瀏覽器開 `<Worker 網址>/web/ma.html`，第一次需要先在聊天網頁輸入存取密鑰（同網域共用）。
6. 第一次加入標的時，Worker 會向證交所補抓近 4 個月的收盤價；證交所有流量限制，請一檔一檔加，不要一次連按。
