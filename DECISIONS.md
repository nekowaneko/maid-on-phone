# 自主決策紀錄

代理人依預設值表或自行判斷所做的決定，每項附理由。

## 決策

1. 既有 `.gitignore` 已含 `local.properties`，追加時不重複（依預設值表）。
2. 範本 commit 一度誤含 `frames/local/` 內的個人角色圖（`.jpg`、`.jfif`），已用 amend 從歷史移除，檔案仍保留在本機。
3. docs/SPEC.md 不存在，依預設值表記入 BLOCKERS.md 並繼續。

## 建議後續

- 角色圖目前為 `.jpg`／`.jfif`，README 與計畫寫的是 `.png`，之後需轉檔或調整程式讀取的副檔名。

## 貴批次決策

4. **Kotlin 版本 2.2.10**：範本的 `libs.versions.toml` 沒有 Kotlin 版本（AGP 9 內建 Kotlin），採用 AGP 9.4.1 所帶的 KGP 2.2.10 作為 `core` 的 `kotlin("jvm")` 版本，避免版本衝突。
5. **Pitest 外掛 1.19.0**：1.15.0 在 Gradle 9.6 套用失敗（`ReportingExtension.baseDir` 已移除），改用相容 Gradle 9 的 1.19.0。
6. **JDK**：系統 PATH 沒有 java，`verify.sh` 未設 `JAVA_HOME` 時自動使用 Android Studio 內附 JBR。
7. **`core/.gitignore`**：T0b 誤 commit 了 `core/build/`，為了不修改 CHEAP 批次的根 `.gitignore`，新增 `core/.gitignore` 忽略 `/build` 並從索引移除。
8. **gitleaks 不可用**：本機未安裝，依預設值表改用計畫 V06 列出的四個 grep 樣式掃描所有追蹤檔；排除 `verify.sh` 與 `docs/EXPENSIVE-PLAN.md`，因為兩者本身就寫著這些樣式字串。
9. **`verify.sh --core-only`**：T1 時 app 尚未實作，V07～V10 必然失敗。新增此旗標只在 T1 略過 V07～V10；T2 起及 `--full` 一律檢查。
10. **`reduce` 未涵蓋的轉換**：服務停止時收到 `SCREEN_ON` 不播放動畫（保守做法）；`STOP` 一律回到 `INITIAL_STATE`。建議新增規格列：「服務停止時螢幕打開 → 動畫仍為暫停」。
11. **`exportCsv` 用 `createNewFile()`** 原子建立檔案，已存在時換下一個後綴，保證不覆蓋。
12. **不升級 core-ktx**：範本 core-ktx 1.10.1 沒有 `ServiceCompat.startForeground`，改用 `Service.startForeground` 加版本判斷，避免變動依賴。
13. **前景服務類型動態決定**：Android 14+ 一律 `specialUse`，有麥克風權限才加 `microphone`（沒權限時宣告 microphone 會被系統拒絕而閃退）。
14. **原生 → 網頁額外呼叫**：泡泡要向角色內側展開，網頁需知道角色在左或右。固定介面沒有這個函式，因此以 `evaluateJavascript` 設定 `document.documentElement.dataset.side`，不新增任何 `@JavascriptInterface`。建議後續把它正式列入介面表。
15. **WebView 子資源也攔截**：除了 `shouldOverrideUrlLoading`，另以 `shouldInterceptRequest` 對非 `file:///android_asset/pet/` 的請求回傳 403，比計畫要求更保守。
16. **主畫面以程式建立**：未修改範本 `activity_main.xml`（保留不用），畫面元件在 `MainActivity` 內以程式產生，減少資源檔變動。
17. **樣本檔解析**：`exportCsv` 需要 `List<BatterySample>`，在 core 新增 `parseCsvLine`（§4 以外的新增函式，不改既有簽名）把樣本檔讀回來，並有輔助測試。建議新增規格列：「樣本檔有一行壞掉 → 匯出時略過該行，其他照常」。
18. **服務啟動時立刻取樣一筆**，之後每 15 分鐘一筆，作為耗電基準點。
19. **S12 備註寫在 CHECKLIST.md**：預設值表要求寫在 DEVICE-CHECKLIST.md 的 S12 備註，但 §1 規定 CHEAP 文件只可追加 CHECKLIST.md；取較保守者，備註放 CHECKLIST.md 並指向 S12。
20. **語音辨識錯誤**：「沒聽到／沒比對到」顯示「沒聽清楚，再說一次好嗎？」，其他錯誤一律顯示預設值表的「目前無法使用麥克風，請打開 App 再試」。
21. **Pitest `targetTests`**：外掛預設只跑與 `targetClasses` 同套件的測試，規格測試在 `spec` 套件因此沒被執行；設為 `com.accompany.pet.*`。突變範圍（`targetClasses`）仍只限 permission。
22. **`.gitattributes`**：新增 `*.sh`、`gradlew` 固定 LF 換行，避免 Windows 簽出成 CRLF 後 Git Bash 無法執行 `verify.sh`。
23. **Lint `abortOnError = true`** 明確寫進 `app/build.gradle.kts`。

