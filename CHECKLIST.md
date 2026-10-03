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
- [ ] R2 角色被系統收掉後，5～15 分鐘內自動回來（螢幕亮著時）（adb 結束程序時通過；vivo 凍結後會移除鬧鐘，無效，見 BLOCKERS.md）
- [ ] R3 按「停止」後，等 15 分鐘角色不會自己跑出來
- [x] R4 角色被收掉後，點磁磚可立即叫回
