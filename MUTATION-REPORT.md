# 突變測試報告

- 狀態：已執行
- 工具：Pitest（Gradle 外掛 `info.solidsoft.pitest` 1.19.0），執行指令 `./gradlew :core:pitest`
- 執行範圍：`core/permission`（`core/src/main/kotlin/com/accompany/pet/core/permission/`，`targetClasses = com.accompany.pet.core.permission.*`）
- 使用的測試：`com.accompany.pet.*`（spec 規格測試＋helper 輔助測試，共 20 個）
- 原始報告：`core/build/reports/pitest/index.html`、`mutations.xml`（建置產物，不進 git）

## 結果

| 項目 | 數值 |
|---|---|
| 產生突變 | 4 |
| 被殺死 | 4 |
| 存活 | 0 |
| 無覆蓋 | 0 |
| 突變分數 | 100% |

| 突變 | 位置 | 結果 | 殺死它的測試 |
|---|---|---|---|
| 條件反轉（NegateConditionals） | `Permission.kt:11` `decideStart` | 已殺死 | `S01 還沒授權懸浮窗時按開始會顯示權限說明而不是角色` |

## 說明

- `MIC_DENIED_MESSAGE` 是編譯期常數，會被內嵌到呼叫端，Pitest 不會對它產生突變；它的正確性由規格測試 S02 的字串完全比對保證。
- Pitest 提示 Kotlin 專用外掛（Arcmutate，商業授權）不存在，未安裝（計畫禁止安裝無關套件）。

## 建議新增的規格範例列

無存活突變，因此 0 列。（`decideStart(true) → START_OVERLAY` 目前只有輔助測試涵蓋，若要納入規格可新增：「已授權懸浮窗後按開始 → 直接出現角色，不顯示說明」。）

## M0.5 更新（2026-10-03）

範圍新增 `permission/Restore.kt` 的 `decideRestore`，突變共 4 個、全部被殺死（100%）。
殺死 `decideRestore` 突變的是輔助測試 `RestoreTest`（八種組合），規格測試尚未涵蓋，建議新增規格範例列：
「使用者按停止後，角色被系統收掉也不會自動跑回來」。

> 2026-10-03：`decideRestore` 已隨定時巡邏刪除，突變範圍回到 `decideStart`（1 個突變，已殺死）。
