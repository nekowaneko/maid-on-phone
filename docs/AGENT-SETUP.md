# 給 AI 代理人：建置與設定指引

> 讀者是 AI 代理人（Claude Code 等）。目標：在使用者的電腦上完成 AccompanyPet 的建置、後端部署與 App 設定。
> 用繁體中文與使用者溝通。每一步都先檢查，再動手，再驗證。

## 0. 執行規則

1. **金鑰與憑證不進 git、不出現在對話與 log。** 不要把任何金鑰、`google-services.json`、服務帳戶 JSON、`.dev.vars`、`firebase.properties`、`worker.properties` 的內容印出、貼進回覆或提交。
2. **必須由使用者本人操作的事就停下來請他做**：登入 Firebase 主控台、登入 Cloudflare（`wrangler login` 會開瀏覽器）、申請 Gemini 金鑰、在手機上授予權限。不要代替使用者註冊帳號或輸入他的密碼。
3. 使用者提供金鑰時，用環境變數或檔案傳給指令，不要把值直接寫進指令列或腳本。
4. 對外部署（`wrangler deploy`、`wrangler secret put`、`d1 execute --remote`）前，先用一句話告訴使用者要做什麼，得到同意再執行。
5. 不要修改 `core/src/test/.../spec/` 與 `backend/tests/spec/`（凍結的規格測試，`verify.sh` 會檢查）。
6. **Windows 注意**：不要在 Windows PowerShell 5.1 用 `|` 把內容傳給 `wrangler secret put`，它會改動內容，存進去的金鑰會壞。改用 Git Bash，或 `cmd /c`。
7. 遇到下方「疑難排解」沒有的錯誤，最多嘗試修正 3 輪；仍失敗就停下，向使用者回報錯誤訊息（遮掉金鑰）與你的判斷。

## 1. 環境檢查

逐項執行，缺什麼就告訴使用者怎麼裝，不要自己裝系統層級的軟體。

```bash
git --version
node --version        # 需要 22 以上
npm --version
java -version         # 需要 17 以上（Android Studio 內建的 JBR 也可以）
adb version           # 來自 Android SDK platform-tools
```

- Android SDK：需要 API 37 平台。路徑通常在 `%LOCALAPPDATA%\Android\Sdk`（Windows）或 `~/Library/Android/sdk`（macOS）。`local.properties` 裡的 `sdk.dir` 要指到它；沒有這個檔時，Android Studio 開啟專案會自動產生，或自行建立（此檔不進 git）。
- 手機：已開啟開發人員選項與 USB 偵錯，`adb devices` 看得到裝置且狀態為 `device`。

## 2. 向使用者收集的資訊

在開始前一次問清楚：

| 項目 | 說明 | 必要 |
|---|---|---|
| 是否已有 Firebase 專案 | 沒有的話第 3 步帶他建立 | 是 |
| 是否已有 Cloudflare 帳號 | 免費帳號即可 | 是 |
| Gemini API 金鑰 | 到 https://aistudio.google.com/apikey 申請 | 是 |
| 要不要啟用 Todoist | 需要個人 API 權杖 | 否 |
| 要不要自訂角色圖 | 沒有就用內附的作者角色圖（僅供體驗，見 ART-LICENSE.md） | 否 |

## 3. Firebase（推播）

詳細畫面說明見 [FIREBASE-SETUP.md](FIREBASE-SETUP.md)。你要做的是：

1. 請使用者在 Firebase 主控台建立專案，加入 Android App，**套件名稱必須是 `com.accompany.pet`**，下載 `google-services.json` 放在專案資料夾以外的地方，並告訴你路徑。
2. 讀這個 JSON，把四個值寫進根目錄的 `firebase.properties`（由 `firebase.properties.example` 複製而來）：

| 欄位 | JSON 路徑 |
|---|---|
| `projectId` | `project_info.project_id` |
| `applicationId` | `client[0].client_info.mobilesdk_app_id` |
| `apiKey` | `client[0].api_key[0].current_key` |
| `senderId` | `project_info.project_number` |

3. 請使用者到「專案設定 → 服務帳戶 → 產生新的私密金鑰」下載服務帳戶 JSON（同樣放專案資料夾以外），告訴你路徑。第 5 步要設為 `FCM_SERVICE_ACCOUNT`。

