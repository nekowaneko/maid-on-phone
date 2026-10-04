# AccompanyPet

會常駐在 Android 桌面、會動、可以點的陪伴角色。

## 目前階段：M0 耗電實測

M0 只驗證懸浮角色能不能常駐、耗電多少。不接 AI、不連網。

## 怎麼建置

用 Android Studio 開啟專案後按 ▶，或在終端機執行：

```
./gradlew assembleDebug
```

## 放入自己的角色圖

把 `idle.png`、`blink.png` 放進 `app/src/main/assets/pet/frames/local/`。
這個資料夾的內容不會進入 repo。

## 授權

程式碼採 MIT 授權。角色立繪不在授權範圍內。

## M1：角色需要時才出現

角色不再常駐。平常不在畫面上，三種情況才出現：
1. 點快速設定磚「🐾 陪伴角色」（同時切換角色模式開／關）
2. 角色模式開、沒在玩遊戲時，伺服器送來提醒
3. 點一般通知或「有 N 則提醒等你」通知

出現後 3 分鐘沒互動會自動收起。玩遊戲時收到的提醒會先排隊，不出聲。
推播設定見 docs/FIREBASE-SETUP.md。

## M1.5：陪伴核心

`backend/` 是 accompany_bot 的獨立副本（Worker B），提供聊天網頁與送推播，部署步驟見 docs/WORKER-SETUP.md。
點角色展開泡泡，按「說話」右邊的「聊聊」開啟聊天畫面。
角色立繪不在 git 裡，複製自本機的 accompany_bot。
