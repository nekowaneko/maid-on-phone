# 規格對照表（SPEC-MAP）

規格範例表 docs/EXPENSIVE-PLAN.md §4.5 → 測試位置。
測試檔：`core/src/test/kotlin/com/accompany/pet/spec/SpecTest.kt`（類別 `SpecTest`，T0b 後凍結）

| 編號 | 驗證 | 測試函式 |
|---|---|---|
| S01 | 自動＋手機 | `S01 還沒授權懸浮窗時按開始會顯示權限說明而不是角色` |
| S02 | 自動＋手機 | `S02 麥克風權限被拒絕時泡泡顯示需要麥克風權限才能用說的` |
| S03 | 自動 | `S03 同一時間連續匯出兩次會產生兩個不同檔案且第一個檔案內容不變` |
| S04 | 手機 | 見 DEVICE-CHECKLIST.md |
| S05 | 手機 | 見 DEVICE-CHECKLIST.md |
| S06 | 手機 | 見 DEVICE-CHECKLIST.md |
| S07 | 自動＋手機 | `S07 把角色拖到左半邊放開會吸附到左邊緣` |
| S08 | 自動＋手機 | `S08 拖出螢幕上下邊界時角色停在螢幕邊界內` |
| S09 | 自動＋手機 | `S09 停止後重新開始角色出現在上次放開的位置` |
| S10 | 自動＋手機（3 秒） | `S10 螢幕關閉時動畫暫停打開後恢復播放` |
| S11 | 手機 | 見 DEVICE-CHECKLIST.md |
| S12 | 手機 | 見 DEVICE-CHECKLIST.md |
| S13 | 自動＋手機 | `S13 按通知欄的停止會結束服務並移除常駐通知` |
| S14 | 自動 | `S14 服務運作期間每15分鐘記錄一筆含時間電量螢幕動畫四個欄位` |
| S15 | 自動＋手機 | `S15 手機沒有網路時照常運作 Manifest 不含 INTERNET 權限` |

## M1

規格範例表 docs/M1-EXPENSIVE-PLAN.md §4.5 → 測試位置。
測試檔：`core/src/test/kotlin/com/accompany/pet/spec/m1/M1SpecTest.kt`（類別 `M1SpecTest`，T0b 後凍結）
M0-S15 修訂版取代 `SpecTest.kt` 內的 S15，函式名稱開頭仍為 `S15`。

| 編號 | 驗證 | 測試函式 |
|---|---|---|
| M1-S01 | 自動 | `M1-S01 角色模式開且沒在玩遊戲時收到提醒會讓角色出現並顯示該則文字` |
| M1-S02 | 自動 | `M1-S02 角色模式關時收到提醒會跳出一般通知` |
| M1-S03 | 自動＋手機 | `M1-S03 玩遊戲時收到提醒不出現角色而是排隊並放靜音通知`；手機見 DEVICE-CHECKLIST-M1.md |
| M1-S04 | 自動＋手機 | `M1-S04 使用自訂遊戲清單內的 App 時和玩遊戲一樣排隊`；手機見 DEVICE-CHECKLIST-M1.md |
| M1-S05 | 自動 | `M1-S05 角色出現時先列出排隊中的提醒再顯示新內容並清空排隊` |
| M1-S06 | 自動 | `M1-S06 排隊中三小時前的提醒直接丟掉只報告三十分鐘前的兩則` |
| M1-S07 | 自動 | `M1-S07 排隊中的提醒剛好滿兩小時算過期` |
| M1-S08 | 自動 | `M1-S08 內容空白或格式錯誤的推播解析為空` |
| M1-S09 | 自動 | `M1-S09 同一個編號收到兩次只處理一次` |
| M1-S10 | 自動＋手機 | `M1-S10 沒給使用情形存取權時當作沒在玩遊戲`；手機見 DEVICE-CHECKLIST-M1.md |
| M1-S11 | 自動＋手機 | `M1-S11 角色出現後三分鐘沒互動就自動收起`；手機見 DEVICE-CHECKLIST-M1.md |
| M1-S12 | 自動 | `M1-S12 點角色點泡泡或按麥克風會重新計時三分鐘` |
| M1-S13 | 手機 | 見 DEVICE-CHECKLIST-M1.md |
| M1-S14 | 自動＋手機 | `M1-S14 角色模式開關會被記住且關閉時提醒改成一般通知`；手機見 DEVICE-CHECKLIST-M1.md |
| M1-S15 | 自動 | `M1-S15 排隊已有二十則又排進第二十一則會丟掉最舊的一則` |
| M0-S15（修訂） | 自動 | `S15 App 只透過 Firebase 推播收資料不自行連其他外部服務` |

## M1.5

