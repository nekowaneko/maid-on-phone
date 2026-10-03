# AccompanyPet M1 — 貴批次執行計畫（角色需要時才出現）

> 這份文件給協作代理人自主執行。
> 前提：docs/M1-CHEAP-PLAN.md 已執行完成，其產出檔案全部存在。
> 本批次含修正迴圈，成本控制條款見 §0 與 §6。
> 背景：docs/wish28-pet-spec.md §3、§5 M1；M0／M0.5 實測結論見 DECISIONS.md 第 26～29 項。
> **設計轉向（使用者 2026-10-03 決定）**：角色不再常駐，只在需要時出現、閒置 3 分鐘自動收起。
> 遊戲偵測只在收到推播的當下讀一次前景 App，不常駐監看。

## 0. 執行協定（最高優先，違反即為失敗）

### 0.1 不提問
全程不得向使用者提問。未明訂處依 §7 預設值表處理；§7 未涵蓋時選擇最保守的做法，並將決策與理由記錄在 DECISIONS.md（接續現有編號）。
需要手機、Firebase 帳號或真實推播的項目已移到 DEVICE-CHECKLIST-M1.md，不得因此停下。

### 0.2 工作循環
    階段實作 → 執行 ./verify.sh → 全綠？
                                  ├─ 是 → commit → 下一階段
                                  └─ 否 → 自動修正 → 重跑

### 0.3 錯誤指紋斷路器【條款 1】
每次修正前，取失敗訊息的前三行做正規化（去除行號、路徑中的使用者名稱、時間戳記、十六進位位址）後雜湊，得到一枚「錯誤指紋」，記錄在 PROGRESS.md。
若同一枚指紋第二次出現，**立刻停止該項目**，寫入 BLOCKERS.md（含指紋、完整錯誤、已嘗試的修法、你判斷的根因），然後繼續處理其他項目。
輪數上限作為第二道防線，設為 3。
**不得為了讓指紋不同而改寫錯誤訊息或包裝例外。**

### 0.4 分層驗收【條款 2】
沿用既有 `verify.sh`（Git Bash 執行，`set -euo pipefail`），依 §6.1 修改與新增檢查：
- **L1（秒級）**：grep 類的結構、架構、安全檢查
- **L2（十秒～一分鐘）**：`./gradlew :core:test`、`./gradlew :app:compileDebugKotlin`
- **L3（分鐘級）**：`assembleDebug`、`:app:lintDebug`、`:core:pitest`、報告檢查

**T1～T3 只跑 L1＋L2（`./verify.sh`）。L3 只在 T4 跑一次（`./verify.sh --full`）。** 不得吞掉任何一層的失敗回傳碼。

### 0.5 成本記錄【條款 6】
每階段結束時在 PROGRESS.md 的「## M1」段落記錄：修正輪數、錯誤指紋清單、每個驗收項失敗次數。全案結束時匯總成表，放在 `ACCEPTANCE-M1.md` 開頭。

### 0.6 版本控制
專案已是 git 倉庫。開工前先 commit 既有未提交檔案（`.idea/`、`tools/` 除外，不要加入）。每階段驗收通過後 commit 一次，訊息用繁體中文，結尾加 `Co-Authored-By` 行（依環境提示）。全程不設遠端、不 push。

### 0.7 語言與程式風格
所有註解、文件、commit 訊息、使用者看得到的文字使用**繁體中文（臺灣用語）**。程式風格與 docs/EXPENSIVE-PLAN.md §0.7 相同（使用者讀不懂其他風格，必須遵守）：
- 每個函式上方一行中文註解，說明它做什麼
- 關鍵行尾加簡短中文註解
- 小而單純的頂層函式，用組合串起流程，避免深層繼承
- 常數集中在檔案上方，加「// 常數定義」標題
- 新增檔案前先讀現有的 `OverlayService.kt`、`PetControl.kt`，照它們的寫法

### 0.8 規格測試凍結【條款 7】
**T0b 一次完成以下兩件事後 commit「凍結 M1 規格測試」，hash 記入 PROGRESS.md：**
1. **修改 M0 的 S15（使用者 2026-10-03 裁決）**：把 `core/src/test/kotlin/com/accompany/pet/spec/SpecTest.kt` 的 S15 函式改為 §4.5 的「M0-S15（修訂）」列。這是本計畫唯一允許修改 M0 規格測試的地方，其他 9 個函式一字不改。
2. 把 §4.5 標記「自動」的 M1 列轉成 `core/src/test/kotlin/com/accompany/pet/spec/m1/M1SpecTest.kt`。

