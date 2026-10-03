# AccompanyPet M0 — 貴批次執行計畫

> 這份文件給協作代理人自主執行。
> 前提：docs/CHEAP-PLAN.md 已執行完成，其產出檔案全部存在。
> 本批次含修正迴圈，會產生較高的執行成本，成本控制條款見 §0 與 §6。
> 背景規格：docs/wish28-pet-spec.md。本批次只做 M0：一個可以掛在手機上實測耗電的最小懸浮角色 APK。

## 0. 執行協定（最高優先，違反即為失敗）

### 0.1 不提問
全程不得向使用者提問，包含確認、選擇、澄清。
未明訂處依 §7 預設值表處理；§7 未涵蓋時選擇最保守的做法，
並將決策與理由記錄在 DECISIONS.md。
不得因為缺少手機、模擬器、或角色素材而停下來詢問——需要手機的項目已移到 DEVICE-CHECKLIST.md。

### 0.2 工作循環
    階段實作 → 執行 ./verify.sh → 全綠？
                                  ├─ 是 → commit → 下一階段
                                  └─ 否 → 自動修正 → 重跑

### 0.3 錯誤指紋斷路器【條款 1】
每次修正前，取失敗訊息的前三行做正規化（去除行號、路徑中的使用者名稱、時間戳記、十六進位位址）後雜湊，
得到一枚「錯誤指紋」，記錄在 PROGRESS.md。
若同一枚指紋第二次出現，**立刻停止該項目**，寫入 BLOCKERS.md
（含指紋、完整錯誤、已嘗試的修法、你判斷的根因），然後繼續處理其他項目。
輪數上限作為第二道防線，設為 3。
**不得為了讓指紋不同而改寫錯誤訊息或包裝例外。**

### 0.4 分層驗收【條款 2】
`verify.sh`（在 Git Bash 執行）分三層，依序執行，前一層失敗就不進入後一層：

- **L1（秒級）**：grep 類的結構、架構、安全檢查
- **L2（十秒～一分鐘級）**：`./gradlew :core:test` 與 `./gradlew :app:compileDebugKotlin`
- **L3（分鐘級）**：`./gradlew assembleDebug`、`./gradlew :app:lintDebug`、突變測試、報告檢查

**T1～T3 的驗收只跑 L1 與 L2。L3 只在 T4 跑一次。**
`verify.sh` 開頭寫 `set -euo pipefail`，不得吞掉任何一層的失敗回傳碼。
支援參數：`./verify.sh`（L1+L2）、`./verify.sh --full`（L1+L2+L3）。

### 0.5 成本記錄【條款 6】
每階段結束時在 PROGRESS.md 記錄：該階段的修正輪數、出現過的錯誤指紋清單、
每個驗收項各失敗過幾次。全案結束時匯總成一張表，放在 ACCEPTANCE.md 開頭。

### 0.6 版本控制
CHEAP 批次已 git init。開工前先 commit 既有未提交檔案（若有）。
全程不設遠端、不執行 push。每階段完成且驗收通過後 commit 一次，訊息用繁體中文。

### 0.7 語言與風格
所有註解、文件、commit 訊息、使用者看得到的文字使用**繁體中文（臺灣用語）**：
「品質」不是「質量」、「程式」不是「程序」、「資料」不是「數據」、「檔案」不是「文件」。

使用者的程式風格（他讀不懂不同風格的程式，必須遵守）：

- 每個函式上方一行中文註解，說明它做什麼
- 關鍵行尾加簡短中文註解
- 偏好小而單純的頂層函式，用組合的方式串起流程，避免深層繼承
- 常數集中在檔案上方，加「// 常數定義」標題
- 可以有「包裝器」模式（把一段流程包起來加記錄），但不要過度抽象

範例：

```kotlin
// 常數定義
const val LOG_INTERVAL_MINUTES = 15  // 耗電紀錄間隔
const val EDGE_MARGIN_PX = 8          // 吸附時與螢幕邊緣的距離

// 依放開的位置，決定角色要吸附到左邊或右邊
fun snapToEdge(drop: Point, pet: Size, screen: Size, margin: Int = EDGE_MARGIN_PX): Point {
    val centerX = drop.x + pet.w / 2  // 角色中心點
    val x = if (centerX < screen.w / 2) margin else screen.w - pet.w - margin
    return clampInScreen(Point(x, drop.y), pet, screen)  // 上下也要留在畫面內
}
```

