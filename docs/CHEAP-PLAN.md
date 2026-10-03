# AccompanyPet M0 — 便宜批次執行計畫

> 這份文件給協作代理人自主執行。
> 本批次為純產出工作（文件、設定、佔位素材），不含修正迴圈，可用較便宜的模型執行。
> 執行順序：本批次先跑，完成後才執行 docs/EXPENSIVE-PLAN.md。
> 背景規格：docs/wish28-pet-spec.md（第一版規格書）。本批次只做 M0（耗電實測 spike）需要的部分。

## 0. 執行協定

- **全程不得向使用者提問。** 未明訂處依 §4 預設值表處理，並記錄在 DECISIONS.md。
- 本批次的驗收都是結構性檢查（檔案存在、章節齊全、格式正確）。
  失敗時直接補齊缺漏即可，**不需要也不應該進入反覆修正的迴圈**。
- 若某項驗收補齊兩次仍不通過，停止該項並寫入 BLOCKERS.md，繼續處理其他項目。
- 開工前檢查有無 .git：沒有則 `git init`，並先把 Android Studio 產生的既有檔案
  全部 commit，訊息為「Android Studio 專案範本」；有則直接使用並先 commit 既有未提交檔案。
  全程不設遠端、不執行 push。
- 每完成 §1 的一列就 commit 一次。
- 所有註解、文件、commit 訊息使用**繁體中文（臺灣用語）**，例如「品質」不是「質量」、
  「程式」不是「程序」、「資料」不是「數據」。

## 1. 本批次範圍

| 動作 | 對象 |
|---|---|
| 建立 | `.gitignore`（合併既有內容）、`LICENSE`、`README.md`、`DEVICE-CHECKLIST.md`、`CHECKLIST.md`、`DECISIONS.md`、`PROGRESS.md`、`BLOCKERS.md`、`docs/ARCHITECTURE.md` |
| 建立佔位素材 | `app/src/main/assets/pet/frames/placeholder-idle.svg`、`placeholder-blink.svg` |
| 建立空資料夾標記 | `app/src/main/assets/pet/frames/local/.gitkeep` |
| 不動 | Android Studio 產生的任何 `.kt`、`.kts`、`AndroidManifest.xml`、`gradle/`、`docs/wish28-pet-spec.md`、`docs/*-PLAN.md` |

## 2. 產出檔案清單（交接契約）

本批次完成後，以下檔案必須存在且非空。EXPENSIVE-PLAN.md 的 T0a 會檢查這份清單：

- `.gitignore` — 含 §3.1 列出的所有規則
- `LICENSE` — MIT 授權全文
- `README.md` — §3.3 的五個章節
- `DEVICE-CHECKLIST.md` — §3.4 的完整內容
- `CHECKLIST.md` — §3.5 的內容
- `DECISIONS.md`、`PROGRESS.md`、`BLOCKERS.md` — §3.6 的骨架
- `docs/ARCHITECTURE.md` — §3.7 的四個章節
- `app/src/main/assets/pet/frames/placeholder-idle.svg`
- `app/src/main/assets/pet/frames/placeholder-blink.svg`
- `app/src/main/assets/pet/frames/local/.gitkeep`

## 3. 各檔案的內容規格

### 3.1 .gitignore

保留 Android Studio 產生的既有規則，在檔尾追加（不得重複）：

```gitignore
# 個人角色圖不進公開 repo
app/src/main/assets/pet/frames/local/*
!app/src/main/assets/pet/frames/local/.gitkeep

# 簽章與本機設定
*.jks
*.keystore
keystore.properties
local.properties

# 耗電紀錄匯出檔
*.csv
```

### 3.2 LICENSE

MIT 授權英文原文。年份 2026，著作權人寫 `AccompanyPet contributors`。

### 3.3 README.md（總長 ≤ 600 字）

章節順序固定：

1. `# AccompanyPet` — 一句話：「會常駐在 Android 桌面、會動、可以點的陪伴角色。」
2. `## 目前階段：M0 耗電實測` — 說明 M0 只驗證懸浮角色能不能常駐、耗電多少，不接 AI、不連網。
3. `## 怎麼建置` — 指向 Android Studio 開啟專案後按 ▶；或 `./gradlew assembleDebug`。
4. `## 放入自己的角色圖` — 說明 `app/src/main/assets/pet/frames/local/` 的 `idle.png`、`blink.png`，此資料夾不進 repo。
5. `## 授權` — MIT；角色立繪不在授權範圍內。

### 3.4 DEVICE-CHECKLIST.md（使用者拿手機實測用）