此後整個 spec 目錄不得變動，由 L1 以 git diff 檢查（V04 的凍結 hash 改為新 hash）。
規格測試與實作衝突、且確信是規格有問題時，不得修改測試，寫入 BLOCKERS.md 標記「規格爭議」，繼續其他項目。
輔助測試放在 `core/src/test/kotlin/com/accompany/pet/helper/`，可以自由增修。

## 1. 本批次範圍

| 動作 | 對象 |
|---|---|
| 新增（core） | `core/src/main/kotlin/com/accompany/pet/core/reminder/`：提醒解析、分流、排隊、去重、閒置計時、角色模式、遊戲判斷 |
| 新增（app） | `PetApp`（Application）、`PetMessagingService`、`ReminderDispatcher`、`ForegroundDetector`、`ReminderNotifications` |
| 修改（app） | `OverlayService`（顯示指定文字、閒置收起）、`PetTileService`（改為角色模式開關）、`MainActivity`（使用情形存取權、自訂遊戲清單、推播代碼、測試推播）、`AndroidManifest.xml`、`app/build.gradle.kts`、`gradle/libs.versions.toml`、`build.gradle.kts`（如需） |
| 修改 | `verify.sh`（§6.1）、`SPEC-MAP.md`（追加 M1 列） |
| 修改（唯一例外） | M0 規格測試的 S15 函式（§0.8） |
| **不動** | `docs/`（本檔除外不得修改）、M0 其他規格測試、`frames/`、`index.html` 的 JS 介面 |

## 2. 不可協商的架構約束

沿用 docs/EXPENSIVE-PLAN.md §2 的 A1～A7（A3 仍成立：**原始碼的** Manifest 不得自行宣告 INTERNET；Firebase 套件合併進來的不算），加上：

| # | 約束 | 理由 | 檢查 |
|---|---|---|---|
| A11 | `core/reminder/` 只用 Kotlin 標準庫與 `java.util`／`java.io`／`java.time` | 分流邏輯要能在電腦上用 JUnit 測 | V01 |
| A12 | `app/src/main` 不得出現 `java.net.URL(`、`HttpURLConnection`、`okhttp`、`retrofit`、`ktor` | App 只透過 Firebase 推播收資料，不自行連外（新 S15） | V18 |
| A13 | 所有提醒（真推播與測試推播）都走 `ReminderDispatcher.handle`，分流只由 core 的 `decideRoute` 決定 | 單一入口，避免繞過遊戲判斷與去重 | 輔助測試＋RISK-REVIEW |
| A14 | `PetMessagingService` 宣告 `android:exported="false"` | 只接受 Firebase 程式庫轉交的訊息 | V20 |
| A15 | 排隊通知頻道為 `IMPORTANCE_MIN`、靜音、不震動 | 玩遊戲時不打擾（M1-S03） | V21 |
| A16 | Firebase 設定值只從 `firebase.properties`（不進 git）讀入；檔案不存在時 App 照常建置，只是不初始化 Firebase | 驗收不需要真實憑證 | V06（擴充） |
| A17 | 推播代碼（FCM token）只顯示在主畫面，不得寫進 log | 屬於可識別裝置的憑證 | V22 |

### 2.1 預期高風險模組【條款 10】

| 模組 | 風險類別 |
|---|---|
| `FileReminderQueueStore` | 寫入檔案，可能覆蓋或遺失排隊中的提醒 |
| `FileSeenIdStore` | 寫入檔案 |
| `PetMessagingService`／`ReminderDispatcher` | 外部輸入（推播內容）進入 App |
| `ForegroundDetector` | 讀取使用者的 App 使用紀錄（個人資料） |
| `PushTokenStore` | 推播代碼（裝置憑證） |

### 2.2 突變測試範圍【條款 9】

| 路徑 | 類別 |
|---|---|
| `core/src/main/kotlin/com/accompany/pet/core/permission/` | 權限判斷 |
| `core/src/main/kotlin/com/accompany/pet/core/reminder/` | 核心分流邏輯 |

