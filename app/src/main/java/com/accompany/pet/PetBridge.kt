package com.accompany.pet

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

// WebView ↔ 原生橋接：只開放兩個方法給網頁（架構約束 A5）
// 網頁呼叫時在背景執行緒，這裡統一轉回主執行緒再交給服務處理
class PetBridge(
    private val onTap: () -> Unit,   // 點角色時要做的事
    private val onMic: () -> Unit,   // 按麥克風時要做的事
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
}
