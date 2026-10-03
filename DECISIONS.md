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