## 3. 目錄結構（新增部分）

```
core/src/main/kotlin/com/accompany/pet/core/reminder/
├── Reminder.kt          Reminder、parseReminder、MAX_TEXT_LENGTH
├── Route.kt             ForegroundKind、classifyForeground、isGaming、RouteInput、Route、decideRoute
├── Queue.kt             enqueue、drainAlive、queueNoticeText、reportText、QUEUE_MAX、QUEUE_EXPIRE_MILLIS
├── Stores.kt            ReminderQueueStore／File…、SeenIdStore／File…、PetModeStore／File…（各附 InMemory 版）
└── Idle.kt              IDLE_HIDE_MILLIS、idleDeadline、shouldHide
core/src/test/kotlin/com/accompany/pet/spec/m1/M1SpecTest.kt   凍結的 M1 規格測試
app/src/main/java/com/accompany/pet/
├── PetApp.kt                Application：有設定時手動初始化 Firebase
├── PetMessagingService.kt   FirebaseMessagingService → ReminderDispatcher
├── ReminderDispatcher.kt    唯一入口：解析 → 去重 → 前景判斷 → decideRoute → 執行
├── ForegroundDetector.kt    UsageStatsManager 讀當下前景 App＋是否為遊戲
├── ReminderNotifications.kt 一般通知與靜音排隊通知
└── PushTokenStore.kt        推播代碼存取（檔案）
```

## 4. 模組介面規格（固定，規格測試依賴）

套件 `com.accompany.pet.core.reminder`：

```kotlin
// Reminder.kt
const val MAX_TEXT_LENGTH = 500
data class Reminder(val id: String, val text: String, val receivedAtMillis: Long)
fun parseReminder(data: Map<String, String>, nowMillis: Long): Reminder?
// 需要 "id" 與 "text" 兩個鍵；兩者 trim 後皆非空才回傳，否則 null
// text 超過 MAX_TEXT_LENGTH 時截斷為前 500 字

// Route.kt
enum class ForegroundKind { NORMAL, GAME, CUSTOM_GAME }
fun classifyForeground(packageName: String?, isGameCategory: Boolean, customGames: Set<String>): ForegroundKind
// isGameCategory → GAME；packageName 在 customGames → CUSTOM_GAME；其他（含 null）→ NORMAL
fun isGaming(kind: ForegroundKind, hasUsagePermission: Boolean): Boolean
// 沒有使用情形存取權一律 false；有權限時 GAME 或 CUSTOM_GAME 為 true
data class RouteInput(val petMode: Boolean, val gaming: Boolean, val alreadySeen: Boolean)
enum class Route { SHOW_PET, NOTIFY, QUEUE, IGNORE }
fun decideRoute(input: RouteInput): Route
// 優先順序：alreadySeen → IGNORE；gaming → QUEUE；petMode → SHOW_PET；否則 NOTIFY

// Queue.kt
const val QUEUE_MAX = 20
const val QUEUE_EXPIRE_MILLIS = 2 * 60 * 60 * 1000L
fun enqueue(queue: List<Reminder>, r: Reminder): List<Reminder>        // 加到尾端；超過 20 則丟掉最舊的
fun drainAlive(queue: List<Reminder>, nowMillis: Long): List<Reminder>  // 回傳 now − receivedAt < 2 小時的；滿 2 小時算過期
fun queueNoticeText(count: Int): String                                // "有 $count 則提醒等你"
const val QUEUE_REPORT_HEADER = "剛剛你在忙，我先記下了："
const val DEFAULT_GREETING = "主人叫我嗎？"
fun reportText(alive: List<Reminder>, newText: String?): String
// alive 非空：QUEUE_REPORT_HEADER + 每則一行「・<text>」；newText 非空時再空一行接 newText
// alive 空且 newText 非空：newText；兩者皆空：DEFAULT_GREETING

// Stores.kt
interface ReminderQueueStore { fun load(): List<Reminder>; fun save(queue: List<Reminder>) }
class FileReminderQueueStore(private val file: java.io.File) : ReminderQueueStore
class InMemoryReminderQueueStore : ReminderQueueStore
// 檔案格式：一則一行「<receivedAtMillis>\t<Base64(id)>\t<Base64(text)>」；壞掉的行略過，不影響其他行
interface SeenIdStore { fun contains(id: String): Boolean; fun add(id: String) }
class FileSeenIdStore(private val file: java.io.File, private val keep: Int = 200) : SeenIdStore  // 只保留最近 200 個
class InMemorySeenIdStore : SeenIdStore
interface PetModeStore { fun load(): Boolean; fun save(on: Boolean) }
class FilePetModeStore(private val file: java.io.File) : PetModeStore   // 內容 1／0；讀取失敗為 false
class InMemoryPetModeStore : PetModeStore

// Idle.kt
const val IDLE_HIDE_MILLIS = 3 * 60 * 1000L
fun idleDeadline(lastInteractionMillis: Long): Long        // lastInteraction + 3 分鐘
fun shouldHide(lastInteractionMillis: Long, nowMillis: Long): Boolean  // now >= deadline
```

