package com.accompany.pet

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.addCallback
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.accompany.pet.core.chat.isSameOrigin
import com.accompany.pet.core.chat.normalizeChatUrl
import java.io.ByteArrayInputStream

// 常數定義
const val CHAT_BLOCKED_STATUS = 403             // 非同源子資源回應的狀態碼
const val CHAT_BLOCKED_REASON = "Forbidden"     // 非同源子資源回應的理由

// 聊天畫面：全螢幕 WebView，只載入使用者自己的 Worker B 網頁（架構約束 A4、A23）
// 不提供任何 JS 介面給遠端網頁（A5）；SSL 錯誤沿用 WebView 預設（取消載入）
class ChatActivity : AppCompatActivity() {

    private var webView: WebView? = null  // 聊天網頁

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = normalizeChatUrl(BuildConfig.CHAT_URL)
        if (url == null) {
            finish()  // 防禦：沒設定或不是 https 就不開（正常流程在泡泡就擋下了）
            return
        }
        enableEdgeToEdge()
        val wv = WebView(this)
        wv.settings.javaScriptEnabled = true      // 聊天網頁需要 JavaScript
        wv.settings.domStorageEnabled = true      // 聊天網頁用它記存取密鑰與聊天紀錄
        wv.settings.allowFileAccess = false       // 遠端內容不得讀本機檔案
        wv.settings.allowContentAccess = false
        wv.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW  // https 頁面不得載入 http 內容
        wv.webViewClient = ChatWebViewClient(url)
        val box = FrameLayout(this)  // WebView 不吃 padding，由外層容器讓出系統列的空間
        box.addView(wv, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(box)
        ViewCompat.setOnApplyWindowInsetsListener(box) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)  // 不被狀態列、導覽列與鍵盤蓋住
            insets
        }
        onBackPressedDispatcher.addCallback(this) { goBackOrFinish() }
        webView = wv
        wv.loadUrl(url)
    }

    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }

    // 返回鍵：網頁可返回就返回，否則結束畫面
    private fun goBackOrFinish() {
        val wv = webView
        if (wv != null && wv.canGoBack()) wv.goBack() else finish()
    }

    // 只允許與聊天網址同源的導覽與子資源，其他一律擋下（M15-S04）
    private inner class ChatWebViewClient(private val baseUrl: String) : WebViewClient() {
        // 攔截頁面跳轉：非同源回傳 true，停在原頁
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            !isSameOrigin(baseUrl, request.url.toString())

        // 攔截子資源請求：同源照常載入，非同源回 403
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            if (isSameOrigin(baseUrl, request.url.toString())) return null
            return WebResourceResponse("text/plain", "utf-8", CHAT_BLOCKED_STATUS, CHAT_BLOCKED_REASON, emptyMap(), ByteArrayInputStream(ByteArray(0)))
        }

        // 渲染程序被系統收掉：結束聊天畫面，不讓整個 App 閃退
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            Log.w(LOG_TAG, "聊天畫面渲染程序結束，crash=${detail.didCrash()}")
            webView?.destroy()
            webView = null
            finish()
            return true
        }
    }
}
