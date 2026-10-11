# 進度與成本紀錄

每階段記錄修正輪數、錯誤指紋、各驗收項失敗次數。

## T0a
- CHEAP 產出 12 個檔案全部存在且非空。

## T0b
- 凍結規格測試 commit：`9f5111379052d49416ab4233dc27142c407863cc`
- 修正輪數：1；錯誤指紋：`fp-pitest-reporting-basedir`（Pitest 1.15.0 與 Gradle 9 不相容，改版本後解決）

## T1
- 修正輪數：1（verify.sh 自身的 V06 grep 經 xargs 回傳碼誤判為通過，改為檢查輸出內容）
- 錯誤指紋：無（非建置錯誤）
- 驗收項失敗次數：全部 0

## T2
- 修正輪數：2
- 錯誤指紋：`fp-v06-decisions-pattern`（DECISIONS.md 文字本身含掃描樣式，改寫敘述）、`fp-unresolved-servicecompat-startforeground`（core-ktx 1.10.1 沒有此 API，改用 Service.startForeground 搭配 SDK 判斷，不升級套件）
- 驗收項失敗次數：V06 ×1、V12 ×1

## T3
- 修正輪數：0
- 錯誤指紋：無
- 驗收項失敗次數：全部 0

## T4
- `./verify.sh --full` 一次全綠；修正輪數 0；錯誤指紋無
- Pitest 初次只用 permission 套件內的測試（0% 覆蓋），補設 `targetTests = com.accompany.pet.*` 後 1/1 殺死

## M1

### T0a
- M1 便宜批次的產出檔案全部存在且非空。

### T0b
- 凍結 M1 規格測試 commit：`4f9208aa29cd471cd64f499f1bbe86bc1db492d5`（M0 10 個＋M1 14 個，共 24 個）
- 修正輪數：0；錯誤指紋：無

### T1
- 修正輪數：2（皆為 verify.sh／腳本自身問題，非建置錯誤）
- 錯誤指紋：`fp-v02-spec-forbidden-words`（V02 掃到凍結的 S15 所列的禁用字串，改為排除 spec 目錄）；`fp-bash-syntax-eof`（修改 V02 時註解吃掉了 fail，修正）
- 驗收項失敗次數：V02 ×1
- `./verify.sh --core-only` 全綠，24 個規格測試通過

### T2
- 修正輪數：1
- 錯誤指紋：`fp-kts-unresolved-java-util`（build.gradle.kts 內 `java` 被當成 Gradle 的 java 擴充，改用 `import java.util.Properties`）
- 驗收項失敗次數：V11 ×1（Gradle 腳本編譯失敗連帶）

### T3
- 修正輪數：0；錯誤指紋：無；驗收項失敗次數：全部 0

### T4
- `./verify.sh --full` 一次全綠；修正輪數 0；錯誤指紋無
- M1 合計修正輪數 3（T1 兩輪、T2 一輪），匯總表見 ACCEPTANCE-M1.md

## M1.5

### T0a
- M1.5 便宜批次 §2 的產出檔案全部存在且非空；README.md、docs/ARCHITECTURE.md、CHECKLIST.md 都含「M1.5」。
- 開工時工作區只有 `.idea/` 未追蹤，不需另外 commit。

### T0b
- 凍結 M1.5 規格測試 commit：`c119cfe56128d03e00dc983d6c8f7b484f2df8df`（Kotlin 28 個＝M0 10＋M1 14＋M1.5 4；JS 9 個）
- 骨架狀態：JS 規格 9 個中 S01、S03 已通過（授權沿用既有中介、wrangler.toml 已由便宜批次設定），其餘 7 個因「尚未實作」失敗；Kotlin 規格可編譯。
- 修正輪數：0；錯誤指紋：無

### T1
- 修正輪數：1
- 錯誤指紋：`fp-b41341f6f5fc`（`java.lang.AssertionError / Assert.fail / Assert.assertTrue`，M15-S13 找不到 `id="chat"`：按鈕原排在 T3，改為在 T1 先加入 index.html 的「聊聊」按鈕）
- 驗收項失敗次數：V11 ×1；其餘 0
- 結果：L1＋L2 全綠；Kotlin 規格 28/28、JS 規格 9/9、backend 共 295 個通過

### T2
- 修正輪數：0；錯誤指紋：無；驗收項失敗次數：全部 0
- 結果：L1＋L2 全綠；backend 共 306 個通過（新增 fcm-client 輔助測試 11 個）

### T3
- 修正輪數：0；錯誤指紋：無；驗收項失敗次數：全部 0
- 結果：L1＋L2 全綠（V07、V08 修訂版與 V25 一併加入 verify.sh）

### T4
- 執行 `--full` 前：依 Pitest／Stryker 的存活突變補了 4 個輔助測試、移除 `push.js` 的多餘型別判斷（非驗收失敗）
- `./verify.sh --full` 一次全綠（V01～V26）；修正輪數 0；錯誤指紋無
- M1.5 合計修正輪數 1（T1），匯總表見 ACCEPTANCE-M1.5.md

## M1.6