## 4. 後端部署

在 `backend/` 目錄執行。完整說明見 [WORKER-SETUP.md](WORKER-SETUP.md)。

### 4.1 安裝與登入
```bash
cd backend
npm install
npx wrangler login      # 請使用者在瀏覽器完成登入
npx wrangler whoami
```

### 4.2 建立資料庫
```bash
npx wrangler d1 create pet-maid-db
```
把輸出的 `database_id` 取代 `backend/wrangler.toml` 裡 `[[d1_databases]]` 的 `REPLACE_WITH_YOUR_D1_DATABASE_ID`。然後建表：
```bash
npx wrangler d1 execute pet-maid-db --remote --file worker/schema.sql
```
`schema.sql` 的語句是冪等的，重複執行不會清掉資料。

### 4.3 決定語言模型的出口
`wrangler.toml` 預設不設中繼站（`LLM_RELAY_ORIGIN` 是註解掉的），Worker 會直連 Gemini。

- **預設做法**：先不動。部署後若聊天出現地區不支援之類的錯誤（Cloudflare 的對外請求有時從 Gemini 不供應的地區出去），再用備援做法。
- **備援做法**：使用者自行架一個轉送 Gemini 的中繼站（本專案沒有附中繼站程式），把網址填進 `LLM_RELAY_ORIGIN`（取消註解），並設定 `LLM_RELAY_SECRET`。

### 4.4 設定金鑰
在 Git Bash 執行。每個指令的值由環境變數或檔案提供，不要寫在指令列。

```bash
# 存取密鑰：App 與聊天網頁共用，請幫使用者產生一串夠長的隨機字串並告訴他保存
openssl rand -base64 32 > /tmp/app_secret.txt
npx wrangler secret put APP_SECRET < /tmp/app_secret.txt

# Gemini 金鑰（使用者提供，先存成暫存檔或環境變數）
npx wrangler secret put LLM_API_KEY < /path/to/gemini_key.txt

# 服務帳戶金鑰 JSON 全文
npx wrangler secret put FCM_SERVICE_ACCOUNT < /path/to/service-account.json

# 可選：Todoist 權杖
npx wrangler secret put TODOIST_TOKEN < /path/to/todoist_token.txt
```

- `FCM_DEVICE_TOKEN`（手機的推播代碼）要等 App 安裝後才拿得到，見第 6 步。
- 設完刪除暫存檔。`APP_SECRET` 要讓使用者自己保存一份，之後第 5 步與聊天網頁登入都會用到。

### 4.5 部署
```bash
npx wrangler deploy
```
記下輸出的網址，形如 `https://pet-maid-api.<子網域>.workers.dev`。

## 5. App 設定與建置

1. 根目錄建立 `worker.properties`（由 `worker.properties.example` 複製）：
   ```
   chatUrl=https://pet-maid-api.<子網域>.workers.dev/web/index.html
   apiSecret=<與 APP_SECRET 相同>
   ```
   `chatUrl` 必須是 `https://`。
2. 建置並安裝：
   ```bash
   ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```
3. 若使用者要用自己的角色圖：把 `idle.png`、`blink.png` 放進 `app/src/main/assets/pet/frames/local/` 後重新建置。沒有的話，會顯示內附的作者角色圖。若要換掉聊天畫面的圖，改 `backend/assets/character/frames/` 同名檔案後重新部署。

## 6. 取得推播代碼並完成連線

1. 請使用者開啟 App，授予權限（顯示在其他應用程式上層、通知、麥克風）。主畫面會顯示「推播代碼」。
2. 取得代碼並設為 `FCM_DEVICE_TOKEN`（debug 版可由 adb 取得）：
   ```bash
   adb exec-out run-as com.accompany.pet cat files/push-token.txt > /tmp/fcm_token.txt
   cd backend && npx wrangler secret put FCM_DEVICE_TOKEN < /tmp/fcm_token.txt
   ```
   同時接多支手機時，在 `adb` 後面加 `-s <序號>`。重裝 App 或清除資料後代碼會變，要重做這一步。

## 7. 驗證

依序做，每項都要有實際結果，不要只憑「指令沒報錯」就說完成。