### 0.8 規格測試凍結【條款 7】
§4.5 規格範例表是使用者確認過的期望值，優先於你對需求的任何解讀。
T0b 把標記為「自動」的列轉成
`core/src/test/kotlin/com/accompany/pet/spec/`（以下稱 **spec 目錄**）底下的測試，commit 後凍結。
此後 **spec 目錄不得有任何變動**，由 L1 以 git diff 檢查。

規格測試與實作衝突、且你確信是規格本身有問題時，**不得修改測試**，
寫入 BLOCKERS.md 並標記「規格爭議」（含列編號、你的理由、建議的改法），然後繼續處理其他項目。
你自己寫的輔助測試放在 `core/src/test/kotlin/com/accompany/pet/` 底下 spec 以外的套件，可以自由增修。

## 1. 本批次範圍

| 動作 | 對象 |
|---|---|
| 新增模組 | `core`（純 Kotlin JVM 函式庫） |
| 實作 | `core` 的全部邏輯；`app` 的權限引導頁、懸浮窗服務、WebView 角色頁、語音橋接、耗電紀錄與匯出 |
| 修改 | `settings.gradle.kts`（加入 `:core`）、`app/build.gradle.kts`（依賴 `:core`）、`gradle/libs.versions.toml`（如需）、`AndroidManifest.xml`、Android Studio 產生的 `MainActivity.kt` |
| 新增規格測試 | spec 目錄（T0b 由 §4.5 轉寫，之後凍結） |
| 新增輔助測試 | `core/src/test/kotlin/com/accompany/pet/` 底下 spec 以外的套件 |
| **不動** | `docs/`、CHEAP 批次產出的文件（只可追加 CHECKLIST.md）、`app/src/main/assets/pet/frames/` |

## 2. 不可協商的架構約束

| # | 約束 | 理由 | 檢查 |
|---|---|---|---|
| A1 | `core/` 不得 import `android.`、`androidx.` | 讓邏輯能在電腦上用 JUnit 測，不需要手機 | V01 |
| A2 | `core/` 不得 import `java.net`、`okhttp`、`HttpURLConnection` | M0 不連網（S15） | V02 |
| A3 | `AndroidManifest.xml` 不得宣告 `android.permission.INTERNET` | M0 不連網（S15） | V03（同時是規格測試 S15） |
| A4 | WebView 只能載入 `file:///android_asset/pet/`，其他網址一律攔截 | WebView 開了 JavaScript 與原生橋接，載入外部頁面等於把原生功能開放給外部 | V07 |
| A5 | `@JavascriptInterface` 方法只有 `onPetTapped` 與 `onMicPressed` 兩個 | 橋接面越小越安全 | V08 |
| A6 | 懸浮窗大小只到「角色＋泡泡」的範圍，不得使用 `MATCH_PARENT` | 避開 Android 12 觸控穿透限制，並讓 S06 成立 | V09 |
| A7 | 前景服務宣告 `foregroundServiceType="specialUse|microphone"`，並含 `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` 屬性 | Android 14+ 必要條件 | V10 |

### 2.1 預期高風險模組【條款 10】

| 模組 | 風險類別 |
|---|---|
| `core` 的 `exportCsv`（耗電紀錄匯出） | 寫入檔案，可能覆蓋舊紀錄 |
| `core` 的 `FilePositionStore` | 寫入檔案 |
| `app` 的 `PetBridge`（WebView ↔ 原生橋接） | 原生功能暴露給網頁內容 |
| `app` 的 `BatteryLogger`（附加寫入樣本檔） | 寫入檔案，可能覆蓋舊紀錄 |

### 2.2 突變測試範圍【條款 9】

| 路徑 | 類別 |
|---|---|
| `core/src/main/kotlin/com/accompany/pet/core/permission/` | 權限判斷 |

## 3. 目錄結構

