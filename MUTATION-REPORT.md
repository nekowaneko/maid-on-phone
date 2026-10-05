# 突變測試報告

- 狀態：已執行
- 工具：Pitest（Gradle 外掛 `info.solidsoft.pitest` 1.19.0），執行指令 `./gradlew :core:pitest`
- 執行範圍：`core/permission`（`core/src/main/kotlin/com/accompany/pet/core/permission/`，`targetClasses = com.accompany.pet.core.permission.*`）
- 使用的測試：`com.accompany.pet.*`（spec 規格測試＋helper 輔助測試，共 20 個）
- 原始報告：`core/build/reports/pitest/index.html`、`mutations.xml`（建置產物，不進 git）

## 結果

| 項目 | 數值 |
|---|---|
| 產生突變 | 4 |
| 被殺死 | 4 |
| 存活 | 0 |
| 無覆蓋 | 0 |
| 突變分數 | 100% |

| 突變 | 位置 | 結果 | 殺死它的測試 |
|---|---|---|---|
| 條件反轉（NegateConditionals） | `Permission.kt:11` `decideStart` | 已殺死 | `S01 還沒授權懸浮窗時按開始會顯示權限說明而不是角色` |

## 說明

- `MIC_DENIED_MESSAGE` 是編譯期常數，會被內嵌到呼叫端，Pitest 不會對它產生突變；它的正確性由規格測試 S02 的字串完全比對保證。
- Pitest 提示 Kotlin 專用外掛（Arcmutate，商業授權）不存在，未安裝（計畫禁止安裝無關套件）。

## 建議新增的規格範例列

無存活突變，因此 0 列。（`decideStart(true) → START_OVERLAY` 目前只有輔助測試涵蓋，若要納入規格可新增：「已授權懸浮窗後按開始 → 直接出現角色，不顯示說明」。）

## M0.5 更新（2026-10-03）

範圍新增 `permission/Restore.kt` 的 `decideRestore`，突變共 4 個、全部被殺死（100%）。
殺死 `decideRestore` 突變的是輔助測試 `RestoreTest`（八種組合），規格測試尚未涵蓋，建議新增規格範例列：
「使用者按停止後，角色被系統收掉也不會自動跑回來」。

> 2026-10-03：`decideRestore` 已隨定時巡邏刪除，突變範圍回到 `decideStart`（1 個突變，已殺死）。

## M1（執行範圍：`core/permission`＋`core/reminder`）

- 狀態：已執行，指令 `./gradlew :core:pitest`，使用 `com.accompany.pet.*` 全部測試（規格 24 個＋輔助測試）
- 結果：產生 86 個突變，殺死 80 個，存活 6 個，無覆蓋 0 個，突變分數 93%；行覆蓋 97/101（96%）

| 存活突變 | 位置 | 判斷 |
|---|---|---|
| `Intrinsics.checkNotNullExpressionValue` 被移除（3 個） | `Stores.kt` 的 Base64／檔案讀取附近 | 等價突變：Kotlin 編譯器自動插入的空值檢查，移除後行為相同 |
| `file.parentFile?.mkdirs()` 條件反轉（3 個，第 49、84、116 行） | `Stores.kt` 三個 File 版 store 的 `save`／`add` | 等價突變：目錄已存在時有沒有建立目錄結果相同（測試用資料夾本來就存在） |

## 建議新增的規格範例列

無存活的非等價突變，因此 0 列。（可考慮：「寫入尚不存在的資料夾下的檔案時會自動建立資料夾」，目前只有 App 實機行為涵蓋。）

## M1.5（執行範圍：`core/permission`＋`core/reminder`＋`core/chat`＋`backend/core/push.js`）

- 狀態：已執行
- Kotlin：Pitest，指令 `./gradlew :core:pitest`，`targetClasses` 為 `core.permission.*`、`core.reminder.*`、`core.chat.*`，使用 `com.accompany.pet.*` 全部測試（規格 28 個＋輔助測試）
- JavaScript：Stryker（`npx --yes @stryker-mutator/core@10.0.0 run`，設定檔 `backend/stryker.config.json`，`mutate: ["core/push.js"]`，command runner 跑 `tests/spec/m15/push.test.js` 與 `tests/push-helper.test.js`）；原始報告 `backend/reports/mutation/`（不進 git）

