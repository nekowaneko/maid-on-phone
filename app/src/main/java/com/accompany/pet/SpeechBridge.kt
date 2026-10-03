package com.accompany.pet

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

// 常數定義
const val SPEECH_LANGUAGE = "zh-TW"                                    // 辨識語言
const val MIC_UNAVAILABLE_MESSAGE = "目前無法使用麥克風，請打開 App 再試"  // 系統限制時的提示
const val LISTENING_MESSAGE = "我在聽…"                                 // 開始聆聽時的提示
const val NOT_HEARD_MESSAGE = "沒聽清楚，再說一次好嗎？"                 // 沒辨識出文字時的提示
const val NEED_LANGUAGE_PACK_MESSAGE = "需要連上網路，或先下載「中文（台灣）」離線語音包"  // 辨識服務無法使用時的提示
const val ERROR_LANGUAGE_NOT_SUPPORTED_CODE = 12   // SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED（API 31）
const val ERROR_LANGUAGE_UNAVAILABLE_CODE = 13     // SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE（API 31）

// 把辨識錯誤碼轉成泡泡要顯示的文字
fun speechErrorMessage(error: Int): String = when (error) {
    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> NOT_HEARD_MESSAGE
    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
    ERROR_LANGUAGE_NOT_SUPPORTED_CODE, ERROR_LANGUAGE_UNAVAILABLE_CODE -> NEED_LANGUAGE_PACK_MESSAGE  // 沒網路又沒離線語音包
    else -> "$MIC_UNAVAILABLE_MESSAGE（代碼 $error）"  // 附上錯誤碼方便實測回報；不嘗試繞過系統限制
}

// SpeechRecognizer → 文字。呼叫端須先確認已有麥克風權限；所有方法都在主執行緒呼叫
class SpeechBridge(private val context: Context, private val onText: (String) -> Unit) {

    private var recognizer: SpeechRecognizer? = null  // 辨識器（用到才建立）

    // 開始一次語音辨識
    fun start() {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            android.util.Log.w(LOG_TAG, "找不到語音辨識服務")
            onText("$MIC_UNAVAILABLE_MESSAGE（找不到語音辨識服務）")
            return
        }
        val r = recognizer ?: SpeechRecognizer.createSpeechRecognizer(context).also {
            it.setRecognitionListener(Listener())
            recognizer = it
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, SPEECH_LANGUAGE)  // 不設 EXTRA_PREFER_OFFLINE，由系統決定
        }
        onText(LISTENING_MESSAGE)
        try {
            r.startListening(intent)
        } catch (e: SecurityException) {
            onText(MIC_UNAVAILABLE_MESSAGE)  // 系統拒絕時只提示，不繞過
        }
    }

    // 釋放辨識器
    fun release() {
        recognizer?.destroy()
        recognizer = null
    }

    // 接收辨識結果
    private inner class Listener : RecognitionListener {
        // 辨識完成：顯示第一個結果
        override fun onResults(results: Bundle?) {
            val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
            onText(if (text.isNullOrBlank()) NOT_HEARD_MESSAGE else text)
        }

        // 辨識失敗：顯示對應提示
        override fun onError(error: Int) {
            android.util.Log.w(LOG_TAG, "語音辨識錯誤 $error")
            onText(speechErrorMessage(error))
        }

        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onPartialResults(partialResults: Bundle?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }
}