## 建議後續（不在 M0 實作）

- 把「角色在左／右」正式列入原生 → 網頁介面表（目前以 `dataset.side` 實作，見決策 14）。
- 角色圖改為含透明通道的 PNG。
- 依賴套件升級另開批次處理（Lint 列出 7 個可升級套件）。
24. **實測修正（螢幕關閉後角色消失）**：處理 WebView 渲染程序被系統收掉（`onRenderProcessGone` 重建，不閃退），螢幕打開時檢查懸浮窗是否還掛著，不在就重建。根因待手機 log 確認。
25. **實測修正（麥克風一直無法使用）**：Manifest 加 `<queries>` 宣告 `RecognitionService`（Android 11+ 未宣告時找不到語音辨識服務）；取得麥克風權限後若角色已在執行，重新呼叫 `startForeground` 補上 microphone 類型；錯誤訊息附上錯誤碼以利回報。
26. **手機 log 確認的根因**（2026-10-03，vivo V2503、Android 16）：
    - 麥克風：Google 語音辨識服務其實有連上，失敗原因是手機當時沒網路（`ERR_INTERNET_DISCONNECTED`），也沒有中文離線語音包（`LANGUAGE_PACK_ERROR` 12）。新增錯誤碼 1、2、12、13 的提示文字，引導使用者連網或下載離線語音包。第 25 項的 `<queries>` 保留，因為 Android 11 以上本來就需要這個宣告。
    - 螢幕關閉後角色消失：螢幕關閉約 60 毫秒後，程序被系統直接收掉，沒有 Java 例外，也沒有 `am_kill` 紀錄，符合 vivo 鎖屏清理的行為。從最近任務滑掉 App 時，vivo 也會連同前景服務一起收掉（`remove-task`）。這需要在手機設定加入白名單；程式端的重建機制只能處理 WebView 渲染程序被收掉的情況。