### Pitest 結果（Kotlin）

| 範圍 | 突變 | 殺死 | 存活 | 無覆蓋 |
|---|---|---|---|---|
| `core/permission` | 1 | 1 | 0 | 0 |
| `core/reminder` | 85 | 79 | 6 | 0 |
| `core/chat` | 55 | 44 | 8 | 3 |
| 合計 | 141 | 124 | 14 | 3 |

突變分數 88%；行覆蓋 97%。`core/reminder` 的 6 個存活與 M1 相同（等價突變，見上方 M1 段落）。

| `core/chat` 未殺死的突變 | 位置 | 判斷 |
|---|---|---|
| `Intrinsics.checkNotNullExpressionValue` 被移除（7 個） | `Chat.kt` 的 `parseOrigin`（`substring`、`lowercase` 的回傳值） | 等價突變：Kotlin 編譯器插入的空值檢查，這些標準庫呼叫不會回傳 null |
| `colon < 0` 改成 `colon <= 0`（第 36 行，決定埠號的分支） | `parseOrigin` | 等價突變：`colon == 0` 代表主機為空，前一行已經回傳 null，走不到這裡 |
| `Origin` 的 `getScheme`／`getHost`／`getPort` 無覆蓋（3 個） | `Chat.kt` 第 15 行 data class | 編譯器產生的取值函式，程式只用 data class 的 `equals` 比對，不呼叫取值函式 |

T4 前曾有 3 個非等價存活（`sep <= 0` 邊界、`colon < 0` 決定主機的邊界、埠號 `> 5` 位數邊界），已在 `ChatHelperTest` 補「scheme 為空」「主機為空但有埠號」「五位數埠號」三個測試殺死。

### Stryker 結果（`backend/core/push.js`）

| 突變 | 殺死 | 存活 | 無覆蓋 | 突變分數 |
|---|---|---|---|---|
| 71 | 70 | 1 | 0 | 98.59% |

| 存活突變 | 位置 | 判斷 |
|---|---|---|
| `catch (error) { return null }` 改成 `catch (error) {}` | `push.js` 的 `parseAccount` | 等價突變：回傳 `undefined` 與 `null` 在下一步 `account?.[field]` 的結果相同，都判定未設定 |

首次執行有 5 個存活（`parseAccount` 內多餘的型別判斷），已把多餘判斷移除並在 `push-helper.test.js` 補「不是字串的輸入（陣列）」測試。

### 建議新增的規格範例列

無存活的非等價突變，因此 0 列。（可考慮：「聊天網址寫成 `https://別的網站@Worker B 網址` 時當作沒有設定」，目前只有輔助測試涵蓋。）

## M1.6

- 執行範圍：`core/permission`、`core/reminder`、`core/chat`（Pitest）；`backend/core/push.js`（Stryker，`commandRunner` 追加 `tests/spec/m16/push.test.js tests/push-script.test.js`）。範圍與 M1.5 相同，未擴大。
- 程式版本：整合 commit（合併 B 線之後）；規格測試凍結 commit `fbda387`。

| 範圍 | 突變 | 殺死 | 存活 | 無覆蓋 |
|---|---|---|---|---|
| `core/reminder` | 106 | 100 | 6 | 0 |
| `core/chat` | 55 | 44 | 8 | 3 |
| `core/permission` | 1 | 1 | 0 | 0 |
| `backend/core/push.js` | 82 | 81 | 1 | 0 |

- `core/reminder` 的 6 個存活與 M1 相同（`Intrinsics` 空值檢查 3 個、`file.parentFile?.mkdirs()` 條件反轉 3 個，行號因新增程式往下移），皆為等價突變。M1.6 新增的 `pickScript`、`reportScript`、4 欄讀寫沒有存活突變。
- `core/chat` 與 M1.5 相同（未改動）。
- `push.js` 的 1 個存活與 M1.5 相同（`parseAccount` 的 `return null` 被移除，等價）。M1.6 新增的 `buildPushData` 沒有存活突變。
- 角色頁的 `performance.js` 不在突變範圍（§2.2 未列；Stryker 的 `mutate` 只能指 `backend/` 內的檔案）。

### 建議新增的規格範例列

