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
