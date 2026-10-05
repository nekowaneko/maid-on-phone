# M2 驗收結果（戒飲記錄 F1）

## 成本匯總

第二次以三條線平行開工（B 懸浮窗網頁、C Kotlin、D Worker），各自在自己的 git worktree 執行，最後由規劃者合併。三條線 19:44 同時開工。

| 線 | 實際時間 | 修正輪數 | 錯誤指紋 | 備註 |
|---|---|---|---|---|
| B 懸浮窗網頁 | 約 4 分鐘 | 1 | 1 種（`6e399546ec7f`，V27） | 輔助測試直接比對 vm 另一個執行環境建立的陣列，改成先轉成一般資料再比對；實作沒改 |
| C Kotlin | 約 10 分鐘 | 1 | 1 種（`802d2c9ca582`，V11） | 撞到 M0 凍結的 S15（見下方「規格爭議」） |
| D Worker | 約 12 分鐘 | 0 | 0 | 第一次就全綠 |
| 整合 | 約 20 分鐘 | 0 | — | 三次合併都沒有衝突；修好 Stryker 指令與 V18；`--full` 第一次就全綠 |

合計修正輪數：2。三條線用的 token 約 12 萬（B）、18 萬（C）、22 萬（D）。

## 自動驗收

`./verify.sh --full`：V01～V29 全部通過（2026-10-05 20:14）。

- 規格測試：M2 Worker 15 列（S01～S12、S14～S16）、網頁 4 列（S02-B、S04-B、S11-B、S16-B）、Kotlin 1 列（S13），全部通過。M0～M1.6 的規格測試照樣通過
- backend 測試共 454 個，全部通過；core 測試全部通過
- 突變測試：見 MUTATION-REPORT.md 的 M2 段落。`backend/core/drink.js` 有 3 類非等價的存活突變，建議新增 3 列規格（M2-S17～S19），等使用者確認
- `wrangler deploy --dry-run`：Worker 打包成功（有 `.md` 文字規則、每小時排程、D1 綁定）

## 整合時處理的事

| 項目 | 來源 | 處理 |
|---|---|---|
| Stryker 的 `tests/spec/m2/*.test.js` 會一起跑 `overlay-drink.test.js`，後者讀 backend 以外的檔案，在沙盒裡失敗 | 計畫書 §2.2 | `stryker.config.json` 改成只跑 `tests/spec/m2/drink.test.js` |
| V18 抓不到 `HttpsURLConnection`、`openConnection`、`import java.net.URL` | C 線回報 | V18 改成：`WorkerApi.kt` 以外，只要出現 `java.net.`、`HttpURLConnection`、`HttpsURLConnection`、`openConnection` 就失敗。已用會觸發的輸入實際跑過 |
| Pitest 範圍 | 計畫書 §2.2 | `core/build.gradle.kts` 加上 `com.accompany.pet.core.drink.*` |
| `thinking(true)` 不會自己打開泡泡 | B 線回報 | 確認 C 線的 `OverlayService.thinking` 在 `true` 時會打開泡泡，不用改 |
| 設定畫面送數字欄位 | D 線回報 | 確認 `DrinkSettingsActivity` 送的是 JSON 數字，不用改 |

## 規格爭議（等使用者決定）

- **M0 的 S15 和 M2 的 A12 修訂衝突**：S15 不准 `app/src/main` 出現 `HttpURLConnection`、`java.net.URL(`，沒有排除 `WorkerApi.kt`。C 線沒有改測試，而是改用 `javax.net.ssl.HttpsURLConnection`：只能走加密連線，安全上更嚴，但字面上也繞過了 S15。V18 已經擋住其他檔案用同樣的寫法。
  - 選項一：接受目前的寫法，把 S15 改成比照 V18 排除 `WorkerApi.kt`，並把 `HttpsURLConnection` 也列為禁用字，然後重新凍結。
  - 選項二：維持現狀，S15 不動。

## 規格範例表對照

| 編號 | 驗證 | 結果 |
|---|---|---|
| M2-S01～S12、S14～S16 | 自動（JS，Worker） | 通過（S01～S04、S07、S11、S12 另需手機） |
| M2-S02-B、S04-B、S11-B、S16-B | 自動（JS，網頁） | 通過 |
| M2-S13 | 自動（Kotlin） | 通過（另需手機） |
| 語言模型解析準不準、台詞語氣、D1 實際寫入、排程準時觸發、通知按鈕、設定畫面 | 手機 | 待實測（DEVICE-CHECKLIST-M2.md） |

## 產出

- APK：`app/build/outputs/apk/debug/app-debug.apk`
- Worker：`backend/`（新的 `drink_logs` 表、`/api/drink/*`、每小時排程）

## 需要使用者完成的事

1. 套用新的 D1 schema，重新部署 Worker（照 docs/WORKER-SETUP.md 第 8 節；密鑰相關一律用 Git Bash 或 cmd）
2. 確認 `worker.properties` 的 `apiSecret` 和 Worker 的 `APP_SECRET` 相同，再把 APK 裝到手機
3. 照 DEVICE-CHECKLIST-M2.md 實測
4. 決定上面的「規格爭議」，以及要不要加 M2-S17～S19
5. 讀 RISK-REVIEW.md 的 M2 段落（第 38～54 項）

## 實機結果（2026-10-05，無線偵錯安裝）

- M2-S01～S03 通過：說飲料 → 複述 450 大卡；改甜度選微糖 → 重新複述；記下來 → 本週 1 杯、回本 0%（還沒有「沒喝」，符合規格）
- 「沒喝」：當天已記過喝了，回「今天已經記過了」，符合 §7.1 Q7
- 實測時修正三件事：
  1. App 讀取逾時 15 秒 → 45 秒：parse 呼叫語言模型 2～3 次，實測 14～29 秒（`528ed20`）
  2. 泡泡放不下台詞和按鈕：泡泡最高改 240dp（視窗跟著長高，角色位置不動，靠近頂端時往下長），只有台詞區捲動，按鈕固定在泡泡底部
  3. 線上 D1 沒有 `drink_logs` 表（之前套 schema 時目錄不對而失敗），confirm 回 500；重新套用 schema 後正常
- DEVICE-CHECKLIST-M2.md 其餘項目尚待實測