無存活的非等價突變，因此 0 列。

## M2

- 執行範圍：`core/permission`、`core/reminder`、`core/chat`、`core/drink`（Pitest，`targetClasses` 加上 `com.accompany.pet.core.drink.*`）；`backend/core/push.js`、`backend/core/drink.js`（Stryker）。
- Stryker 的 `commandRunner` 改成跑 `tests/spec/m2/drink.test.js`，不用計畫書寫的 `tests/spec/m2/*.test.js`。原因是同目錄的 `overlay-drink.test.js` 會讀 `backend/` 以外的角色頁檔案，Stryker 的沙盒裡沒有這些檔案，初始執行會有 4 個測試失敗。角色頁本來就不在突變範圍。
- 程式版本：整合 commit（合併 B 線之後）；規格測試凍結 commit `592f89e`。

| 範圍 | 突變 | 殺死 | 存活 | 無覆蓋 |
|---|---|---|---|---|
| `core/drink`（新增） | 68 | 59 | 8 | 1 |
| `core/reminder` | 107 | 101 | 6 | 0 |
| `core/chat` | 55 | 44 | 8 | 3 |
| `core/permission` | 1 | 1 | 0 | 0 |
| `backend/core/push.js` | 85 | 84 | 1 | 0 |
| `backend/core/drink.js`（新增） | 565 | 500＋逾時 2 | 63 | 0 |

- `core/reminder`、`core/chat`、`push.js` 的存活與 M1.6 相同，都是等價突變。M2 在 `push.js` 新增的 `actions` 參數沒有存活突變。
- `core/drink` 的 8 個存活：
  - `Intrinsics` 空值檢查 4 個：等價突變。
  - `parseDrinkActions` 把 `emptyList()` 換成 `Collections.emptyList` 1 個：等價突變。
  - `isPlainAuthority` 第 48 行的邊界 3 個（埠號最多 5 位、`'0'..'9'`）：不是等價突變，測試沒有涵蓋 6 位數的埠號。
  - 沒有覆蓋的是 `PUSH_ACTIONS` 的 getter，只是常數。
- `backend/core/drink.js` 的 63 個存活，分類如下：
  - 等價或防禦性寫法，約 50 個：
    - 模型或清單缺漏時的 `?.`、`Array.isArray` 後備值（`OptionalChaining` 23 個、`ArrayDeclaration` 6 個）。設定檔是固定的，走不到這些分支。
    - 提示詞裡的標題字串（`StringLiteral`，第 395～403 行）。
    - `parseLlmJson` 的掃描邊界（第 129～150 行），結果相同。
    - `shouldAsk` 第 380 行：`askHour` 是 `null` 時，`hour !== askHour` 本來就成立。
    - `statsOf` 第 271 行的 `date <= todayKey`：不會有未來日期的紀錄。
    - `canResist` 第 291 行的 `log.type === RESIST_TYPE`：紀錄只有「喝了」和「沒喝」兩種，「喝了」在前一個條件就已經擋下。「不同時段可以再按」由 M2-S08 涵蓋，整合時手動把 `log.slot === slot` 換成 `true`，M2-S08 確實會失敗。
  - 不是等價突變，測試沒有涵蓋：
    1. `DATE_KEY_PATTERN`、`ASK_TIME_PATTERN` 的 `^`、`$` 錨點（第 44、45 行）：拿掉後，設定 `askTime` 時「`15:00x`」「`115:00`」這類值也會通過驗證。
    2. `normalizeToppings` 第 96 行：配料編號是空字串或不是字串時的過濾。
    3. `isPlainObject` 第 80 行的 `typeof value === 'object'`：拿掉後，字串或數字也會被當成物件。

### 建議新增的規格範例列

以下 3 列要先給使用者確認，再加入下一版凍結規格。

| 建議編號 | 輸入 | 期望 |
|---|---|---|
| M2-S17 | `PUT /api/drink/settings` 的 `askTime` 是 `15:00x` 或 `115:00` | 回 400，五個欄位都不寫入 |
| M2-S18 | 解析結果的 `toppingIds` 是 `["", 3, "boba"]` | 只留下 `boba` |
| M2-S19 | `apiOrigin("https://example.com:123456")` | 回 `null` |
