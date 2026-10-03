# 交付後檢查清單

- [ ] 完成 DEVICE-CHECKLIST.md 全部項目
- [ ] 讀 RISK-REVIEW.md 列出的高風險函式
- [ ] 看 SECURITY-REPORT.md（Android Lint 結果）
- [ ] 看 MUTATION-REPORT.md
- [ ] 依賴套件稽核：在 Android Studio 執行 Build → Analyze APK 或 `./gradlew :app:dependencies`，確認沒有不認識的套件

## 貴批次追加

- [ ] **S12 備註**：DEVICE-CHECKLIST.md 的 S12 實測時，若泡泡顯示「目前無法使用麥克風，請打開 App 再試」，屬 Android 14+ 背景麥克風限制（見 BLOCKERS.md）。先在 App 內按「允許麥克風」再按「開始」重試。
- [ ] **S05 透明背景**：`frames/local/idle.png`、`blink.png` 是 RGB 無透明通道的圖，角色周圍會有底色；要測透明請改用含 alpha 的 PNG，或暫時移走 local 圖改用 placeholder SVG。
- [ ] `.jpg`／`.jfif` 角色圖不會被讀取（程式只讀 `frames/local/*.png`）。

## M0.5 自動恢復（docs/M0.5-RECOVERY-PLAN.md §4.1）

- [ ] R1 下拉通知欄加入「陪伴角色」磁磚，點一下角色出現、再點一下角色消失
- [x] R4 角色被收掉後，點磁磚可立即叫回

## M1

- [ ] 完成 docs/FIREBASE-SETUP.md，主畫面顯示推播代碼
- [ ] 讀 M1 的 RISK-REVIEW.md 新增項目
- [ ] 依賴套件稽核：Firebase Messaging 版本是否為最新穩定版（需要連網，自行查看）
- [ ] 自訂遊戲清單填入自己常玩、但系統沒標成遊戲的 App