```
<repo>/
├── settings.gradle.kts            include(":app", ":core")
├── verify.sh                      三層驗收腳本（§0.4）
├── core/
│   ├── build.gradle.kts           kotlin("jvm")＋JUnit 4＋Pitest 外掛
│   └── src/
│       ├── main/kotlin/com/accompany/pet/core/
│       │   ├── Geometry.kt        Point、Size、clampInScreen、snapToEdge、initialPosition
│       │   ├── PositionStore.kt   PositionStore 介面、FilePositionStore、InMemoryPositionStore
│       │   ├── PetState.kt        狀態列舉與 reduce()
│       │   ├── BatteryLog.kt      BatterySample、toCsvLine、CSV_HEADER、nextSampleTime
│       │   ├── Export.kt          exportFileName、exportCsv
│       │   └── permission/
│       │       └── Permission.kt  decideStart、MIC_DENIED_MESSAGE
│       └── test/kotlin/com/accompany/pet/
│           ├── spec/              凍結的規格測試（T0b 後不得改動）
│           └── helper/            輔助測試，可自由增修
└── app/src/main/
    ├── AndroidManifest.xml
    ├── java/com/accompany/pet/    沿用 Android Studio 範本的資料夾（裡面放 .kt 檔），不得另建 kotlin/
    │   ├── MainActivity.kt        權限說明、開始／停止、匯出按鈕
    │   ├── OverlayService.kt      前景服務＋WindowManager＋拖曳＋螢幕開關
    │   ├── PetBridge.kt           @JavascriptInterface 兩個方法
    │   ├── SpeechBridge.kt        SpeechRecognizer → 文字
    │   └── BatteryLogger.kt       每 15 分鐘取樣、附加寫入
    ├── res/xml/file_paths.xml     FileProvider 分享匯出檔
    └── assets/pet/
        ├── index.html             角色頁：待機循環、泡泡、麥克風按鈕
        └── frames/                CHEAP 批次已建立，不動
```

## 4. 模組介面規格

以下簽名固定，規格測試依賴它們。套件名稱 `com.accompany.pet.core`（permission 子套件為 `com.accompany.pet.core.permission`）。

```kotlin
// Geometry.kt
data class Point(val x: Int, val y: Int)
data class Size(val w: Int, val h: Int)
fun clampInScreen(p: Point, pet: Size, screen: Size): Point
fun snapToEdge(drop: Point, pet: Size, screen: Size, margin: Int = EDGE_MARGIN_PX): Point
fun initialPosition(saved: Point?, pet: Size, screen: Size, margin: Int = EDGE_MARGIN_PX): Point
// 沒有紀錄 → 右下：x = screen.w - pet.w - margin，y = (screen.h * 0.65).toInt() 再 clamp
// 有紀錄 → clampInScreen(saved)

// PositionStore.kt
interface PositionStore { fun load(): Point?; fun save(p: Point) }
class FilePositionStore(private val file: java.io.File) : PositionStore
class InMemoryPositionStore : PositionStore

// PetState.kt
enum class ServiceState { STOPPED, RUNNING }
enum class RenderState { PLAYING, PAUSED }
enum class PetEvent { START, STOP, SCREEN_OFF, SCREEN_ON }
data class PetState(val service: ServiceState, val render: RenderState, val notificationShown: Boolean)
val INITIAL_STATE = PetState(ServiceState.STOPPED, RenderState.PAUSED, false)
fun reduce(state: PetState, event: PetEvent): PetState

// BatteryLog.kt
const val LOG_INTERVAL_MINUTES = 15
const val CSV_HEADER = "時間,電量百分比,螢幕,動畫"
data class BatterySample(val timeMillis: Long, val batteryPercent: Int, val screenOn: Boolean, val animating: Boolean)
fun nextSampleTime(lastMillis: Long): Long
fun toCsvLine(s: BatterySample, zone: java.time.ZoneId): String
// 格式：yyyy-MM-dd HH:mm:ss,<電量>,<開|關>,<播放中|暫停>

// Export.kt
fun exportFileName(nowMillis: Long, zone: java.time.ZoneId): String
// 格式：battery-log-yyyyMMdd-HHmmss.csv
fun exportCsv(dir: java.io.File, samples: List<BatterySample>, nowMillis: Long, zone: java.time.ZoneId): java.io.File
// 檔名已存在時依序加 -1、-2…，絕不覆蓋；內容第一行為 CSV_HEADER

// permission/Permission.kt
enum class StartAction { SHOW_PERMISSION_EXPLANATION, START_OVERLAY }
fun decideStart(hasOverlayPermission: Boolean): StartAction
const val MIC_DENIED_MESSAGE = "需要麥克風權限才能用說的"
```

