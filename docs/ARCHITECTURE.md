# 架構

## 模組

- `core`：純 Kotlin 邏輯，不依賴 Android。
- `app`：Android 殼，負責服務、視窗與權限。

## 懸浮角色怎麼運作

前景服務（specialUse）→ WindowManager 懸浮窗（只有角色大小）→ 透明 WebView 載入 `file:///android_asset/pet/index.html`。

## 原生與網頁的溝通

- WebView → 原生：點角色、按麥克風。
- 原生 → WebView：暫停／播放動畫、顯示文字。

## M0 不做的事

不連網、不接 AI、不接 Todoist／戒飲存／台股、沒有快速設定磚、沒有遊戲偵測。

## M1 架構

推播 → `PetMessagingService`（或主畫面的測試推播）→ `ReminderDispatcher`
→ core 的 `parseReminder`、`decideRoute` 決定：
- 角色出現（`OverlayService`，3 分鐘閒置自動收起）
- 一般通知
- 排隊（`FileReminderQueueStore`，通知欄放一則靜音的「有 N 則提醒等你」）
- 忽略（格式錯誤、重複）

遊戲判斷只在收到推播的當下讀一次前景 App（`ForegroundDetector`，需要使用情形存取權），不常駐監看。