推播資料格式（FCM data message，M1.5 的 Worker 依此送出）：

| 鍵 | 必填 | 說明 |
|---|---|---|
| `id` | 是 | 提醒編號，去重用 |
| `text` | 是 | 要說的話（M1 原樣顯示；M1.5 起由人設產生） |

## 4.5 規格範例表（使用者已確認）【條款 7】

使用者於 2026-10-03 透過互動示範逐列體驗後確認以下 15 列，其中 M1-S03、M1-S04 依使用者要求改為「靜音通知」版本。
**自動**＝T0b 轉成 `spec/m1/M1SpecTest.kt`；**手機**＝寫入 DEVICE-CHECKLIST-M1.md。兩者都有時，自動測試只驗證邏輯部分。

| 編號 | 情境（輸入） | 預期結果 | 驗證方式 |
|---|---|---|---|
| M1-S01 | 角色模式「開」、沒在玩遊戲時，收到一則提醒 | 角色出現在上次的位置，泡泡顯示這則提醒的文字 | 自動（`decideRoute` → `SHOW_PET`；`reportText(空, 文字)` 等於該文字） |
| M1-S02 | 角色模式「關」時，收到一則提醒 | 跳出一般通知（頭像＋提醒文字），角色不出現 | 自動（`decideRoute` → `NOTIFY`） |
| M1-S03 | 正在玩遊戲（前景是遊戲類 App）時，收到一則提醒 | 角色不出現、不出聲、不從上方彈出；提醒存進排隊，通知欄放一則靜音的「有 N 則提醒等你」（之後只更新數字）。點這則通知 → 角色出現並報告排隊內容 | 自動（`isGaming(GAME, true)`、`decideRoute` → `QUEUE`、`queueNoticeText(2)` 等於「有 2 則提醒等你」）＋手機 |
| M1-S04 | 正在用「自訂遊戲清單」裡的 App（系統沒標成遊戲）時，收到一則提醒 | 和 M1-S03 一樣 | 自動（`classifyForeground` → `CUSTOM_GAME`、`decideRoute` → `QUEUE`）＋手機 |
| M1-S05 | 排隊裡有提醒，下一次角色出現時（點磁磚，或沒在玩遊戲時收到下一則提醒） | 泡泡先列出排隊中的提醒，再顯示新的內容；報告完清空排隊 | 自動（`reportText` 以 `QUEUE_REPORT_HEADER` 開頭、排隊內容在新內容之前；報告後 store 為空） |
| M1-S06 | 排隊裡有 3 則：1 則是 3 小時前、2 則是 30 分鐘前，接著角色出現 | 只報告 30 分鐘前的那 2 則；3 小時前那則直接丟掉，不報告 | 自動（`drainAlive`） |
| M1-S07 | 排隊裡的提醒剛好滿 2 小時 | 算過期，丟掉不報告 | 自動（`drainAlive`，年齡恰為 2 小時） |
| M1-S08 | 收到內容空白或格式錯誤的推播 | 什麼都不顯示，App 不閃退 | 自動（`parseReminder` 對空白 text、缺 id、缺 text 皆回傳 null） |
| M1-S09 | 同一則提醒（同一個編號）收到兩次 | 只顯示或排隊一次 | 自動（`FileSeenIdStore` 存入後新實例 `contains` 為真；`decideRoute(alreadySeen=true)` → `IGNORE`） |
| M1-S10 | 沒給「使用情形存取權」時收到提醒 | 當作沒在玩遊戲，照 M1-S01／M1-S02 處理；主畫面顯示「開啟後才能在玩遊戲時先不打擾」並附按鈕 | 自動（`isGaming(GAME, false)` 為 false）＋手機 |
| M1-S11 | 角色出現後 3 分鐘內沒有任何互動 | 角色自動收起，常駐通知移除 | 自動（`shouldHide(t, t+3分鐘)` 為真、`t+3分鐘−1毫秒` 為假）＋手機 |
| M1-S12 | 角色出現後，點角色、點泡泡或按麥克風 | 重新計時 3 分鐘才收起 | 自動（`idleDeadline(新互動時間)` = 新互動時間 + 3 分鐘） |
| M1-S13 | 角色模式「關」時跳出的一般通知，點一下 | 角色出現並顯示同一則提醒 | 手機 |
| M1-S14 | 點磁磚把角色模式切成「開」／「關」 | 開：角色立刻出現，之後的提醒由角色說；關：角色收起，之後的提醒改成一般通知。磁磚亮＝開 | 自動（`FilePetModeStore` 存讀；mode=false 時 `decideRoute` → `NOTIFY`）＋手機 |
| M1-S15 | 排隊已經有 20 則，又排進第 21 則 | 丟掉最舊的一則，保留最新的 20 則 | 自動（`enqueue`） |
| M0-S15（修訂） | App 接上推播之後 | App 只透過 Firebase 推播收資料，不自行連其他外部服務 | 自動（讀取 `app/src/main` 下所有 `.kt`，斷言不含 `java.net.URL(`、`HttpURLConnection`、`okhttp`、`retrofit`、`ktor`；讀取原始碼 Manifest 斷言不含 `android.permission.INTERNET`） |