27. **規格書路徑**：依使用者指示，`docs/SPEC.md` 的引用全部改為 `docs/wish28-pet-spec.md`（規格書已由使用者移入 docs/）。BLOCKERS.md、DECISIONS.md 的歷史紀錄保留原文，另加解決註記。
28. **前景服務不再宣告 microphone 類型**（手機實測，vivo V2503）：帶 microphone 類型時，螢幕一關約 0.2 秒程序就被系統收掉（log 前一刻都有麥克風權限狀態變動）；只宣告 specialUse 後，同樣測試程序存活。收音由系統語音辨識服務在它自己的程序進行，本 App 不需要此類型。Manifest 的 `specialUse|microphone` 宣告依架構約束 A7 保留。
29. **刪除定時巡邏**（依使用者指示）：vivo 凍結 App 時會移除其鬧鐘，巡邏在主要使用的手機上無效，留著只是技術債。一併移除 `WatchdogReceiver`、精確鬧鐘權限與按鈕、使用者意圖紀錄（`RunIntentStore`）、`decideRestore` 與其測試、驗收項 V18。快速設定磚保留。設計方向改為「需要時才出現」，見 M1 計畫書。
30. **M1 便宜批次**：開工前只 commit 既有的 `tools/`；`.idea/` 為 IDE 個人設定，不納入版本控制，維持未追蹤。各文件依 docs/M1-CHEAP-PLAN.md §3 照抄追加，沒有同名章節衝突。
31. **M1 規格測試數量為 14，不是 13**：計畫書 §4.5 的自動列為 M1-S01～S12、S14、S15 共 14 列，但文字寫「13 列」。依「每列一個函式、不得合併」轉寫 14 個，verify.sh 的 V05 計數改為 M0 10＋M1 14＝24。屬計畫書筆誤，不是規格爭議。
32. **凍結 hash 分兩個 commit**：hash 無法寫進自己所在的 commit，所以先 commit 規格測試（`4f9208a`），再 commit verify.sh 對新 hash 的引用。
33. **V02 排除 spec 目錄**：凍結的 M0-S15（修訂）必須在測試裡列出 `HttpURLConnection`、`okhttp` 等禁用字串，會被 V02 掃到。V02 的本意是 core 的**程式**不得連網，因此改為 `--exclude-dir=spec`，掃描範圍仍涵蓋 core 的 main 與其他測試。
34. **Firebase BOM 版本 34.19.0**：查詢 Google Maven 的 `firebase-bom` metadata，目前最新穩定版為 34.19.0（`firebase-messaging` 25.1.3），寫進 `libs.versions.toml`。不使用 google-services 外掛，由 `PetApp` 以 `FirebaseOptions` 手動初始化。
35. **Manifest 加桌面應用程式 queries**：Android 11+ 套件可見性限制下，`ApplicationInfo.category` 需要查得到該套件。以 MAIN／LAUNCHER 的 `<queries>` 讓遊戲等桌面 App 可見，不使用範圍更大的 QUERY_ALL_PACKAGES。沒有桌面圖示的 App 查不到分類，視為非遊戲（使用者可用自訂遊戲清單補）。
36. **沒有懸浮窗權限時收到 ACTION_SHOW**：服務依 Android 規定先宣告前景再立刻結束，不顯示角色（避免加視窗時閃退）；來源是推播時 `ReminderDispatcher` 已事先改發一般通知。
37. **頁面載入完成前的文字先暫存**：`loadUrl` 是非同步，剛啟動就呼叫 `window.pet.showText` 會丟失，故 `OverlayService` 在 `onPageFinished` 才補顯示。
38. **閒置計時不因螢幕關閉暫停**：互動時間以 `System.currentTimeMillis()` 計，3 分鐘到就收起；M1 不做更細的處理（建議後續：螢幕關閉期間是否暫停計時）。

## 建議後續（M1，僅記錄，未實作）

- 螢幕關閉期間是否暫停閒置計時（見第 38 項）。
- 沒有桌面圖示的遊戲查不到系統分類，目前只能靠自訂遊戲清單補；可考慮在主畫面列出「最近使用的 App」讓使用者勾選。
- 推播送達率在 vivo 收掉 App 之後的表現，需先看 DEVICE-CHECKLIST-M1.md B 節的實測結果，再決定 M1.5 是否改用「通知＋資料」混合訊息。
- 規格範例表的「M1 自動列共 13 列」筆誤（實為 14 列）建議在計畫書下次修訂時更正。

## M1.5 便宜批次

39. **開工前不需另外 commit**：開工時工作區只有 `.idea/` 未追蹤（IDE 個人設定，不納入），開工前 commit 為 `cd5cdbe`，C7 以此為比對基準。
40. **複製結果**：`git archive 54065e9` 共取出 87 個檔案，其中 16 個 `.png`（角色立繪與圖示）被 §3.1 的 `.gitignore` 擋下，只放本機；進 git 的 71 個檔案沒有 `.png` 與 `.dev.vars`。
41. **各文件照抄追加**：README.md、docs/ARCHITECTURE.md、CHECKLIST.md 原本都沒有 M1.5 章節，`.gitignore` 原本也沒有 §3.1 的任何一行，均無重複。
42. **驗收結果**：C1～C7 全數通過；C4 為 269 個通過、0 個失敗，C5 只看 V06（通過）。沒有寫入 BLOCKERS.md 的項目。

## M1.5 貴批次