| 檢查 | 做法 | 預期 |
|---|---|---|
| 後端單元測試 | `cd backend && npm test` | 全部通過 |
| 存取密鑰有效 | `curl -s -o /dev/null -w "%{http_code}" -H "x-app-secret: $SECRET" <Worker 網址>/api/usage` | `200` |
| 密鑰錯誤被拒 | 同上但密鑰故意打錯 | `401` |
| 推播送達 | `curl -X POST <Worker 網址>/api/push -H "x-app-secret: $SECRET" -H "Content-Type: application/json; charset=utf-8" --data-binary @push.json`，`push.json` 內容 `{"text":"測試"}` 以 UTF-8 存檔 | 回覆 `{"ok":true,...}`，手機出現通知或角色 |
| 聊天可用 | 請使用者在 App 點角色 → 聊聊，輸入密鑰後送出一句話 | 角色有回覆 |

`push.json` 一定要用 UTF-8 檔案送，cmd 直接在指令列打中文會變亂碼。

完整驗收（可選，耗時較久）：`./verify.sh --full`。

## 8. 可選功能

- **戒飲記錄**：已包含在 `schema.sql` 與排程裡，部署後就有。詢問時段在 App 的戒飲設定畫面調整。使用者不想用時，請他在 App 的「戒飲設定」把「啟用戒飲記錄」關掉；這不需要改程式或設定檔。
- **Todoist**：第 4.4 步設了 `TODOIST_TOKEN` 就啟用。
- **盤前均線**：不需要金鑰（證交所公開資料）。排程已在 `wrangler.toml` 的 `crons`（UTC 00:30，台北 08:30）。使用者在 `<Worker 網址>/web/ma.html` 加入追蹤標的；請一檔一檔加，證交所有流量限制。
- **人設**：不必改檔。聊天畫面選單的「✎ 小檔案」可直接編輯；預設值在 `backend/config/persona.md`，改了需重新部署。

## 9. 疑難排解

| 現象 | 可能原因 | 處理 |
|---|---|---|
| 建置失敗：找不到 SDK | `local.properties` 的 `sdk.dir` 不對 | 指到實際的 Android SDK 路徑 |
| 建置失敗：JDK 版本 | JDK 低於 17 | 改用 JDK 17，或 Android Studio 內建的 JBR |
| App 建置成功但點「聊聊」顯示尚未設定 | `chatUrl` 沒填或不是 https | 修正 `worker.properties`，重新建置安裝 |
| `/api/usage` 回 401 | 存取密鑰不一致 | 重設 `APP_SECRET`，並讓 `worker.properties` 的 `apiSecret` 與之相同 |
| 聊天回「連線失敗」且 Gemini 相關訊息 | `LLM_API_KEY` 錯誤、額度用完、或出口地區不支援 | 重設金鑰；仍不行見 4.3 備援做法 |
| 使用中繼站時回 401 | `LLM_RELAY_SECRET` 與中繼站不一致 | 重設為中繼站的密鑰 |
| 推播回「尚未設定推播」 | `FCM_SERVICE_ACCOUNT` 或 `FCM_DEVICE_TOKEN` 缺失或內容被改壞 | 用 Git Bash 重新 `secret put`（見規則 6） |
| 推播中文變亂碼 | 在 cmd 指令列直接打中文 | 改用 UTF-8 檔案 `--data-binary @檔案` |
| App 重裝後收不到推播 | 推播代碼已改變 | 重做第 6 步 |
| vivo 等機型提醒不準時 | 系統凍結背景 App 並移除鬧鐘 | 加入電池最佳化白名單；仍無效則只能用快速設定磚手動叫出角色 |

## 10. 完成時回報

向使用者回報：
- 做完了哪些步驟，哪些驗證實際通過（附結果，不要附金鑰）。
- 哪些檢查你沒辦法做（例如需要手機實測的語音辨識）。
- 使用者需要自己保管的東西：`APP_SECRET`、服務帳戶 JSON、Gemini 金鑰、`firebase.properties` 與 `worker.properties`。
- 提醒他不要把這些檔案提交到 git（`.gitignore` 已排除，但更改檔名或複製到別處就無保護）。