以下內容**原樣寫入**，不得改寫預期結果：

```markdown
# M0 手機實測清單

> 這些項目需要在真的手機上用眼睛確認，自動測試無法判定。
> 每項打勾或在後面寫下實際狀況。

## A. 規格範例表中需要手機確認的列

- [ ] S01 第一次開啟 App，還沒授權「顯示在其他應用程式上層」→ 畫面說明為什麼需要這個權限，按鈕帶到系統授權頁；授權前不顯示角色
- [ ] S02 麥克風權限被拒絕後，按麥克風按鈕 → 泡泡顯示「需要麥克風權限才能用說的」，App 不閃退
- [ ] S04 授權後按「開始」→ 桌面右下方出現角色，播放待機循環（呼吸、眨眼）
- [ ] S05 看角色周圍 → 看得到底下的桌面，背景透明，不是黑底或白底
- [ ] S06 點角色旁邊的空白處（例如桌面圖示）→ 點擊落到底下的 App，角色不攔截
- [ ] S07 把角色拖到螢幕左半邊放開 → 角色吸附到左邊緣
- [ ] S08 拖曳時把角色拉出螢幕上下邊界 → 角色停在螢幕邊界內，不會消失到畫面外
- [ ] S09 停止服務後再重新開始 → 角色出現在上次放開的位置
- [ ] S10 螢幕關閉，再重新打開 → 關閉期間動畫停止播放；打開後 3 秒內恢復播放
- [ ] S11 點角色 → 角色旁出現泡泡與麥克風按鈕
- [ ] S12 按麥克風，說「剛剛喝了一杯大杯珍奶」→ 泡泡顯示辨識出的中文文字
- [ ] S13 按通知欄上的「停止」→ 角色消失、服務結束、常駐通知移除
- [ ] S15 開飛航模式 → 角色照常顯示與播放

## B. 耗電實測（M0 的主要目的）

1. 手機充到 100%，拔掉充電線
2. 開啟 App → 按「開始」，確認角色出現
3. 螢幕保持開啟（可以正常使用手機，但不要打遊戲、不要看影片）
4. 8 小時後，在 App 按「匯出耗電紀錄」，把 CSV 傳到電腦
5. 隔天做對照組：同樣條件但**不開**角色，記錄 8 小時後的電量

| 項目 | 有角色 | 無角色（對照） |
|---|---|---|
| 開始電量 | | |
| 8 小時後電量 | | |
| 消耗 | | |
| **角色造成的額外耗電** | （有角色消耗 − 無角色消耗）= | |

- [ ] 額外耗電 ≤ 5%（暫定目標；若超過，依 docs/wish28-pet-spec.md §5 M0 的備案改成原生圖片循環）
- [ ] 手機明顯發燙？（是／否）

## C. 手機省電機制

- [ ] 8 小時內角色沒有自己消失
- 若有消失：記錄手機品牌、型號，以及消失前大約幾點
- 處理方式：設定 → 應用程式 → AccompanyPet → 電池 → 改為「不受限制」，再測一次
```

### 3.5 CHECKLIST.md

```markdown
# 交付後檢查清單

- [ ] 完成 DEVICE-CHECKLIST.md 全部項目
- [ ] 讀 RISK-REVIEW.md 列出的高風險函式
- [ ] 看 SECURITY-REPORT.md（Android Lint 結果）
- [ ] 看 MUTATION-REPORT.md
- [ ] 依賴套件稽核：在 Android Studio 執行 Build → Analyze APK 或 `./gradlew :app:dependencies`，確認沒有不認識的套件
```

### 3.6 DECISIONS.md、PROGRESS.md、BLOCKERS.md

各只寫標題與一行說明：

- `DECISIONS.md`：`# 自主決策紀錄` + 「代理人依預設值表或自行判斷所做的決定，每項附理由。」
- `PROGRESS.md`：`# 進度與成本紀錄` + 「每階段記錄修正輪數、錯誤指紋、各驗收項失敗次數。」
- `BLOCKERS.md`：`# 阻塞項目` + 「斷路器觸發或規格爭議的項目。」

### 3.7 docs/ARCHITECTURE.md（總長 ≤ 800 字）

章節順序固定，內容依 docs/wish28-pet-spec.md §2 摘要，只寫 M0 相關部分：

1. `## 模組` — `core`（純 Kotlin 邏輯，不依賴 Android）與 `app`（Android 殼）
2. `## 懸浮角色怎麼運作` — 前景服務（specialUse）→ WindowManager 懸浮窗（只有角色大小）→ 透明 WebView 載入 `file:///android_asset/pet/index.html`
3. `## 原生與網頁的溝通` — WebView → 原生：點角色、按麥克風；原生 → WebView：暫停／播放動畫、顯示文字
4. `## M0 不做的事` — 不連網、不接 AI、不接 Todoist／戒飲存／台股、沒有快速設定磚、沒有遊戲偵測