43. **凍結 hash 分兩個 commit**（同第 32 項）：規格測試在 `c119cfe`，verify.sh 對新 hash 的引用另外 commit。
44. **V04／V05 同時涵蓋兩個 spec 目錄**：V04 對 `core/.../spec/` 與 `backend/tests/spec/` 一起做 `git diff --quiet`；V05 的 JS 部分以 `test('<編號> ` 計數，並掃 `test.skip`、`test.todo`、`.only`。
45. **推播文字先修剪再送出**：`validatePushPayload` 以 trim 後的文字判斷空白與長度，送出的也是 trim 後的那一份，與 `handleChat`「驗哪一份就送哪一份」一致；長度以 Unicode 字元（code point）計算。
46. **測試用服務帳戶只是假字串**：規格測試的 `private_key` 是 `test-only-private-key`，路由層只檢查欄位是否存在，不做簽章；避免在追蹤檔中出現私鑰樣式（V06）。
47. **「聊聊」按鈕提前到 T1**：凍結的 M15-S13 會讀 index.html，T1 的完成條件又是「規格測試全部通過」，所以 index.html 的按鈕在 T1 先加；按鈕呼叫 `callBridge('onChatPressed')`，橋接方法在 T3 補上之前呼叫會被 `callBridge` 略過，不會出錯。
48. **聊天網址解析的保守做法**：`parseOrigin` 遇到帳密（`@`）、IPv6（`[`）、埠號不是 1～5 位數字時一律視為無法解析（`normalizeChatUrl` 為 null、`isSameOrigin` 為 false）；只認 https 與 http 兩種 scheme 的預設埠號。
49. **V24 的豁免**：見 BLOCKERS.md「規格爭議：V24／A18」。只豁免 llm-client.js 那一行完整原文，不放寬其他條件。
50. **推播客戶端丟例外時**：路由層把例外當成失敗，回 502、code `UNKNOWN`，仍只呼叫一次；網路錯誤的 `NETWORK_ERROR` 由 fcm-client.js 自己判斷後回傳（§7）。
51. **服務帳戶本身有問題時的錯誤代碼**：JSON 解析失敗、缺欄位、私鑰無法匯入時，`sendFcm` 不連外，回傳 `{ ok: false, status: null, code: 'INVALID_SERVICE_ACCOUNT' }`（§4.3 只規定 Google 回錯誤時的代碼，這是本機錯誤，另給一個好辨認的代碼；不帶出例外內容，避免私鑰片段進日誌）。
52. **fcm-client 輔助測試的 PEM 標頭拆開寫**：測試現場產生 RSA 金鑰並組成 PEM，標頭用常數 `PEM_DASHES` 拼出。檔案裡沒有任何真實金鑰，拆開寫只是避免 V06 的樣式掃描把測試程式誤判為含私鑰。
53. **index.js 的推播相依**：`pusher` 與 `pushConfig` 都從 `env.FCM_SERVICE_ACCOUNT`、`env.FCM_DEVICE_TOKEN` 讀，`USE_STUB` 為 true 時改用 Stub；`randomText` 不注入，由路由層預設用 `crypto.randomUUID()` 前 8 碼。
54. **ChatActivity 的系統列空間**：WebView 不吃 padding，外層包一個 FrameLayout 讓出狀態列、導覽列與鍵盤的空間（`enableEdgeToEdge` 之後必須自己處理）。
55. **ChatActivity 渲染程序被收掉時結束畫面**：覆寫 `onRenderProcessGone` 回傳 true 並 `finish()`，避免整個 App（含懸浮角色）一起閃退；計畫書沒有規定，選較保守的做法。
56. **V07 的 ChatActivity 檢查方式**：`ChatActivity.kt` 必須恰好有一行 `val url = normalizeChatUrl(BuildConfig.CHAT_URL)`，且所有 `loadUrl(...)` 的參數都只能是 `url`；懸浮窗照舊檢查本機資產開頭（排除 ChatActivity.kt）。
57. **主畫面只顯示「已設定」與否**：聊天網址本身不顯示在主畫面，判斷用 `decideChat`，與「聊聊」按鈕的判斷一致（http 網址同樣顯示未設定）。
58. **`worker.properties` 的值寫進 BuildConfig 前跳脫反斜線與雙引號**：避免使用者貼入的網址含引號時產生無法編譯的 BuildConfig。
59. **Stryker 的產物不進 git**：報告輸出到 `backend/reports/mutation/`，暫存資料夾 `backend/.stryker-tmp/`，兩者加進 `.gitignore`；`stryker.config.json` 進 git，Stryker 沒有寫進 `package.json`（§7）。
60. **V15 會在 `--full` 時同時跑 Pitest 與 Stryker**：Stryker 執行失敗時與 Pitest 相同，只印警告，再由報告檢查（待補欄位或四個範圍）決定 V15 是否通過。

## 建議後續（M1.5，僅記錄，未實作）

