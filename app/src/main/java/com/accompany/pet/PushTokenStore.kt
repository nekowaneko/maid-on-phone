package com.accompany.pet

import android.content.Context

// 常數定義
const val PUSH_TOKEN_FILE = "push-token.txt"  // 推播代碼檔名（只存在 App 私有資料夾）

// 推播代碼（FCM 憑證）的存取：只存檔與顯示在主畫面，不寫進 log（A17）
class PushTokenStore(context: Context) {
    private val file = java.io.File(context.filesDir, PUSH_TOKEN_FILE)  // 存放位置

    // 讀取推播代碼；尚未取得時回傳 null
    fun load(): String? = try {
        if (file.isFile) file.readText().trim().ifEmpty { null } else null
    } catch (e: java.io.IOException) {
        null
    }

    // 存入新的推播代碼
    fun save(value: String) {
        file.writeText(value)
    }
}
