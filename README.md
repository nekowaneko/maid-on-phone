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