### 3.8 佔位 SVG

兩個檔案都是 `viewBox="0 0 120 135"`，透明背景（不得有填滿整個畫布的底色矩形），用簡單幾何圖形畫一個貓耳頭像：

- `placeholder-idle.svg`：深灰色圓形頭部、兩個三角形貓耳、兩個黃色圓形眼睛
- `placeholder-blink.svg`：與 idle 完全相同，只有眼睛改成兩條橫線

## 4. 預設值表（不要為這些提問）

| 問題 | 預設值 |
|---|---|
| .gitignore 已有相同規則 | 不重複追加 |
| docs/wish28-pet-spec.md 不存在 | 寫入 BLOCKERS.md，其餘照做；ARCHITECTURE.md 依本文件 §3.7 的描述撰寫 |
| 字數超出上限 | 精簡內容，不得刪除必要章節 |
| SVG 畫得不好看 | 不重要，只要透明背景、兩張只差在眼睛 |
| 專案根目錄沒有 Android Studio 產生的檔案 | 停止，寫入 BLOCKERS.md：「請先完成 00-SETUP 第 2 步」 |

## 5. 驗收清單

全部為結構性檢查，用 grep 或檔案解析完成，不需要編譯或執行程式。

| # | 驗收項 | 判定方式 |
|---|---|---|
| C01 | §2 清單中的檔案全部存在且非空 | 逐一檢查（.gitkeep 例外，只需存在） |
| C02 | .gitignore 含 `frames/local/*`、`*.jks`、`keystore.properties`、`*.csv` | grep |
| C03 | README.md 五個章節標題齊全且順序正確 | 解析標題 |
| C04 | DEVICE-CHECKLIST.md 含 S01、S02、S04～S13、S15 共 13 個編號，且含「耗電實測」「省電機制」 | grep |
| C05 | docs/ARCHITECTURE.md 四個章節標題齊全 | 解析標題 |
| C06 | 兩個 SVG 都是合法 XML，且 viewBox 為 `0 0 120 135` | 解析 |
| C07 | README.md ≤ 600 字、ARCHITECTURE.md ≤ 800 字 | 計算字數 |
| C08 | 沒有修改 §1「不動」列出的任何檔案 | `git diff --stat <範本 commit> -- '*.kt' '*.kts' 'app/src/main/AndroidManifest.xml' gradle/ docs/wish28-pet-spec.md` 為空 |
| C09 | git 工作區乾淨 | `git status --porcelain` 為空 |

**不得為了通過驗收而放寬標準、刪減章節、或改寫驗收條件本身。**

## 6. 絕對禁止事項

- 不得向使用者提問。
- 不得修改任何 `.kt`、`.kts`、`AndroidManifest.xml`、Gradle 設定。
- 不得執行 `./gradlew` 或任何編譯指令。
- 不得建立含真實憑證的檔案。
- 不得刪除或覆蓋既有檔案；有衝突則將既有檔案改名為 `<原名>.bak` 保留。
- 不得設遠端、不得 push。
- 不得把 `app/src/main/assets/pet/frames/local/` 裡的任何圖片加入 git。
- 不得執行 EXPENSIVE-PLAN.md 的任何內容。

## 7. 完成後的通知格式

輸出以下格式，不要輸出多餘內容：

    ✅ 便宜批次完成，請查核。

    驗收結果：C01–C09 全部通過（或：通過 n 項，m 項未通過，詳見 BLOCKERS.md）
    產出檔案：<n> 個
    Commit 數：<n>
    補齊次數：<n>

    需要你人工確認的部分：
    1. README.md 的語氣
    2. 佔位 SVG 能不能接受（之後會被你的角色圖取代）

    自主決策列在 DECISIONS.md，共 <n> 項。
    下一步：對 Claude Code 說「讀 docs/EXPENSIVE-PLAN.md 並完整執行」。

## 8. 故意不做的事

- 不寫任何程式邏輯——那屬於 EXPENSIVE-PLAN.md。
- 不建立 `core` 模組、不修改 Gradle。
- 不寫 `app/src/main/assets/pet/index.html`（含程式邏輯，屬於貴批次）。
- 不執行測試、不編譯。
- 不自行擴充範圍；有建議寫進 DECISIONS.md 的「建議後續」段落，不要實作。
