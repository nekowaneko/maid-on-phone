# Firebase 推播設定（使用者操作，約 10 分鐘）

> Firebase 雲端推播（FCM）免費，不需要綁信用卡。
> 設定值屬於憑證，只放在本機的 `firebase.properties`，不會進 git。
> 沒有設定時 App 照樣能建置與使用，只是收不到真正的推播（可用主畫面的「測試推播」按鈕代替）。

## 1. 建立專案
1. 到 https://console.firebase.google.com ，用 Google 帳號登入
2. 「新增專案」→ 名稱填 `pet-maid` → Google Analytics 選「不啟用」→ 建立

## 2. 加入 Android App
1. 專案首頁按 Android 圖示
2. 套件名稱填 `com.accompany.pet`，其他欄位留空 → 註冊應用程式
3. 下載 `google-services.json`（**不要**放進專案資料夾，放在電腦其他地方即可）

## 3. 填寫 firebase.properties
1. 把專案根目錄的 `firebase.properties.example` 複製成 `firebase.properties`
2. 打開剛下載的 `google-services.json`，依下表把值填進去：

| firebase.properties 的欄位 | google-services.json 裡的位置 |
|---|---|
| `projectId` | `project_info.project_id` |
| `applicationId` | `client[0].client_info.mobilesdk_app_id` |
| `apiKey` | `client[0].api_key[0].current_key` |
| `senderId` | `project_info.project_number` |

3. 重新建置 App。主畫面的「推播代碼」會顯示一串文字，代表設定成功。

## 4. 之後（M1.5）
伺服器送推播需要「服務帳戶金鑰」，M1.5 架設 Worker B 時才需要，現在不用做。

## 5. 從電腦送測試推播（純資料推播）

Firebase 主控台的「傳送測試訊息」送的是通知型推播：App 在背景時由系統直接放進通知欄，不經過角色的分流，所以改用電腦送。

1. Firebase 主控台 → 專案設定 → 服務帳戶 → 「產生新的私密金鑰」，下載的 JSON **不要**放進專案資料夾
2. 手機接線或開無線偵錯，App 開過一次（主畫面有推播代碼）
3. 在專案根目錄執行（需要 Python 套件 `google-auth`、`requests`）：

| 想測的情況 | 指令 |
|---|---|
| 一般送一則 | `python tools/send_push.py --key 金鑰路徑 --text "該喝水了"` |
| 玩遊戲時排隊 | `python tools/send_push.py --key 金鑰路徑 --delay 30`，30 秒內切到遊戲畫面 |
| 同編號只處理一次 | `python tools/send_push.py --key 金鑰路徑 --id 上一次印出的編號` |
| vivo 收掉 App 後 | 關螢幕 5 分鐘以上，再送一則 |

金鑰路徑也可以設成環境變數 `PET_FCM_KEY`，就不用每次加 `--key`。