轉寫規則：
- M1 自動列共 13 列（M1-S13 除外），一列一個測試函式，名稱以列編號開頭，例如 `` `M1-S06 ...`() ``（反引號名稱中的連字號可用）；M0-S15 修訂版沿用函式名開頭 `S15`
- 預期結果照表抄寫，不得改寫、放寬或合併
- 檔案相關的列使用 JUnit `TemporaryFolder`；時間一律用固定的 `nowMillis`，不得讀系統時鐘
- 完成後在 `SPEC-MAP.md` 追加 M1 段落：列編號 → 函式名稱；手機列標「見 DEVICE-CHECKLIST-M1.md」

## 5. 實作階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| T0a | 確認 M1-CHEAP-PLAN.md §2 的產出檔案全部存在且非空；缺檔即停止並寫 BLOCKERS.md，不自行補寫 | 清單齊全 |
| T0b | 建立 `core/reminder/` 骨架（§4 簽名，函式體 `TODO()`）；依 §0.8 修改 M0-S15、新增 M1 規格測試；更新 SPEC-MAP.md；改 verify.sh 的 V04 hash 與 V05 計數；commit「凍結 M1 規格測試」 | 規格測試可編譯；M0 10 個＋M1 13 個 |
| T1 | 實作 `core/reminder/` 全部函式＋輔助測試 | L1＋L2 全綠，23 個規格測試全部通過 |
| T2 | Firebase 接入（`firebase.properties` 讀入 BuildConfig、`PetApp` 手動初始化、`PetMessagingService`、`PushTokenStore`）；`ReminderDispatcher`、`ForegroundDetector`、`ReminderNotifications` | L1＋L2 全綠 |
| T3 | `OverlayService` 顯示指定文字與閒置收起；`PetTileService` 改為角色模式；`MainActivity` 新增使用情形存取權狀態、自訂遊戲清單、推播代碼、測試推播 | L1＋L2 全綠 |
| T4 | `./verify.sh --full`；更新 MUTATION-REPORT.md、SECURITY-REPORT.md、RISK-REVIEW.md（各加 M1 段落）；產出 ACCEPTANCE-M1.md（含 APK 路徑） | V01～V22 全部通過 |

### T2／T3 實作要點