WebView ↔ 原生介面（固定）：

| 方向 | 介面 |
|---|---|
| 網頁 → 原生 | `window.PetBridge.onPetTapped()`、`window.PetBridge.onMicPressed()` |
| 原生 → 網頁 | `window.pet.setRender('playing' \| 'paused')`、`window.pet.showText(text)`、`window.pet.showBubble(true \| false)` |

## 4.5 規格範例表（使用者已確認）【條款 7】

使用者已逐列確認以下 15 列（S14 為使用者改寫版本）。「驗證方式」欄由計畫撰寫者標註：
**自動**＝T0b 轉成 spec 目錄的 JUnit 測試；**手機**＝已寫入 DEVICE-CHECKLIST.md，由使用者實測。
同一列若兩者都有，自動測試只驗證其中的邏輯部分。

| 編號 | 情境（輸入） | 預期結果 | 驗證方式 |
|---|---|---|---|
| S01 | 第一次開啟 App，還沒授權「顯示在其他應用程式上層」 | 畫面說明為什麼需要這個權限，按鈕帶到系統授權頁；授權前不顯示角色 | 自動（`decideStart(false)` 為 `SHOW_PERMISSION_EXPLANATION`）＋手機 |
| S02 | 麥克風權限被拒絕後，按麥克風按鈕 | 泡泡顯示「需要麥克風權限才能用說的」，App 不閃退 | 自動（`MIC_DENIED_MESSAGE` 字串完全相符）＋手機 |
| S03 | 按「匯出耗電紀錄」兩次 | 每次產生一個新的 CSV 檔（檔名含時間），不刪除、不覆蓋先前的紀錄 | 自動（同一時間連續匯出兩次 → 兩個不同檔案，第一個檔案內容不變） |
| S04 | 授權後按「開始」 | 桌面右下方出現角色，播放待機循環（呼吸、眨眼） | 手機 |
| S05 | 看角色周圍 | 看得到底下的桌面，背景透明，不是黑底或白底 | 手機 |
| S06 | 點角色旁邊的空白處（例如桌面圖示） | 點擊落到底下的 App，角色不攔截 | 手機 |
| S07 | 把角色拖到螢幕左半邊放開 | 角色吸附到左邊緣 | 自動（`snapToEdge` 的 x 等於 margin）＋手機 |
| S08 | 拖曳時把角色拉出螢幕上下邊界 | 角色停在螢幕邊界內，不會消失到畫面外 | 自動（`clampInScreen` 上下界）＋手機 |
| S09 | 停止服務後再重新開始 | 角色出現在上次放開的位置 | 自動（`FilePositionStore` 存入後以新實例讀出，`initialPosition` 回傳相同位置）＋手機 |
| S10 | 螢幕關閉，再重新打開 | 關閉期間動畫停止播放；打開後 3 秒內恢復播放 | 自動（`reduce` 的 SCREEN_OFF → PAUSED、SCREEN_ON → PLAYING）＋手機（3 秒） |
| S11 | 點角色 | 角色旁出現泡泡與麥克風按鈕 | 手機 |
| S12 | 按麥克風，說「剛剛喝了一杯大杯珍奶」 | 泡泡顯示辨識出的中文文字 | 手機 |
| S13 | 按通知欄上的「停止」 | 角色消失、服務結束、常駐通知移除 | 自動（`reduce(RUNNING 狀態, STOP)` → STOPPED、`notificationShown=false`）＋手機 |
| S14 | 服務運作期間 | 每 15 分鐘記錄一筆：時間、電量百分比、螢幕開或關、動畫是否播放中 | 自動（`nextSampleTime` 相差 15 分鐘；`toCsvLine` 含四個欄位） |
| S15 | 手機沒有網路 | 角色照常顯示與播放（M0 完全不連外） | 自動（讀取 `app/src/main/AndroidManifest.xml`，斷言不含 `android.permission.INTERNET`）＋手機 |