規格範例表 docs/M1.5-EXPENSIVE-PLAN.md §4.5 → 測試位置（T0b 後凍結）。
- Kotlin：`core/src/test/kotlin/com/accompany/pet/spec/m15/M15SpecTest.kt`（類別 `M15SpecTest`）
- JS：`backend/tests/spec/m15/push.test.js`、`backend/tests/spec/m15/config.test.js`

| 編號 | 驗證 | 檔案與測試名稱 |
|---|---|---|
| M15-S01 | 自動 | push.test.js：`M15-S01 沒帶存取密鑰或密鑰錯誤時回覆未授權且不送出推播` |
| M15-S02 | 自動 | push.test.js：`M15-S02 還沒設定推播代碼或服務帳戶時回覆尚未設定推播且不送出` |
| M15-S03 | 自動 | config.test.js：`M15-S03 Worker B 名稱與資料庫名稱和 accompany_bot 不同` |
| M15-S04 | 自動＋手機 | M15SpecTest.kt：`M15-S04 聊天畫面中點到不是 Worker B 網址的連結不在 App 裡開啟`；手機見 DEVICE-CHECKLIST-M1.5.md |
| M15-S05 | 自動 | M15SpecTest.kt：`M15-S05 聊天網址是 http 開頭時當作沒有設定` |
| M15-S06 | 自動＋手機 | M15SpecTest.kt：`M15-S06 還沒設定聊天網址時按聊聊不開聊天畫面並顯示提示`；手機見 DEVICE-CHECKLIST-M1.5.md |
| M15-S07 | 自動 | push.test.js：`M15-S07 送出的推播只含 id 與 text、沒有通知欄位、優先順序為高，回覆成功與編號` |
| M15-S08 | 自動 | push.test.js：`M15-S08 沒指定編號連送兩次，兩次各自產生不同的新編號` |
| M15-S09 | 自動 | push.test.js：`M15-S09 指定編號 abc 時推播的 id 就是 abc` |
| M15-S10 | 自動 | push.test.js：`M15-S10 內容空白、缺少內容或主體不是 JSON 時回覆格式錯誤且不送出` |
| M15-S11 | 自動 | push.test.js：`M15-S11 內容超過 500 字時回覆訊息太長了且不送出，剛好 500 字可以送出` |
| M15-S12 | 自動 | push.test.js：`M15-S12 Google 回覆錯誤時回覆失敗並附上錯誤代碼且不自動重試` |
| M15-S13 | 自動＋手機 | M15SpecTest.kt：`M15-S13 泡泡裡在說話右邊多一顆聊聊按鈕且按下後開啟聊天畫面`；手機見 DEVICE-CHECKLIST-M1.5.md |

## M1.6

規格範例表 docs/M1.6-EXPENSIVE-PLAN.md §4.5 → 測試位置。
測試檔：`core/src/test/kotlin/com/accompany/pet/spec/m16/M16SpecTest.kt`、`backend/tests/spec/m16/push.test.js`、`backend/tests/spec/m16/overlay.test.js`（T0 後凍結）

| 編號 | 驗證 | 檔案與測試名稱 |
|---|---|---|
| M16-S01 | 自動 | m16/push.test.js：`M16-S01 帶表情標籤的推播送到手機時有編號、去掉方括號的顯示用文字與原文三個欄位` |
| M16-S02 | 自動 | m16/push.test.js：`M16-S02 內容只有標籤沒有台詞時回覆格式錯誤且不送出推播` |
| M16-S03 | 自動＋手機 | M16SpecTest.kt：`M16-S03 角色模式關時通知欄顯示純文字看不到方括號`；手機見 DEVICE-CHECKLIST-M1.6.md |
| M16-S04 | 自動 | M16SpecTest.kt：`M16-S04 角色模式開時角色演出用的是原文` |
| M16-S05 | 自動 | M16SpecTest.kt：`M16-S05 舊格式推播照常處理且演出用同一段文字` |
| M16-S06 | 自動 | M16SpecTest.kt：`M16-S06 原文超過500字時不閃退並改用顯示用文字演出` |
| M16-S07 | 自動＋手機 | M16SpecTest.kt：`M16-S07 排隊兩則依收到順序報告且第二則換回平常的臉`；手機見 DEVICE-CHECKLIST-M1.6.md |
| M16-S08 | 自動 | M16SpecTest.kt：`M16-S08 更新前的舊版排隊檔更新後照常報告一則都不少` |
| M16-S09 | 手機 | 見 DEVICE-CHECKLIST-M1.6.md A 節 |
| M16-S10 | 自動＋手機 | m16/overlay.test.js：`M16-S10 先換 pout 臉停 0.45 秒才出第一個字之後每 0.08 秒一個字句尾多停 0.5 秒打到第 9 個字時換 smile 臉` |
| M16-S11 | 自動 | m16/overlay.test.js：`M16-S11 不在表情清單裡的標籤用平常的臉說而且泡泡裡看不到標籤` |
| M16-S12 | 自動＋手機 | m16/overlay.test.js：`M16-S12 最後一個字出現後再過 3 秒換回平常的臉` |
| M16-S13 | 自動＋手機 | m16/overlay.test.js：`M16-S13 演出中又來一則時第一則照常演完才開始演第二則` |
| M16-S14 | 自動＋手機 | m16/overlay.test.js：`M16-S14 演出被打斷時直接跳到演完泡泡顯示全部完整台詞且換回平常的臉` |
| M16-S15 | 自動 | m16/overlay.test.js：`M16-S15 同一句帶標籤的台詞懸浮窗和聊天網頁解析出的文字與換臉位置完全一樣`；另有 V27 |
## M4.1