- **Firebase 依賴**：`com.google.firebase:firebase-messaging`（透過 `firebase-bom`，版本寫進 `libs.versions.toml`）。**不使用** `com.google.gms.google-services` Gradle 外掛。
- **設定讀入**：`app/build.gradle.kts` 讀根目錄 `firebase.properties`（不存在就用空字串），寫成 `BuildConfig.FIREBASE_PROJECT_ID` 等四個欄位；需開 `buildFeatures.buildConfig = true`。
- **初始化**：`PetApp.onCreate` 中，四個值都非空才 `FirebaseApp.initializeApp(context, FirebaseOptions)`；否則記一行 log「未設定 Firebase，推播停用」後略過。不得讓沒有設定時閃退。
- **`PetMessagingService`**：`onMessageReceived` 把 `message.data` 交給 `ReminderDispatcher.handle`；`onNewToken` 存進 `PushTokenStore`（`filesDir/push-token.txt`），不得 log 代碼本身。
- **`ReminderDispatcher.handle(context, data)`** 流程：`parseReminder` → null 則結束 → `SeenIdStore.contains` → `ForegroundDetector` → `classifyForeground`＋`isGaming` → `decideRoute` → 執行：
  - `SHOW_PET`：`OverlayService` 以 `ACTION_SHOW` 啟動，extra 帶提醒文字
  - `NOTIFY`：一般通知（頻道 `reminders`，`IMPORTANCE_DEFAULT`），點擊以 `PendingIntent.getForegroundService` 送 `ACTION_SHOW`＋同一則文字
  - `QUEUE`：`enqueue` 存檔，更新靜音通知（頻道 `queue`，`IMPORTANCE_MIN`、`setSilent(true)`、固定通知編號，內容 `queueNoticeText(存活數)`），點擊送 `ACTION_SHOW`（不帶文字）
  - `IGNORE`：結束
  - 非 `IGNORE` 時才 `SeenIdStore.add`
- **`ForegroundDetector`**：`AppOpsManager` 檢查 `OPSTR_GET_USAGE_STATS`；有權限時 `UsageStatsManager.queryEvents(now − 60 秒, now)` 取最後一個移到前景的套件；`ApplicationInfo.category == CATEGORY_GAME` 判斷遊戲。Manifest 宣告 `PACKAGE_USAGE_STATS`（加 `tools:ignore="ProtectedPermissions"`）。
- **`OverlayService`**：
  - `ACTION_SHOW`：未執行就啟動（沿用 M0 流程）；取出排隊 → `drainAlive` → `reportText(存活, 文字)` → 清空排隊並取消靜音通知 → `window.pet.showText` 並展開泡泡
  - 閒置收起：以 `Handler` 依 `idleDeadline` 排程，到期 `shouldHide` 為真則走既有停止流程（**不改**角色模式）
  - 互動：懸浮窗收到任何觸控（含拖曳）、`onPetTapped`、`onMicPressed` 都重設最後互動時間。**不得新增 `@JavascriptInterface`**（A5）；點泡泡由懸浮窗的觸控事件涵蓋
- **`PetTileService`**：磁磚狀態＝角色模式（`FilePetModeStore`，`filesDir/pet-mode.txt`）。點擊：關→開：存 true 並送 `ACTION_SHOW`；開→關：存 false 並停止服務。沿用 M0.5 的權限不足／被拒時開主畫面流程。
- **`MainActivity`**：
  - 使用情形存取權狀態；沒有時顯示「開啟後才能在玩遊戲時先不打擾」與按鈕（`Settings.ACTION_USAGE_ACCESS_SETTINGS`）
  - 自訂遊戲清單：多行輸入框，一行一個套件名稱，按「儲存」寫入 `filesDir/custom-games.txt`
  - 推播代碼：顯示 `PushTokenStore` 的內容與「複製」按鈕；沒有時顯示「尚未設定 Firebase，見 docs/FIREBASE-SETUP.md」
  - 測試推播：兩個按鈕「測試推播」（新編號）與「重送上一則」（同編號），都走 `ReminderDispatcher.handle`
  - 既有「開始」改為「叫出角色」（送 `ACTION_SHOW`），「停止」改為「收起角色」；耗電測試模式、匯出耗電紀錄保留
- **耗電紀錄**：只在角色顯示期間取樣（服務執行期間），沿用既有邏輯。

## 6. 驗收清單

### 6.1 自動驗收項【條款 5】

