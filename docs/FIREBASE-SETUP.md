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
