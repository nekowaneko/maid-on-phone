# M0 開工前的人工準備（約 30～40 分鐘）

> 這份給你本人做，不是給 Claude Code 執行的。
> 全部打勾後，才把 CHEAP-PLAN.md 交給 Claude Code。

## 1. 安裝 Android Studio

> 已確認：電腦上已有 Android SDK（`C:\Users\Dominic\AppData\Local\Android\Sdk`，3.5 GB），沒有 Android Studio 本體，也沒有 winget。
> 裝完後 C 槽預估再用掉 6～10 GB。

- [x] 到 https://developer.android.com/studio 下載安裝檔，安裝路徑用預設 `C:\Program Files\Android\Android Studio`
- [x] 第一次開啟的設定精靈選 **Custom**（不要選 Standard）
- [x] SDK 路徑那一步，確認是 `C:\Users\Dominic\AppData\Local\Android\Sdk`（沿用現有的，只補缺的元件）
- [x] **取消勾選** Android Virtual Device（不建模擬器，省 6～10 GB）

## 2. 用 Android Studio 在你開好的資料夾建立專案

- [x] File → New → New Project → **Empty Views Activity**
- [x] 依下表填寫：

| 欄位 | 填入 |
|---|---|
| Name | AccompanyPet |
| Package name | `com.accompany.pet` |
| Save location | 你已經開好的新資料夾 |
| Language | Kotlin |
| Minimum SDK | API 26 |
| Build configuration language | Kotlin DSL |

- [x] 等右下角 Gradle Sync 跑完（第一次會下載很多東西，約 5～15 分鐘）
- [x] 先完成第 3 步（手機設定），再按上方綠色 ▶ 在**手機**上跑一次，看到空白畫面就代表環境正常（不要建模擬器）
- [x] **不要** git init，計畫書會處理

## 3. 手機設定

- [x] 設定 → 關於手機 → 連點「版本號碼」7 次，開啟開發人員選項
- [x] 開發人員選項 → 開啟「USB 偵錯」
- [x] 用 USB 接電腦，手機跳出「允許 USB 偵錯」時按允許
- [x] Android Studio 上方的裝置選單看得到你的手機

## 4. 環境檢查（在專案資料夾用 Git Bash 執行）

```bash
./gradlew --version
./gradlew :app:compileDebugKotlin
```

- [ ] 兩行都沒有出現 `FAILED`

## 5. 放好規格書與計畫書

- [x] 在專案資料夾建立 `docs/`，把根目錄的檔案**搬進去**（計畫書會到 `docs/` 找）：
  - `docs/SPEC.md`（就是 wish28-pet-spec.md，改名）
  - `docs/CHEAP-PLAN.md`
  - `docs/EXPENSIVE-PLAN.md`

## 6. （可選）放入你的角色圖

- [x] 把待機用的差分圖放在 `app/src/main/assets/pet/frames/local/`，檔名：
  - `idle.png`（平常）
  - `blink.png`（閉眼）
- 這個資料夾會被 `.gitignore` 排除，不會進入開源 repo
- 沒放的話，程式會用內建的佔位圖示

完成後，對 Claude Code 說：
> 讀 docs/CHEAP-PLAN.md 並完整執行。