V01～V17 沿用（V04 改新 hash、V05 改計數、V06 擴充），V19 沿用，新增 V18、V20～V22，共 22 項：

| # | 層 | 驗收項 | 判定方式 |
|---|---|---|---|
| V04 | L1 | 規格測試未被改動 | `git diff --quiet <M1 凍結 hash> -- core/src/test/kotlin/com/accompany/pet/spec/` |
| V05 | L1 | M0 規格 10 個（S01、S02、S03、S07、S08、S09、S10、S13、S14、S15 各一次）＋M1 規格 13 個（M1-S01～S12、S14、S15 各一次），沒有 `@Ignore` | grep 計數 |
| V06 | L1 | 原檢查＋`git ls-files` 不含 `firebase.properties`、`google-services.json` | grep |
| V18 | L1 | A12：`app/src/main` 不含 `java.net.URL(`、`HttpURLConnection`、`okhttp`、`retrofit`、`ktor` | grep 結果為空 |
| V19 | L1 | A9：`PetTileService` 帶 `BIND_QUICK_SETTINGS_TILE`（沿用） | grep |
| V20 | L1 | A14：Manifest 中 `PetMessagingService` 為 `exported="false"` | grep |
| V21 | L1 | A15：`ReminderNotifications.kt` 含 `IMPORTANCE_MIN` 與 `setSilent(true)` | grep |
| V22 | L1 | A17：`app/src/main` 中沒有把 token 寫進 log（`Log\.[a-z]\(.*[Tt]oken` 為空） | grep 結果為空 |

**禁止為了通過驗收而做的事**：修改 spec 目錄（T0b 之後）、修改驗收標準、加 `@Ignore`、放寬斷言、改弱 grep 條件、吞掉失敗回傳碼、包裝例外以改變錯誤指紋。確實無法通過的項目走 §0.3 斷路器流程。

### 6.2 耦合驗收項【條款 3】

| 項目 | 與之衝突 | 衝突時的優先順序 |
|---|---|---|
| M1-S01／S02：依角色模式出現或通知 | M1-S03：玩遊戲時排隊 | **S03 優先**：`decideRoute` 先判斷 gaming，再看角色模式 |
| M1-S03：玩遊戲時排隊 | M1-S10：沒權限時當作沒在玩 | **S10 優先**：沒有權限時 `isGaming` 一律 false |
| M1-S05：報告排隊 | M1-S06／S07：過期丟掉 | **S06／S07 優先**：先 `drainAlive` 再 `reportText` |
| M1-S09：同編號只處理一次 | M1-S13：點通知叫出角色顯示同一則 | **S13 不受去重限制**：點通知走 `ACTION_SHOW`，不經 `ReminderDispatcher` |
| M1-S11：閒置自動收起 | M1-S14：角色模式開 | **兩者並存**：自動收起只停止服務，不改角色模式 |
| A5：只有兩個 JS 介面 | M1-S12：點泡泡要重新計時 | **A5 優先**：以懸浮窗原生觸控事件判斷互動，不新增介面 |
| A3：原始碼 Manifest 無 INTERNET | Firebase 需要網路 | **兩者並存**：網路權限由 Firebase 套件合併，原始碼 Manifest 仍不得宣告 |

### 6.3 移出自動層的項目【條款 4】

| 項目 | 原因 | 改為 |
|---|---|---|
| 真推播送達、vivo 收掉 App 後能否收到 | 需要 Firebase 帳號與手機 | DEVICE-CHECKLIST-M1.md B 節 |
| 靜音通知不打擾、點通知叫出角色 | 需要人眼 | DEVICE-CHECKLIST-M1.md |
| 前景 App 判斷正確 | 需要手機與使用情形存取權 | DEVICE-CHECKLIST-M1.md |
| Firebase 套件漏洞稽核 | 需要連網 | CHECKLIST.md（便宜批次已加） |
| 突變分數 | 規格測試已凍結 | MUTATION-REPORT.md |

### 6.4 人工檢查清單
不得新增其他自動驗收項。其他想檢查的事項追加到 CHECKLIST.md 的「M1」段落。

## 7. 預設值表

