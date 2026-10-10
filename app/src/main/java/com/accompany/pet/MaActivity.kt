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
import com.accompany.pet.core.ma.maPageUrl
import java.io.ByteArrayInputStream

// 常數定義
const val MA_BLOCKED_STATUS = 403             // 非同源子資源回應的狀態碼
const val MA_BLOCKED_REASON = "Forbidden"     // 非同源子資源回應的理由

// 盤前均線畫面：全螢幕 WebView，只載入使用者自己的 Worker B 網頁（架構約束 A44）
// 不提供任何 JS 介面給遠端網頁；SSL 錯誤沿用 WebView 預設（取消載入）
class MaActivity : AppCompatActivity() {

    private var webView: WebView? = null  // 盤前均線網頁

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = maPageUrl(BuildConfig.CHAT_URL)
        if (url == null) {
            finish()  // 防禦：沒設定或不是 https 就不開
            return
        }
        enableEdgeToEdge()
        val wv = WebView(this)
        wv.settings.javaScriptEnabled = true      // 明細網頁需要 JavaScript
        wv.settings.domStorageEnabled = true      // 明細網頁用它記存取密鑰
        wv.settings.allowFileAccess = false       // 遠端內容不得讀本機檔案
        wv.settings.allowContentAccess = false
        wv.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW  // https 頁面不得載入 http 內容
        wv.webViewClient = MaWebViewClient(url)
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

    // 只允許與盤前均線網址同源的導覽與子資源，其他一律擋下（A44）
    private inner class MaWebViewClient(private val baseUrl: String) : WebViewClient() {
        // 攔截頁面跳轉：非同源回傳 true，停在原頁
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            !isSameOrigin(baseUrl, request.url.toString())

        // 攔截子資源請求：同源照常載入，非同源回 403
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            if (isSameOrigin(baseUrl, request.url.toString())) return null
            return WebResourceResponse("text/plain", "utf-8", MA_BLOCKED_STATUS, MA_BLOCKED_REASON, emptyMap(), ByteArrayInputStream(ByteArray(0)))
        }

        // 渲染程序被系統收掉：結束盤前均線畫面，不讓整個 App 閃退
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            Log.w(LOG_TAG, "盤前均線畫面渲染程序結束，crash=${detail.didCrash()}")
            webView?.destroy()
            webView = null
            finish()
            return true
        }
    }
}
