# AccompanyPet M1 — 便宜批次執行計畫

> 這份文件給協作代理人自主執行。
> 本批次為純產出工作（文件、設定範例），不含修正迴圈，可用較便宜的模型執行。
> 執行順序：本批次先跑，完成後才執行 docs/M1-EXPENSIVE-PLAN.md。
> 背景：docs/wish28-pet-spec.md §5 M1，以及 2026-10-03 的設計轉向「角色需要時才出現」（見 DECISIONS.md 第 26～29 項）。

## 0. 執行協定

- **全程不得向使用者提問。** 未明訂處依 §4 預設值表處理，並記錄在 DECISIONS.md。
- 本批次的驗收都是結構性檢查（檔案存在、章節齊全、關鍵字存在）。失敗時直接補齊缺漏即可，**不需要也不應該進入反覆修正的迴圈**。
- 若某項驗收補齊兩次仍不通過，停止該項並寫入 BLOCKERS.md，繼續處理其他項目。
- 專案已是 git 倉庫：開工前先把既有未提交檔案 commit 保存；每完成一個檔案就 commit。全程不設遠端、不執行 push。
- 所有文件、commit 訊息使用**繁體中文（臺灣用語）**：品質、程式、資料、檔案、通知。
- **只可追加**既有文件（README.md、CHECKLIST.md、DEVICE-CHECKLIST.md、docs/ARCHITECTURE.md），不得刪改既有段落。

## 1. 本批次範圍

| 動作 | 對象 |
|---|---|
| 建立 | `docs/FIREBASE-SETUP.md`、`firebase.properties.example`、`DEVICE-CHECKLIST-M1.md` |
| 追加 | `README.md`（M1 一節）、`docs/ARCHITECTURE.md`（M1 一節）、`CHECKLIST.md`（M1 一節）、`.gitignore`（兩行） |
| 不動 | 所有程式碼、`docs/` 其他檔案、`core/src/test/` |

## 2. 產出檔案清單（交接契約）

本批次完成後，以下檔案必須存在且非空。M1-EXPENSIVE-PLAN.md 的 T0a 會檢查這份清單：

- `docs/FIREBASE-SETUP.md` — 使用者建立 Firebase 專案的步驟
- `firebase.properties.example` — Firebase 設定值的範例檔（不含真實值）
- `DEVICE-CHECKLIST-M1.md` — M1 手機實測清單
- `.gitignore` — 含 `firebase.properties` 與 `google-services.json` 兩行
- `README.md`、`docs/ARCHITECTURE.md`、`CHECKLIST.md` — 各含「M1」標題

## 3. 各檔案的內容規格

### 3.1 `docs/FIREBASE-SETUP.md`

照抄以下內容：

```markdown
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
```

### 3.2 `firebase.properties.example`

照抄：

```properties
# Firebase 推播設定範例。複製成 firebase.properties 後填入真實值（不會進 git）。
# 步驟見 docs/FIREBASE-SETUP.md
projectId=
applicationId=
apiKey=
senderId=
```

### 3.3 `.gitignore` 追加

```
firebase.properties
google-services.json
```

### 3.4 `DEVICE-CHECKLIST-M1.md`

標題 `# M1 手機實測清單`，接著照抄 M1-EXPENSIVE-PLAN.md §4.5 中驗證方式含「手機」的列（M1-S03、M1-S04、M1-S10、M1-S11、M1-S13、M1-S14），每列一個核取方塊，格式同 DEVICE-CHECKLIST.md 的 A 節。再追加以下兩節，照抄：

```markdown
## B. 推播送達（需要先完成 docs/FIREBASE-SETUP.md）

- [ ] 從 Firebase 主控台 → Messaging → 「傳送測試訊息」，貼上主畫面的推播代碼，送出 → 依角色模式出現角色或一般通知
- [ ] App 被 vivo 收掉後（關螢幕 5 分鐘以上），再送一次 → 記錄是否仍收到：收到／沒收到
- [ ] 若沒收到：記錄手機品牌、型號、系統版本，寫進 BLOCKERS.md（M1.5 改用「通知＋資料」混合訊息評估）

## C. 不打擾

- [ ] 玩遊戲時收到提醒，畫面上方沒有彈出任何東西、沒有聲音、沒有震動
- [ ] 打完遊戲拉下通知欄，看得到「有 N 則提醒等你」，點它角色出現並報告
```

### 3.5 `README.md` 追加

在檔尾追加 `## M1：角色需要時才出現`，內容照抄：

```markdown
角色不再常駐。平常不在畫面上，三種情況才出現：
1. 點快速設定磚「🐾 陪伴角色」（同時切換角色模式開／關）
2. 角色模式開、沒在玩遊戲時，伺服器送來提醒
3. 點一般通知或「有 N 則提醒等你」通知

出現後 3 分鐘沒互動會自動收起。玩遊戲時收到的提醒會先排隊，不出聲。
推播設定見 docs/FIREBASE-SETUP.md。
```

### 3.6 `docs/ARCHITECTURE.md` 追加

在檔尾追加 `## M1 架構`，內容照抄：

```markdown
推播 → `PetMessagingService`（或主畫面的測試推播）→ `ReminderDispatcher`
→ core 的 `parseReminder`、`decideRoute` 決定：
- 角色出現（`OverlayService`，3 分鐘閒置自動收起）
- 一般通知
- 排隊（`FileReminderQueueStore`，通知欄放一則靜音的「有 N 則提醒等你」）
- 忽略（格式錯誤、重複）

遊戲判斷只在收到推播的當下讀一次前景 App（`ForegroundDetector`，需要使用情形存取權），不常駐監看。
```

### 3.7 `CHECKLIST.md` 追加

在檔尾追加 `## M1`，內容照抄：

```markdown
- [ ] 完成 docs/FIREBASE-SETUP.md，主畫面顯示推播代碼
- [ ] 讀 M1 的 RISK-REVIEW.md 新增項目
- [ ] 依賴套件稽核：Firebase Messaging 版本是否為最新穩定版（需要連網，自行查看）
- [ ] 自訂遊戲清單填入自己常玩、但系統沒標成遊戲的 App
```

## 4. 預設值表

| 問題 | 預設值 |
|---|---|
| 既有文件已有同名章節 | 不重複追加，記錄在 DECISIONS.md |
| `.gitignore` 已有該行 | 不重複追加 |
| §3 未涵蓋的措辭 | 照抄現有文件的口吻，不自行增加內容 |

## 5. 驗收

| # | 驗收項 | 判定方式 |
|---|---|---|
| C1 | §2 檔案全部存在且非空 | `test -s` |
| C2 | `firebase.properties.example` 的四個欄位等號後為空 | grep `=$` 計數為 4 |
| C3 | `.gitignore` 含 `firebase.properties` 與 `google-services.json` | grep |
| C4 | `DEVICE-CHECKLIST-M1.md` 含 M1-S03、M1-S04、M1-S10、M1-S11、M1-S13、M1-S14 | grep |
| C5 | README.md、docs/ARCHITECTURE.md、CHECKLIST.md 各含 `M1` 標題 | grep `^## M1` |
| C6 | 沒有修改任何程式碼 | `git diff --stat HEAD~N -- '*.kt' '*.kts' '*.xml' '*.html'` 為空 |

## 6. 故意不做的事

- 不建立真正的 `firebase.properties`、不下載或建立 `google-services.json`
- 不寫任何程式碼
- 不改 M0、M0.5 的既有文件內容（只追加）
