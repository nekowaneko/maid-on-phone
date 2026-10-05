# Worker B 的來源

- 來源專案：accompany_bot（本機路徑 `C:\Users\Dominic\Desktop\ml_demo\accompany-assiment`）
- 來源 commit：`54065e9`（2026-09-05 之後的最新版，複製日 2026-10-04）
- 複製方式：`git archive`，只含 git 追蹤中的檔案
- 複製範圍：worker、core、config、web、tests、assets、tools/preview-server.mjs、tools/make-icon.mjs、package.json、.assetsignore、.dev.vars.example、wrangler.toml
- 改動過的檔案：wrangler.toml（名稱、資料庫）、.dev.vars.example（變數說明）；M1.5 貴批次另加推播功能
- 角色立繪（assets/character/png）與圖示（assets/icons）只放本機，不進 pet-maid 的 git

## 之後要把 accompany_bot 的修正移植過來時

1. 在 accompany_bot 資料夾查看差異：`git diff 54065e9 <新的 commit> -- worker core config web tests`
2. 只挑需要的修正手動套用到 backend/，不要整份覆蓋（會蓋掉推播功能與設定）
3. 人設只改了 persona.md 時，直接複製 config/persona.md 過來並重新部署
4. 移植完把上面的「來源 commit」改成新的 commit

# 戒飲存（cost_down）的來源（M2）

- 來源專案：戒飲存（本機路徑 `C:\Users\Dominic\Desktop\ml_demo\cost_down`）
- 來源 commit：`9fc08b2`（複製日 2026-10-05）
- 照抄的檔案（6 個）：
  - `netlify_deploy/data/drink-model.json` → `config/drink-model.json`（逐字）
  - `netlify_deploy/data/starbucks.json` → `config/starbucks.json`：原檔有兩組重複的編號（同一個編號對到兩種杯型），`lookupTableKcal` 只會找到第一筆，所以依杯型改成 `sb_black_tea_latte_tall`／`_grande`、`sb_frappuccino_chocolate_grande`／`_venti`，`_note` 補一句說明；其餘逐字
  - `netlify_deploy/core/calorie.js`、`ledger.js` → `core/`：開頭加一行來源註解，其餘逐字
  - `tests/calorie.test.js`、`ledger.test.js` → `tests/costdown-*.test.js`：開頭加一行來源註解、import 路徑改指 `../core/`、`../config/`，其餘逐字
- 沒搬的東西：Gemini 代打估熱量（規格禁止語言模型估熱量）、`slots.js`（M2 只需要小時界線，寫在 `core/drink.js`）、`migrate.js`（pet-maid 沒有 v1 舊資料）
- 戒飲存的統計是 `index.html` 裡的函式，不是照抄的；M2 的省下杯數**不用**戒飲存的防灌水公式（使用者 2026-10-05 決定：「沒喝」全部入帳）

## 之後要更新時

1. 在 cost_down 資料夾查看差異：`git diff 9fc08b2 <新的 commit> -- netlify_deploy/data netlify_deploy/core tests/calorie.test.js tests/ledger.test.js`
2. 重抄有改動的檔案，照上面的規則加註解、改路徑；`starbucks.json` 的編號重複問題若原專案已修正，改用原專案的編號
3. 把上面的「來源 commit」改成新的 commit
