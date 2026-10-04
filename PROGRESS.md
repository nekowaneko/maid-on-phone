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