轉寫規則：
- 只轉寫標記「自動」的 10 列：S01、S02、S03、S07、S08、S09、S10、S13、S14、S15
- 一列對應一個測試函式，名稱以列編號開頭，例如 `` `S07 把角色拖到左半邊放開會吸附到左邊緣`() ``
- 預期結果照表抄寫，不得改寫、放寬或合併
- 檔案相關的列使用 JUnit 的 `TemporaryFolder`，不得寫入專案目錄
- 時區一律用 `ZoneId.of("Asia/Taipei")`
- 轉寫完成後產出 `SPEC-MAP.md`：列編號 → 測試檔與函式名稱；手機列標註「見 DEVICE-CHECKLIST.md」

## 5. 實作階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| T0a | 確認 CHEAP-PLAN.md §2 的產出檔案全部存在且非空 | 清單齊全 |
| T0b | 建立 `core` 模組骨架（只有 §4 的空殼簽名，函式體為 `TODO()`）；把 §4.5 的自動列轉成 spec 目錄；產出 SPEC-MAP.md；commit「凍結規格測試」，hash 記入 PROGRESS.md | 規格測試可以編譯，數量為 10；此時測試失敗是正常的 |
| T1 | 實作 `core` 全部函式；撰寫 `verify.sh` | L1＋L2 全綠，10 個規格測試全部通過 |
| T2 | `app`：MainActivity（權限說明、開始／停止）、OverlayService（懸浮窗、拖曳、吸附、位置記憶、螢幕開關、通知與停止）、PetBridge、`assets/pet/index.html` 待機循環與泡泡 | L1＋L2 全綠 |
| T3 | `app`：SpeechBridge、BatteryLogger、匯出與分享 | L1＋L2 全綠 |
| T4 | `./verify.sh --full`；產出 MUTATION-REPORT.md、SECURITY-REPORT.md、RISK-REVIEW.md、ACCEPTANCE.md；APK 路徑寫入 ACCEPTANCE.md | V01～V17 全部通過 |

T0a 若發現缺檔，**停止並寫入 BLOCKERS.md，不要自行補寫**——那些內容屬於便宜批次。

### T2／T3 實作要點

- **角色頁 `index.html`**：優先載入 `frames/local/idle.png` 與 `blink.png`，載入失敗就改用 `placeholder-*.svg`。待機動畫＝CSS 上下呼吸（3 秒週期）＋每 4～6 秒切換到 blink 圖 150 毫秒。`setRender('paused')` 時暫停所有 CSS 動畫與計時器。`html, body` 背景為 `transparent`。
- **透明 WebView**：`setBackgroundColor(Color.TRANSPARENT)`，視窗格式 `PixelFormat.TRANSLUCENT`。
- **懸浮窗旗標**：`TYPE_APPLICATION_OVERLAY`，`FLAG_NOT_FOCUSABLE | FLAG_LAYOUT_NO_LIMITS`。泡泡顯示時，視窗寬度向角色內側擴張到可容納泡泡，泡泡收起時縮回角色大小。
- **拖曳**：移動中每次呼叫 `clampInScreen`；放開時呼叫 `snapToEdge` 並 `PositionStore.save`。移動距離 < 10px 視為點擊，交給網頁處理。
- **螢幕開關**：在服務內註冊 `ACTION_SCREEN_OFF`／`ACTION_SCREEN_ON`，事件經 `reduce` 後呼叫 `window.pet.setRender`。
- **語音**：麥克風權限只能在 MainActivity 請求。`onMicPressed` 時若無權限，`showText(MIC_DENIED_MESSAGE)`，不得嘗試啟動辨識。有權限時用 `SpeechRecognizer`，語言 `zh-TW`，結果以 `showText` 顯示。
- **耗電紀錄**：服務內以 `Handler` 依 `nextSampleTime` 排程取樣；螢幕關閉時**照常取樣**（見 §6.2）。樣本以附加方式寫入 `filesDir/battery-samples.csv`，不得整檔覆寫。
- **匯出**：`exportCsv` 寫到 `getExternalFilesDir("exports")`，再用 FileProvider 開啟分享選單。
- **通知**：頻道重要性 `IMPORTANCE_LOW`，含「停止」動作按鈕。