規格範例表 docs/M4.1-EXPENSIVE-PLAN.md §4.5 → 測試位置（T0b 後凍結）。
- Kotlin：`core/src/test/kotlin/com/accompany/pet/spec/m41/M41SpecTest.kt`（類別 `M41SpecTest`）
- JS：`backend/tests/spec/m41/ma-back.test.js`

| 編號 | 驗證 | 測試檔與函式名稱 |
|---|---|---|
| M41-S01 | 自動 | M41SpecTest.kt：`M41-S01 最近一份報告是 10月12日（週一），資料正常，多頭 1 檔、空頭 1 檔、其他 3 檔` |
| M41-S02 | 自動 | M41SpecTest.kt：`M41-S02 最近一份報告是 10月16日（週五），資料正常，多頭 2 檔、空頭 0 檔、其他 0 檔` |
| M41-S03 | 自動 | M41SpecTest.kt：`M41-S03 伺服器回報「今天的資料沒拿到」（證交所取得失敗），副標顯示「今天的資料沒拿到，點了可重試」，不顯示任何檔數` |
| M41-S04 | 自動＋手機 | M41SpecTest.kt：`M41-S04 App 連不上伺服器（沒網路或逾時），副標顯示「今天的資料沒拿到，點了可重試」，卡片仍可點`；手機見 DEVICE-CHECKLIST-M4.1.md D11 |
| M41-S05 | 自動 | M41SpecTest.kt：`M41-S05 追蹤清單是空的，副標顯示「還沒有追蹤標的，點了去加入」` |
| M41-S06 | 自動＋手機 | M41SpecTest.kt：`M41-S06 清單有標的但還沒有任何報告，副標顯示還沒有報告，明天 08點30 會送來`；手機見 DEVICE-CHECKLIST-M4.1.md D10 |
| M41-S07 | 自動＋手機 | M41SpecTest.kt：`M41-S07 App 還沒設定連線（沒有聊天網址或存取密鑰），副標顯示「尚未設定連線」，不連線`；手機見 DEVICE-CHECKLIST-M4.1.md；接線見 V40 |
| M41-S08 | 自動＋手機 | M41SpecTest.kt：`M41-S08 資料還沒回來的那段時間，副標顯示「正在取得今天的資料…」`；手機見 DEVICE-CHECKLIST-M4.1.md |
| M41-S09 | 自動 | M41SpecTest.kt：`M41-S09 伺服器回的內容怪怪的（狀態不認得，或檔數是負數、不是數字），副標顯示「今天的資料沒拿到，點了可重試」，不顯示怪數字` |
| M41-S10 | 手機 | 見 DEVICE-CHECKLIST-M4.1.md D07；接線見 V40 |
| M41-S11 | 自動＋手機 | ma-back.test.js：`M41-S11 在明細頁（今天分頁）按畫面左上的「‹」，關閉明細頁，回到進來的地方`；手機見 DEVICE-CHECKLIST-M4.1.md D08；接線見 V41 |
| M41-S12 | 自動 | ma-back.test.js：`M41-S12 在追蹤清單頁或看懂排列頁按畫面左上的「‹」，只是回到明細頁，不關閉明細頁`；手機見 DEVICE-CHECKLIST-M4.1.md D09 |
| M41-S13 | 手機 | 見 DEVICE-CHECKLIST-M4.1.md D13；接線見 V40 |
| M41-S14 | 自動＋手機 | M41SpecTest.kt：`M41-S14 聊天網址沒設定，在主畫面點「聊聊」卡片，不開聊天畫面，顯示現有的「尚未設定」訊息`；手機見 DEVICE-CHECKLIST-M4.1.md D15 |
| M41-S15 | 手機 | 見 DEVICE-CHECKLIST-M4.1.md D10；接線見 V40 |

> 註：T0b 凍結時尚未建立 MaEntry.kt，Kotlin 規格測試尚未編譯通過、JS 規格測試尚未通過，屬正常狀態。