| 問題 | 預設值 |
|---|---|
| Firebase BOM 版本 | mavenCentral／google() 上目前最新穩定版，寫進 `libs.versions.toml` 並記錄在 DECISIONS.md |
| 沒有 `firebase.properties` | 建置照常；`PetApp` 不初始化 Firebase；主畫面顯示未設定 |
| 推播 `text` 過長 | 截斷為前 500 字 |
| 推播含 `id`、`text` 以外的鍵 | 忽略 |
| 前景 App 查不到（查詢區間內沒有事件） | `packageName = null` → `NORMAL` |
| 自訂遊戲清單格式錯誤（空行、前後空白） | trim 後略過空行 |
| 去重保留數量 | 最近 200 個編號 |
| 閒置計時的互動定義 | 懸浮窗任何觸控、`onPetTapped`、`onMicPressed` |
| 靜音通知圖示 | 沿用 `ic_launcher_foreground` |
| 一般通知按鈕 | M1 不加按鈕（最多兩顆的規格留給 M2） |
| 叫出角色時若 `SYSTEM_ALERT_WINDOW` 未授權 | 改發一般通知，並在主畫面提示授權 |
| 背景啟動前景服務被拒（`ForegroundServiceStartNotAllowedException`） | 改發一般通知，記 log，不嘗試繞過 |
| 兩種實作都合理 | 選較保守、較容易測試的那個 |
| 規格範例與 §4 介面衝突 | 不修改任何一方，寫入 BLOCKERS.md 標記「規格爭議」 |
| 突變測試工具無法執行 | 同 docs/EXPENSIVE-PLAN.md §7 的待補流程 |

## 8. 絕對禁止事項

- 不得向使用者提問。
- 不得在原始碼 Manifest 宣告 INTERNET；不得自行連線任何外部服務（Firebase 程式庫自身的連線除外）。
- 不得建立真正的 `firebase.properties` 或 `google-services.json`，不得在任何檔案、log、輸出中寫出推播代碼或 Firebase 設定值。
- 不得新增 `@JavascriptInterface` 方法；不得在 WebView 啟用 universal／file access from file URLs。
- 不得常駐監看前景 App（只在收到推播當下讀一次）；不得新增任何定時巡邏或保活機制。
- 不得嘗試繞過 Android 的背景啟動、通知或使用情形存取權限制。
- 不得刪除或覆蓋既有檔案；衝突時把既有檔案改名為 `<原名>.bak`。
- 不得把 `frames/local/` 的圖片加入 git。
- T0b 之後不得修改 spec 目錄；除 §0.8 指定的 S15 外，不得修改 M0 規格測試。
- 不得設遠端、不得 push。

## 9. 完成後的通知格式

    ✅ M1 貴批次完成，請查核。

    驗收結果：V01–V22 全部通過（或：通過 n 項，m 項未通過，詳見 BLOCKERS.md）
    規格測試：M0 <n>/10、M1 <n>/13 通過；規格爭議 <n> 項

    成本摘要：
    | 階段 | 修正輪數 | 觸發過的錯誤指紋 |
    |---|---|---|
    | T1 | <n> | <n> 種 |
    | T2 | <n> | <n> 種 |
    | T3 | <n> | <n> 種 |
    | T4 | <n> | <n> 種 |
    合計修正輪數：<n>

    APK 位置：app/build/outputs/apk/debug/<檔名>.apk

    需要你人工完成的事：
    1. 照 docs/FIREBASE-SETUP.md 建立 Firebase 專案並填 firebase.properties
    2. 把 APK 裝到手機，照 DEVICE-CHECKLIST-M1.md 實測
    3. 讀 RISK-REVIEW.md 的 M1 段落（共 <n> 個函式）
    4. 看 MUTATION-REPORT.md（範圍 core/permission、core/reminder）
    5. 掃一遍 CHECKLIST.md 的 M1 段落

## 10. 故意不做的事

- 不接 Cloudflare、不建 Worker B、不送真正的推播（M1.5）
- 不做表情標籤、Inochi2D、人設台詞（M1.5）
- 不做一般通知上的按鈕（M2 起依功能需要）
- 不做常駐的遊戲偵測、離開遊戲時主動報告
- 不做定時巡邏、無障礙服務、開機自動啟動
- 不做勿擾時段（規格書 §6，之後再說）
- 不擴充範圍；有建議寫進 DECISIONS.md 的「建議後續」段落，不要實作