## 6. 驗收清單

### 6.1 自動驗收項【條款 5】

| # | 層 | 驗收項 | 判定方式 |
|---|---|---|---|
| V01 | L1 | A1：`core/src` 沒有 `import android.` 或 `import androidx.` | grep 結果為空 |
| V02 | L1 | A2：`core/src` 沒有 `java.net`、`okhttp`、`HttpURLConnection` | grep 結果為空 |
| V03 | L1 | A3：Manifest 不含 `android.permission.INTERNET` | grep 結果為空 |
| V04 | L1 | 規格測試未被改動【條款 7】 | `git diff --quiet <凍結 hash> -- core/src/test/kotlin/com/accompany/pet/spec/` 回傳 0 |
| V05 | L1 | spec 目錄有 10 個測試，S01、S02、S03、S07、S08、S09、S10、S13、S14、S15 各出現一次，且沒有 `@Ignore` | grep 計數 |
| V06 | L1 | 沒有憑證與私人素材被追蹤【條款 8】 | gitleaks（無法安裝時 grep `AIza`、`sk-`、`-----BEGIN`、`password=`）；`git ls-files` 不含 `*.jks`、`frames/local/*.png` |
| V07 | L1 | A4：`app/src` 中所有 `loadUrl(` 的參數都以 `file:///android_asset/pet/` 開頭，且 `shouldOverrideUrlLoading` 存在 | grep |
| V08 | L1 | A5：`@JavascriptInterface` 恰好出現 2 次 | grep 計數 |
| V09 | L1 | A6：`OverlayService.kt` 不含 `MATCH_PARENT` | grep 結果為空 |
| V10 | L1 | A7：Manifest 含 `specialUse` 與 `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` | grep |
| V11 | L2 | `./gradlew :core:test` 全部通過（含 10 個規格測試） | 回傳 0 |
| V12 | L2 | `./gradlew :app:compileDebugKotlin` 成功 | 回傳 0 |
| V13 | L3 | `./gradlew assembleDebug` 產出 APK | 回傳 0 且 `app/build/outputs/apk/debug/*.apk` 存在 |
| V14 | L3 | Android Lint 無 error 等級問題【條款 8】 | `./gradlew :app:lintDebug` 回傳 0（`abortOnError = true`，warning 不中斷） |
| V15 | L3 | 突變測試報告已產生，且範圍符合 §2.2【條款 9】 | 已執行：grep `core/permission` 出現在「執行範圍」；待補：grep「狀態：待補」與五個欄位，且 CHECKLIST.md 有對應項 |
| V16 | L3 | 高風險函式清單涵蓋 §2.1 全部模組【條款 10】 | RISK-REVIEW.md 存在，且 grep 到 `exportCsv`、`FilePositionStore`、`PetBridge`、`BatteryLogger` |
| V17 | L3 | SECURITY-REPORT.md 與 SPEC-MAP.md 存在 | 檔案存在 |

**禁止為了通過驗收而做的事**：修改 spec 目錄的任何內容、修改驗收標準、加 `@Ignore`、放寬斷言、
改弱 grep 條件、在 verify.sh 中吞掉失敗回傳碼、包裝例外以改變錯誤指紋。
確實無法通過的項目走 §0.3 的斷路器流程。

### 6.2 耦合驗收項【條款 3】

| 項目 | 與之衝突 | 衝突時的優先順序 |
|---|---|---|
| S10：螢幕關閉時停止動畫 | S14：服務運作期間每 15 分鐘記錄（含螢幕關閉時） | **S14 優先**：只暫停渲染，取樣計時器不得停止 |
| S07：放開時吸附到左右邊緣 | S08：角色必須留在上下邊界內 | **S08 優先**：吸附後的位置一律再經過 `clampInScreen` |
| S09：恢復上次位置 | S08：位置必須在螢幕內（換了解析度或轉向時） | **S08 優先**：讀出的位置先 clamp 再使用 |
| A6：懸浮窗只到角色大小 | S11：點角色要顯示泡泡 | **A6 優先**：泡泡顯示時視窗暫時擴張到「角色＋泡泡」，仍不得 `MATCH_PARENT` |
| 輔助測試 | 規格測試 | **規格測試優先**：修改輔助測試或實作，不得動 spec 目錄 |

