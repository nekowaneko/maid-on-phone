package com.accompany.pet

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

// 常數定義
const val MAX_DRINK_ACTION_LENGTH = 16 * 1024   // 網頁傳來的戒飲動作 JSON 最長字數，超過就略過
const val MAX_TODOIST_ACTION_LENGTH = 16 * 1024 // 網頁傳來的 Todoist 動作 JSON 最長字數，超過就略過

// WebView ↔ 原生橋接：四個沒有參數的方法＋onDrinkAction＋onTodoistAction，恰好 6 個（架構約束 A5，M4 修訂）
// 網頁呼叫時在背景執行緒，這裡統一轉回主執行緒再交給服務處理
class PetBridge(
    private val onTap: () -> Unit,              // 點角色時要做的事
    private val onMic: () -> Unit,              // 按麥克風時要做的事
    private val onChat: () -> Unit,             // 按「聊聊」時要做的事
    private val onDrink: (String) -> Unit,      // 按戒飲按鈕時要做的事（參數只當資料解析）
    private val onTodoist: (String) -> Unit,    // 按 Todoist 按鈕時要做的事（參數只當資料解析）
    private val onMa: () -> Unit = {},          // 按盤前均線按鈕時要做的事（M4）
) {
    private val main = Handler(Looper.getMainLooper())  // 主執行緒

    // 網頁通知：角色被點了
    @JavascriptInterface
    fun onPetTapped() {
        main.post { onTap() }
    }

    // 網頁通知：麥克風按鈕被按了
    @JavascriptInterface
    fun onMicPressed() {
        main.post { onMic() }
    }

    // 網頁通知：「聊聊」按鈕被按了
    @JavascriptInterface
    fun onChatPressed() {
        main.post { onChat() }
    }

    // 網頁通知：戒飲按鈕被按了（json 為 §4.3 的動作物件）；過長直接略過
    @JavascriptInterface
    fun onDrinkAction(json: String) {
        if (json.length > MAX_DRINK_ACTION_LENGTH) return  // 不處理異常大的資料
        main.post { onDrink(json) }
    }

    // 網頁通知：Todoist 按鈕被按了（json 為 §4.3 的動作物件）；超過 16 KB 直接略過
    @JavascriptInterface
    fun onTodoistAction(json: String) {
        if (json.length > MAX_TODOIST_ACTION_LENGTH) return  // 不處理異常大的資料
        main.post { onTodoist(json) }
    }

    // 網頁通知：盤前均線按鈕或看明細被按了（無參數，M4）
    @JavascriptInterface
    fun onMaPressed() {
        main.post { onMa() }
    }
}

