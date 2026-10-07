# M3R 交接文件：派工與整合（給負責派工的規劃者代理人）

> 讀這份文件的你是**規劃者**：負責派三個實作代理人、等它們回報、整合、驗收。你自己**不實作**任何一條線的程式。
> 交接時間：2026-10-07。交接者已完成前置 10 步（docs/PARALLEL-AGENTS.md §2），三個 worktree 已經開好。
> 所有回報、文件、commit 訊息用**繁體中文（臺灣用語）**。

## 0. 先讀（依序）

1. 本文件
2. `docs/M3R-EXPENSIVE-PLAN.md`：三條線的計畫書。檔案所有權（§1）、接口（§4）、規格範例表（§4.5）、禁止事項（§8）都在這裡
3. `docs/PARALLEL-AGENTS.md`：本專案平行分派的做法與踩過的坑（§6），整合時照 §4
4. `backend/config/todoist-contract.json`：接口塊，三條線的規格測試都讀它

## 1. 現在的狀態

| 項目 | 狀態 |
|---|---|
| master 最新 commit | `20ab3e9`（verify.sh 換成 M3R 範圍） |
| 凍結 commit | `155532f`（規格測試 M3R-S01～S19，`verify.sh` 的 `FROZEN_HASH` 指向它） |
| worktree | `../pet-maid-m3r-b`（分支 `m3r-lane-b`）、`../pet-maid-m3r-c`（`m3r-lane-c`）、`../pet-maid-m3r-d`（`m3r-lane-d`），都在 `20ab3e9`，本機設定檔已複製 |
| 起跑檢查 | 已在 master 跑過：D 線只卡自己的 15 列規格；C 線卡 V08（第 5 個 JS 介面還沒加）；B 線卡自己的 2 列規格與 `overlay-drink-helper.test.js` 一支舊測試（計畫書 B2 已交代由 B 線修） |
| 規格可滿足 | 凍結前已用草稿實作跑過，19 列全部通過、M2 規格不退化；草稿已刪除 |

**為什麼有 M3R（第二輪）**：第一輪 M3 的規格測試沒有呼叫任何實作，三條線「一次全綠」但功能完全沒打通（沒有排程、沒呼叫 Todoist、網頁沒掛按鈕、沒有 JS 橋接、B 與 C 的動作名稱不一致），而且 master 的 V04 從第一輪後就一直是紅的。這一輪的重點是**讓規格測試真的擋得住錯誤**，所以：
- 不得修改規格測試、`verify.sh`、契約檔來讓測試通過
- 驗收數字以你自己實際跑出來的結果為準，不採信代理人自述

## 2. 環境注意事項（Windows）

- `verify.sh` 一律在 **Git Bash** 執行（`./verify.sh --lane D`），不要用 PowerShell 執行。
- 寫任何含反斜線的程式碼（Kotlin 字串、正規表示式、sed）一律用**檔案編輯工具**，不要用 shell heredoc 或 `echo`：本專案發生過 `\n`、`\1` 被 shell 改壞的事。
- 單獨跑 Gradle 前先設 `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"`（`verify.sh` 會自己設）。
- `*.sh` 必須是 LF 換行（`.gitattributes` 已設定）；Windows 上的 Python 用文字模式寫檔會變成 CRLF，寫完要檢查。
- 任何被追蹤的檔案都不得出現「小寫 s、小寫 k、連字號」三個連續字元，V06 會當成金鑰（任務編號用 `A01`、`taskabc` 這種）。

## 3. 派工

三個代理人**同時**在背景執行，各自只在自己的 worktree 工作。派工訊息只放下面這些，其餘全部在計畫書裡，不要在訊息裡重述或改寫計畫書的內容。

### 3.1 D 線（Worker）派工訊息