### 6.3 移出自動層的項目【條款 4】

| 項目 | 為何無法自動判定 | 改為 |
|---|---|---|
| 透明背景、點擊穿透、拖曳手感、3 秒恢復、語音辨識、通知移除 | 需要實體手機與人眼 | DEVICE-CHECKLIST.md（CHEAP 批次已建立） |
| 8 小時耗電 | 需要實體手機與長時間 | DEVICE-CHECKLIST.md B 節 |
| 依賴套件稽核 | 需要連網與人工判斷 | CHECKLIST.md 已有項目 |
| 突變分數【條款 9】 | 分數不足要補測試，但規格測試已凍結 | MUTATION-REPORT.md，存活突變寫成建議新增的規格範例列 |
| Lint 的 warning 等級問題【條款 8】 | 常為誤報 | SECURITY-REPORT.md |

### 6.4 人工檢查清單
不得新增自動驗收項。其他想檢查的事項追加到 CHECKLIST.md。

## 7. 預設值表（不要為這些提問）

| 問題 | 預設值 |
|---|---|
| Kotlin、AGP、compileSdk、targetSdk 版本 | 沿用 Android Studio 範本產生的版本，不升級 |
| minSdk | 26 |
| app 原始碼資料夾 | 沿用範本的 `app/src/main/java/com/accompany/pet/`；`core` 是新模組，用 `core/src/main/kotlin/` |
| 專案名稱 | 沿用使用者建立的 `pet-maid`，文件中的「AccompanyPet」是產品名稱，不需要改專案名稱或資料夾名稱 |
| `core` 模組的 Kotlin JVM 外掛版本 | 與範本 `libs.versions.toml` 中的 Kotlin 版本相同 |
| 測試框架 | JUnit 4（範本已附） |
| 突變測試工具 | Pitest Gradle 外掛 `info.solidsoft.pitest`，`targetClasses` 只設 `com.accompany.pet.core.permission.*` |
| 可以下載什麼 | 只允許 Gradle 從 `google()`、`mavenCentral()`、`gradlePluginPortal()` 下載建置依賴；不得連線其他服務 |
| 角色大小 | 96dp × 108dp |
| 吸附邊距 | 8px（`EDGE_MARGIN_PX`） |
| 預設位置 | 右下：`x = 螢幕寬 − 角色寬 − 邊距`，`y = 螢幕高 × 0.65` |
| 點擊與拖曳的分界 | 移動 < 10px 視為點擊 |
| CSV 時區 | `Asia/Taipei` |
| 同一秒匯出兩次 | 第二個檔名加 `-1`，第三個加 `-2`，依此類推 |
| 位置檔 | `filesDir/pet-position.txt`，內容 `x,y`；讀取失敗或格式錯誤時回傳 null（使用預設位置） |
| 樣本檔 | `filesDir/battery-samples.csv`，只附加寫入 |
| 語音辨識是否強制離線 | 不強制（`EXTRA_PREFER_OFFLINE` 不設），由系統決定 |
| 從懸浮窗啟動麥克風失敗（Android 14+ 背景限制） | 泡泡顯示「目前無法使用麥克風，請打開 App 再試」，記錄在 BLOCKERS.md 與 DEVICE-CHECKLIST.md S12 的備註，不要嘗試繞過系統限制 |
| `index.html` 載入不到 local 圖 | 改用 placeholder SVG，不顯示錯誤 |
| 某套件在此環境安裝失敗 | 改用標準庫替代方案並記錄在 DECISIONS.md，不得降低安全性 |
| 兩種實作都合理 | 選較保守、較容易測試的那個 |
| §4.5 沒涵蓋的行為 | 選最保守的做法，記錄在 DECISIONS.md，並寫成建議新增的規格範例列 |
| 規格範例與 §4 介面衝突 | 不修改任何一方，寫入 BLOCKERS.md 標記「規格爭議」 |
| 突變測試工具無法執行 | 不得自製量測工具，不得安裝或執行替代品。唯讀搜尋 GitHub（最多 5 次、記錄最多 3 個候選：開源免費、支援 Kotlin／JVM 與 Windows、近 12 個月有更新、能指定範圍），MUTATION-REPORT.md 寫成「狀態：待補」並填齊欄位（未執行原因、預定範圍、程式版本、原工具補跑方式、替代品候選、搜尋紀錄），CHECKLIST.md 加「突變測試待補」項，PROGRESS.md 記一行 |
| gitleaks 無法安裝 | 改用 V06 列出的 grep 樣式，記錄在 DECISIONS.md，不得跳過 |
| verify.sh 在 Windows 的執行方式 | 用 Git Bash 執行；呼叫 `./gradlew`（範本附的 shell 版 wrapper） |