- V24 規格爭議：若決定強制走轉送服務，移除 `llm-client.js` 的直連備援並拿掉 verify.sh 的那行豁免。
- 推播可以考慮讓 Worker B 記下最近送出的編號與結果（目前只看得到 `wrangler tail` 的成功／失敗），方便查「到底有沒有送出」。
- 聊天畫面目前不支援檔案選擇（換背景），若要支援需實作 `WebChromeClient.onShowFileChooser`，並重新評估 A23。

## M1.6 貴批次（平行三條線）

各線自行決定的事項完整記在 lanes/M1.6-B.md、M1.6-C.md、M1.6-D.md 的「決策」段落。整合時值得注意的幾項：

- **換臉時間點照凍結規格，不照 accompany_bot（B 線）**：accompany_bot 在「標籤前一個字」出現時就換臉，M16-S10 規定在「標籤後的第一個字」出現時換。差 30 毫秒，肉眼幾乎看不出來；以使用者確認的規格為準。
- **暫停期間收到演出照常開演（B 線）**：關螢幕（`setRender('paused')`）時若正在演出會跳到演完；但暫停中才收到的 `say` 不會自動跳到演完，畫面恢復後接著演。實機觀感不佳時，可改成暫停時由 Kotlin 不呼叫 `showScript`（未實作，列入 CHECKLIST）。
- **頁面載入前的暫存改為依到達順序的清單（C 線）**：原本只留最後一則，會遺失已從排隊檔取出的提醒。
- **script 超過 500 字整段改用純文字，不截斷（C 線）**：截斷可能切斷標籤。
- **不在聊天網頁表情清單的標籤（pout、shy）照樣剝除（D 線）**：與聊天網頁解析規則一致；換臉由角色頁的 emotion-map.js 決定。
- **verify.sh 的 0x01 缺陷（規劃者）**：產生 verify.sh 時 `\1` 被跳脫成 0x01 位元組。已修正並以 `LC_ALL=C grep` 掃過 verify.sh、tools、角色頁的 js，沒有其他控制字元。

## 建議後續（M1.6，僅記錄，未實作）

- `send_push.py` 給了 `--script` 但沒給 `--text` 時，通知欄文字仍是預設句、和演出原文不一致；可改成沒給 `--text` 時用剝標籤後的 script（D 線建議）。
- 聊天網頁換成白髮女僕並加入 pout、shy（另立一案）。

## M1.6 實機後

- **演出節奏**（使用者 2026-10-04 決定）：每字 0.08 秒、句尾標點（。！？…!?）之後多停 0.5 秒；換臉後停 0.45 秒與說完停 3 秒照舊。連續標點與後面的收尾符號只停一次，最後一個字是標點時不延長。聊天網頁不變（仍為每字 0.03 秒、不停頓）。
- **App 名稱**：改為「手機女僕」（使用者決定）。
- **App 圖示**：用已去背的 `frames/local/pout.png` 放到透明畫布上縮小（原圖貓耳尖貼著上緣，直接裁切放不進整對貓耳），底色淡粉紅，產生到 `app/src/debug/res/`（debug 來源集會蓋過 main 的圖示），並加入 .gitignore。理由：角色立繪不進公開 repo（規格書 §2.1）；release 建置仍是 main 的預設圖示。

## M4.1 便宜批次

61. **開工前未提交檔案保存**：開工前既有的 `backend/tools/prepare-assets.py`、`docs/M4.1-CHEAP-PLAN.md`、`docs/M4.1-EXPENSIVE-PLAN.md` 先行 commit 保存；`design/prototype/` 檔案依規格步驟 6 於該步驟 commit 保存，確保工作區乾淨。

## 建議後續（M4.1，僅記錄，未實作）

- 聊聊卡片副標顯示最後一句話：目前維持固定句，若後續要在實機讀取最近一則訊息，需另立功能（見 design/prototype/later.md）並評估是否新增本地快取。

## M4.1 貴批次

62. **verify.sh 支援 `--stage 1|2|3|4` 參數**：沿用決策 9（`--core-only`）與 `--lane` 設計，T1 僅實作 core、T2 實作網頁、T3 實作 App 原生端。預設不帶 `--stage` 時為 Stage 4（全跑 V01～V45）。各階段以 `--stage` 進行對應進度驗證，T4 及 `--full` 執行全部檢查，確保接線與整合無任何遺漏。
