package com.accompany.pet

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager

// 常數定義
const val LISTEN_LAUNCH_TIMEOUT_MS = 1500L  // 收音畫面在這段時間內沒開起來，就改由服務直接辨識

// 一次收音請求：辨識結果與提示要交回給誰
class ListenRequest(val onResult: (String) -> Unit, val onStatus: (String) -> Unit)

// 看不見的收音畫面。Android 只讓「使用中」的 App 透過語音辨識服務收音；懸浮窗的前景服務若是在背景
// （例如定時推播）叫起的，系統會把麥克風靜音，辨識服務只收到無聲而回「沒聽清楚」。
// 按「說話」時開這個 1×1 的透明畫面，讓 App 在辨識期間成為前景，辨識結束就關掉。
// 所有方法都在主執行緒呼叫。
class ListenActivity : Activity() {

    companion object {
        private var pending: ListenRequest? = null  // 等畫面開起來時取走的請求
        private var active: ListenActivity? = null  // 正在收音的畫面

        // 開啟收音畫面；回傳這次的請求，給呼叫端在逾時後確認畫面有沒有開起來
        fun launch(context: Context, request: ListenRequest): ListenRequest {
            active?.finish()  // 上一次還沒結束就收掉，以這次為準
            pending = request
            context.startActivity(
                Intent(context, ListenActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION),
            )
            return request
        }

        // 畫面沒有取走請求時收回並回 true（代表畫面沒開起來，呼叫端要自己處理）
        fun withdraw(request: ListenRequest): Boolean {
            if (pending !== request) return false
            pending = null
            return true
        }

        // 角色收起時：丟掉還沒取走的請求、關掉正在收音的畫面
        fun cancel() {
            pending = null
            active?.finish()
        }
    }

    private var speech: SpeechBridge? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 視窗縮成左上角 1×1、不攔觸控也不搶焦點：使用者照常操作底下的 App 與懸浮角色
        window.setLayout(1, 1)
        window.setGravity(Gravity.TOP or Gravity.START)
        window.addFlags(
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
        )
        val request = pending
        if (request == null) {
            finish()  // 不是由角色開的（例如畫面被系統重建），沒有要做的事
            return
        }
        pending = null
        active = this
        speech = SpeechBridge(this, onResult = request.onResult, onStatus = request.onStatus, onDone = ::finish).also { it.start() }
    }

    override fun finish() {
        super.finish()
        @Suppress("DEPRECATION") overridePendingTransition(0, 0)  // 關閉時不要轉場動畫
    }

    override fun onDestroy() {
        speech?.release()
        speech = null
        if (active === this) active = null
        super.onDestroy()
    }
}