```
你是 pet-maid 專案 M3R 的 D 線（Worker）實作代理人。
工作目錄：C:\Users\Dominic\Desktop\ml_demo\pet-maid-m3r-d（分支 m3r-lane-d），只能在這個目錄工作。
依序讀：docs/M3R-EXPENSIVE-PLAN.md（全部，D 線相關是 §1、§2、§4.1、§4.2、§4.5 的 D 列、§5 的 D1～D3、§8）、docs/M2-EXPENSIVE-PLAN.md §0（執行協定，M3R 沿用）、backend/config/todoist-contract.json。
只能修改計畫書 §1 表中 D 線的檔案。驗收只跑 Git Bash 的 ./verify.sh --lane D，不得跑 --full、Stryker。
只在 m3r-lane-d 分支 commit，不得 merge、rebase、push、切換分支。
不得修改 backend/tests/spec/、verify.sh、契約檔、docs/。規格測試與實作衝突時，在 lanes/M3R-D.md 記「規格爭議」，不得改測試。
不得連到真正的 Todoist、Cloudflare、Google。全程不得向任何人提問，未明訂處依計畫書 §7 處理並記錄。
完成後依計畫書 §9 的格式回報。
```

### 3.2 C 線（Kotlin）派工訊息

```
你是 pet-maid 專案 M3R 的 C 線（Kotlin）實作代理人。
工作目錄：C:\Users\Dominic\Desktop\ml_demo\pet-maid-m3r-c（分支 m3r-lane-c），只能在這個目錄工作。
依序讀：docs/M3R-EXPENSIVE-PLAN.md（全部，C 線相關是 §1、§2、§4.3、§4.5（Kotlin 一節）、§4.5 規格表的 C 列、§5 的 C1～C2、§8）、docs/M2-EXPENSIVE-PLAN.md §0（執行協定，M3R 沿用）與 §4.3、§4.5（M2 的 onDrinkAction、showDrink 寫法，照著寫）、backend/config/todoist-contract.json。
只能修改計畫書 §1 表中 C 線的檔案。驗收只跑 Git Bash 的 ./verify.sh --lane C，不得跑 --full、assembleDebug、pitest。
只在 m3r-lane-c 分支 commit，不得 merge、rebase、push、切換分支。
不得修改 core/src/test/kotlin/com/accompany/pet/spec/、verify.sh、契約檔、docs/。規格測試與實作衝突時，在 lanes/M3R-C.md 記「規格爭議」，不得改測試。
Kotlin 檔案一律用檔案編輯工具寫，不用 shell heredoc。全程不得向任何人提問，未明訂處依計畫書 §7 處理並記錄。
完成後依計畫書 §9 的格式回報。
```

### 3.3 B 線（懸浮窗網頁）派工訊息

```
你是 pet-maid 專案 M3R 的 B 線（懸浮窗網頁）實作代理人。
工作目錄：C:\Users\Dominic\Desktop\ml_demo\pet-maid-m3r-b（分支 m3r-lane-b），只能在這個目錄工作。
依序讀：docs/M3R-EXPENSIVE-PLAN.md（全部，B 線相關是 §1、§2、§4.3、§4.4、§4.5 規格表的 B 列、§5 的 B1～B2、§8）、docs/M2-EXPENSIVE-PLAN.md §0（執行協定，M3R 沿用）與 §4.4（M2 的 drink-view.js、showDrink 寫法，照著寫）、backend/config/todoist-contract.json、app/src/main/assets/pet/todoist-labels.js。
只能修改計畫書 §1 表中 B 線的檔案。驗收只跑 Git Bash 的 ./verify.sh --lane B。
只在 m3r-lane-b 分支 commit，不得 merge、rebase、push、切換分支。
不得修改 backend/tests/spec/、verify.sh、契約檔（含 todoist-labels.js）、docs/。規格測試與實作衝突時，在 lanes/M3R-B.md 記「規格爭議」，不得改測試。
角色頁不得用 ES module、不得連外、不得用 innerHTML。全程不得向任何人提問，未明訂處依計畫書 §7 處理並記錄。
完成後依計畫書 §9 的格式回報。
```

### 3.4 等待期間

- 記下每條線的**開始與結束時間**（以背景任務的實際執行時間為準，代理人自述的時間不準）與 token 用量。
- 代理人回報「規格爭議」或「需要整合處理」時，不要叫它自己改別條線的檔案或規格測試；等三條線都完成後在整合時處理，需要改規格就停下來問使用者。

## 4. 整合（三條線都回報完成後）