### T0（規劃者）
- 便宜批次 `8a4eac2`；凍結規格測試 `fbda387`（Kotlin 6 列、JS 8 列）；`verify.sh` 加 `--lane`、V27、V28 `b6e3c88`
- 凍結前以草稿實作確認角色頁 6 個規格測試可被滿足，草稿已刪除

### 平行三條線（各自的完整紀錄在 lanes/M1.6-B.md、M1.6-C.md、M1.6-D.md）

| 線 | 修正輪數 | 錯誤指紋 | 各驗收項失敗次數 |
|---|---|---|---|
| B 角色頁 | 0 | `5e3838ab558d`（V28，verify.sh 本身的缺陷，斷路器停下） | V28：2 |
| C Kotlin | 1 | `2db8780e1929`（寫檔時換行跳脫錯誤） | V11：1 |
| D Worker | 0 | 無 | 無 |

### T4（規劃者整合）
- 修正 verify.sh 第 118 行 sed 替換字串誤成 0x01 位元組（B 線回報，`80f0d9d`）；worktree 準備腳本不再產生 package-lock.json（`4878f0a`）
- 依序合併 D、C、B，三次合併皆無衝突
- `./verify.sh --full` 第一次停在 V16（RISK-REVIEW.md 尚未寫 M1.6 段落，屬整合工作）；補齊報告後重跑

### 實機（2026-10-04）
- 以無線偵錯安裝 APK；表情與換臉時機正確（M16-S10）
- 使用者看過後覺得換臉太快（pout 只停 0.69 秒），決定每字 0.08 秒＋句尾停 0.5 秒；重新凍結 M16-S10、S12（`7b7e6de`），`./verify.sh --full` 全綠，重新安裝
- Worker B 部署後以 cmd（curl＋UTF-8 檔案）送帶表情推播成功；之前的 `error code: 1042` 是指令網址仍為範例的 `xxx`
- App 圖示改用 pout 表情（debug 來源集，不進 git）
- 平行分派代理人的流程整理成 docs/PARALLEL-AGENTS.md（本專案的里程碑）

## M2

### T0（規劃者，2026-10-05）
- 交接文件與計畫書 `f797ee6`；規格範例表 S01～S16、預設值表經使用者確認 `0207b41`
- 便宜批次 `4d4e097`、`d900dc0`；凍結規格測試 `592f89e`；`verify.sh` 換成 M2 範圍（V29）`862196d`

### 平行三條線（完整紀錄在 lanes/M2-B.md、M2-C.md、M2-D.md）

19:44 同時開工。

| 線 | 時間 | 修正輪數 | 錯誤指紋 | 各驗收項失敗次數 |
|---|---|---|---|---|
| B 懸浮窗網頁 | 約 4 分鐘 | 1 | `6e399546ec7f`（輔助測試比對跨執行環境的陣列） | V27：1 |
| C Kotlin | 約 10 分鐘 | 1 | `802d2c9ca582`（M0 的 S15 和 A12 修訂衝突，規格爭議） | V11：1 |
| D Worker | 約 12 分鐘 | 0 | 無 | 無 |

### T4（規劃者整合）
- 依 D、C、B 的順序合併，三次都沒有衝突
- V18 加嚴（`java.net.`、`HttpsURLConnection`、`openConnection`），已用會觸發的輸入實際跑過；Pitest 範圍加 `core.drink`；Stryker 改成只跑 `spec/m2/drink.test.js`（`overlay-drink.test.js` 在沙盒裡讀不到角色頁）
- `wrangler deploy --dry-run` 打包成功
- `./verify.sh --full` 第一次就全綠（backend 454 個測試）；寫 ACCEPTANCE-M2、RISK-REVIEW（第 38～54 項）、MUTATION-REPORT 的 M2 段落
- 等使用者處理：S15 規格爭議；建議新增的 M2-S17～S19；部署與手機實測

## M4（盤前均線 F3，2026-10-10）

- 規格範例表 S01～S17 使用者確認；介面做 C 版（報告＋追蹤清單＋近 7 日歷史＋看懂排列）；明細頁用 Worker B 網頁
- 三條線被提早啟動（未凍結規格測試、未開 worktree）；整合時先凍結規格測試（`14dad69`，修訂後 `0e1e3fe`），再把凍結版本合併進三條分支補驗
- 補驗發現並修正：D 的 M4-S11（重複訊息缺名稱）、M4 規格的 script 載入順序與 M3R-S19 衝突、V06／V36／V07 的誤判
- 依 D → C → B 合併，零衝突；新增 `ma-wiring.test.js`；`./verify.sh --full` 全綠（backend 551 個測試）
- 寫 ACCEPTANCE-M4、RISK-REVIEW（第 55～65 項）、MUTATION-REPORT 的 M4 段落
- 等使用者處理：部署與手機實測；是否採用建議新增的 M4-S18～S22
- 採用 M4-S18～S22（凍結 `ec20954`），只有 S21 需改 `core/ma.js`；`--full` 重跑全綠（backend 556 個測試）
- 已部署 Worker `pet-maid-api`（版本 a3edac81）並對遠端 D1 套用 schema（三張 ma_ 表）；等使用者手機實測
## M4.1

