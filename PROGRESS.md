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