1. **逐線複驗**：在各自的 worktree 跑 `./verify.sh --lane <線>`，確認真的全綠；`git status` 乾淨；`git diff --stat 20ab3e9..m3r-lane-<x>` 只碰到計畫書 §1 允許的檔案（超出範圍的列出來給使用者看，不要自己合）。
2. **依序合併**到 master：D → C → B，`git merge --no-ff m3r-lane-d`（再 c、b），保留各線 commit。發生衝突就停下來回報使用者。
3. 處理各線紀錄檔的「需要整合處理」。
4. 在 master 跑一次 `./verify.sh --full`，把**最後一行原文**貼進報告。L3 需要的報告與設定照下面補：
   - `RISK-REVIEW.md` 加 M3R 段落：計畫書 §2 的 A35～A38，加上各線紀錄檔「高風險函式」段落列的函式（至少 `handleTodoistAction`、`runScheduled`、`createTodoistClient`、`onTodoistAction`、`showTodoist`、`viewFor`）
   - `MUTATION-REPORT.md`：Stryker 的 `mutate` 加 `core/todoist.js`、`commandRunner.command` **逐一列出**測試檔（不要用萬用字元，見 PARALLEL-AGENTS §6）；Pitest 的 `targetClasses` 加 `com.accompany.pet.core.todoist.*`
   - `ACCEPTANCE-M3R.md`：開頭放成本表（各線時間、修正輪數、錯誤指紋、token），再列 19 列規格的結果
   - `DEVICE-CHECKLIST-M3R.md`：手機實測清單，內容見 §5
5. 在 master 再跑一次不帶參數的 `./verify.sh`，確認 L1＋L2 全綠（第一輪就是漏了這一步）。
6. 移除三個 worktree 與分支：`git worktree remove ../pet-maid-m3r-<x>`、`git branch -d m3r-lane-<x>`。
7. 把實際數字與新踩到的坑補進 `docs/PARALLEL-AGENTS.md` §5（新增 5.3 M3R）與 §6。

## 5. 手機實測（使用者執行，你只寫清單）

使用者要先做的事（你只提醒，不要代做，也不要讀取或輸出任何權杖）：
1. 在 Todoist 重新產生一組 API 權杖（舊的那組曾以明文出現過）
2. 在 Git Bash 或 cmd 執行 `cd backend && npx wrangler deploy`（清掉雲端舊的明文變數），再執行 `npx wrangler secret put TODOIST_TOKEN` 貼上新權杖。**不要用 PowerShell 以管線傳入**，會把值弄壞
3. 在 Todoist 建一個測試專案，放幾件 P2（14 天以上沒動過的不好造，可先用規格測試驗，實測只看 P3 與按鈕）與 P3 任務
4. 重新安裝 App

`DEVICE-CHECKLIST-M3R.md` 至少涵蓋：
- P3 到期當天 08:30 角色出現，泡泡有「今天做／明天再提醒」，按「明天再提醒」後 Todoist 的到期日變成明天
- 沒有日期的 P3 收到「問日期」，四個按鈕各試一次（用不同任務），Todoist 到期日正確
- 「今天做」之後不完成，21:00 收到追問；完成了就不會收到
- P2「拆成小步驟」：泡泡列出 2～3 步，按「幫我加成子任務」後 Todoist 出現在原任務底下；按「取消」什麼都不寫
- 角色模式關閉時只收到通知文字、沒有按鈕
- 任務名稱含 `<b>` 之類的字時，泡泡照字面顯示
- 台詞語氣（鼓勵、不責備）

## 6. 絕對不要做的事

- 不要自己實作任何一條線的程式，也不要在代理人卡住時替它寫程式
- 不要修改 `backend/tests/spec/`、`core/src/test/kotlin/com/accompany/pet/spec/`、`backend/config/todoist-contract.json`；需要改規格就停下來問使用者（改了要重新凍結並更新 `FROZEN_HASH`）
- 不要放寬 `verify.sh` 的條件來讓驗收通過
- 不要部署、不要執行 `wrangler secret`、不要連真正的 Todoist
- 不要 push、不要對遠端做任何事
- 不要宣稱全綠，除非你在 master 實際跑過並貼出輸出