## 8. 絕對禁止事項

- 不得向使用者提問。
- 不得在 Manifest 加入 `INTERNET` 權限；不得連線任何外部服務。
  唯一例外：Gradle 建置依賴下載（見 §7），以及突變測試工具無法執行時唯讀瀏覽 GitHub。
- 不得建立含真實憑證或簽章金鑰的檔案。
- 不得在 log、錯誤訊息、或任何輸出中寫出憑證。
- 不得設遠端、不得 push。
- 不得刪除或覆蓋既有檔案；有衝突則將既有檔案改名為 `<原名>.bak` 保留。
- 不得把 `app/src/main/assets/pet/frames/local/` 的圖片加入 git。
- 不得新增 §4 以外的 `@JavascriptInterface` 方法。
- 不得在 WebView 啟用 `setAllowUniversalAccessFromFileURLs` 或 `setAllowFileAccessFromFileURLs`。
- 不得嘗試繞過 Android 的背景啟動或麥克風限制。
- 不得安裝與本計畫無關的套件。
- 不得執行 CHEAP-PLAN.md 的內容。
- T0b 之後不得修改 spec 目錄的任何檔案。
- 不得自製突變量測工具；不得 clone、下載、安裝或執行搜尋到的替代品。

## 9. 完成後的通知格式

    ✅ 貴批次完成，請查核。

    驗收結果：V01–V17 全部通過（或：通過 n 項，m 項未通過，詳見 BLOCKERS.md）
    規格測試：<n>/10 通過；規格爭議 <n> 項（詳見 BLOCKERS.md）

    成本摘要：
    | 階段 | 修正輪數 | 觸發過的錯誤指紋 |
    |---|---|---|
    | T1 | <n> | <n> 種 |
    | T2 | <n> | <n> 種 |
    | T3 | <n> | <n> 種 |
    | T4 | <n> | <n> 種 |
    合計修正輪數：<n>

    Commit 數：<n>
    APK 位置：app/build/outputs/apk/debug/<檔名>.apk

    需要你人工完成的事：
    1. 把 APK 裝到手機，照 DEVICE-CHECKLIST.md 實測（含 8 小時耗電）
    2. 讀 RISK-REVIEW.md 列出的高風險函式（共 <n> 個）
    3. 看 MUTATION-REPORT.md：範圍 core/permission，突變分數 <n>%，建議新增的規格範例 <n> 列
       （待補時改寫：突變測試待補，原因 <一句話>，候選替代品 <n> 個，見 CHECKLIST.md）
    4. 看 SECURITY-REPORT.md
    5. 掃一遍 CHECKLIST.md

    自主決策列在 DECISIONS.md，共 <n> 項。

## 10. 故意不做的事

- 不接 LLM、不接 Cloudflare、不接 FCM 推播
- 不做快速設定磚、遊戲偵測、提醒排隊（屬於 M1）
- 不做戒飲記錄、Todoist、台股（屬於 M2～M4）
- 不做 Inochi2D 即時渲染（M0 只驗證待機循環的耗電）
- 不做開機自動啟動
- 不做覆蓋率門檻（M0 是實測用的原型）
- 不做 release 簽章與上架設定
- 不擴充範圍；有建議寫進 DECISIONS.md 的「建議後續」段落，不要實作。
