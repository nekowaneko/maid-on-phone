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