### T0a
- CHEAP 產出 10 個檔案全部存在且非空，契約含 exitUrl。

### T0b
- 凍結規格測試 commit：`820fdf61afe8ad8d2e85f2e6782214f45cdf31eb`（Kotlin 10 個、JS 2 個，總計 Kotlin 48 個規格測試）。
- 修正輪數：0；錯誤指紋：無。

### T1
- 實作 `MaEntry.kt`、`MaModels.kt` 追加與輔助測試 `MaEntryHelperTest.kt`。
- 修正輪數：0；錯誤指紋：無。
- 驗收項失敗次數：全部 0。
- `./verify.sh --stage 1` 全綠（Kotlin 規格測試 48/48 全部通過）。

### T2
- 實作 `ma-render.js`（`decideBack`、`MA_EXIT_URL`）、`ma.js`（改用 `decideBack` 與 `MA_EXIT_URL`），以及 W-A 契約測試 `ma-entry-contract.test.js`。
- 修正輪數：0；錯誤指紋：無。
- 驗收項失敗次數：全部 0。
- `./verify.sh --stage 2` 全綠（backend 通過 561 個測試，含 2 個 JS 規格測試與 3 個 W-A 測試）。

### T3
- 實作原生 App 主畫面：更新 `activity_main.xml`（加入 `cardMaEntry`、`cardChatEntry`，麥克風單獨一排，移除 `cardChatQuick` 與 `tvChatStatus`）。
- 實作 `MainActivity.kt`（元件綁定、點擊監聽、`onResume` 呼叫 `refreshMaEntry()`、依狀態碼顯示副標）。
- 實作 `MaActivity.kt`（`MaWebViewClient.shouldOverrideUrlLoading` 攔截 `isMaExitUrl` 呼叫 `finish()`）。
- 修正輪數：1（`MainActivity.kt` 初版呼叫 `maEntrySubtitle` 簽名不符，修正為 `MaFetch` 列舉並傳入狀態碼與摘要）。
- 錯誤指紋：`fp-v12-mafetch-signature`。
- 驗收項失敗次數：V12 ×1。
- `./verify.sh --stage 3` 全綠（通過 V39、V40、V41、V42、V43、V11、V12、V26、V27、V44、V45）。

### T4
- `./verify.sh` 全項檢查（L1 結構與安全 33 項 + L2 單元測試與編譯 7 項）一次全綠。
- 確認接線三要件：
  1. `onResume` 在 `refreshUi()` 之後呼叫 `refreshMaEntry()`，回到主畫面自動更新副標。
  2. 點擊 `cardMaEntry` 正確開 `MaActivity`，且無 `FLAG_ACTIVITY_NEW_TASK` 與 `finish()`。
  3. 明細頁返回 `exitUrl`（`ma-exit://close`）在契約、`MaModels.kt`、`ma-render.js`、`ma.js` 與 `MaActivity.kt` 攔截完全一致。
- 修正輪數：0；錯誤指紋：無；驗收項失敗次數：全部 0。



## M4.2

### T0a
- 便宜批次產出全部存在且非空：`call.json`（含 exitUrl 與 displayName）、7 張表情圖、`DEVICE-CHECKLIST-M4.2.md`、CHECKLIST.md 的 `## M4.2`、ARCHITECTURE.md 的 M4.2 段落、`design/prototype/` 五個檔案；wish28-pet-spec.md 末尾有「M4.2：聊天頁視訊版」驗收段落（字面沒有「M4.2 驗收」四字，見 DECISIONS.md 65）。
- V55 基準：`style.css` 在 `:root` 區塊以外的十六進位色碼數量為 **2**（兩個 `#ffffff`）。

### T0b
- 凍結 hash：`19f82711d6609342ec45a72a23ee7571b94d9985`（commit「凍結 M4.2 規格測試」），已填入 `verify.sh` 的 `FROZEN_HASH`。
- 規格測試 14 個：JS 13（`backend/tests/spec/m42/call.test.js`）、Kotlin 1（`M42SpecTest.kt`）；S06、S14 標手機實測（SPEC-MAP.md）。
- `verify.sh`：V04 改新 hash；V05 改 49 個 Kotlin 規格測試並加 M42 列；V26 下限 511；新增 V47～V58（V59 留到 T4）。
- 起跑狀態：`./verify.sh` 的 L1 停在 V47（`Chat.kt`、`call-state.js` 還沒有 `CHAT_EXIT_URL`）；V48～V53 對真實專案逐條跑，失敗原因都是模組或網頁尚未實作；V54、V55 已通過。JS 規格測試因 `call-state.js`、`blink.js` 不存在而匯入失敗、Kotlin 因 `isChatExitUrl` 不存在而編譯失敗，屬正常。
- 新檢查用觸發輸入驗證：好樣本全過，35 種壞輸入（改值、缺 id、巢狀錯、寫死文字、catch 內設 live、清除紀錄、假位元組、色碼超量等）全部被抓到。
- 修正輪數：0；錯誤指紋：無；驗收項失敗次數：全部 0。
