package com.accompany.pet

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.accompany.pet.core.drink.STATUS_NOT_SET
import com.accompany.pet.core.drink.STATUS_UNREACHABLE
import com.accompany.pet.core.drink.apiOrigin
import java.io.IOException
import java.io.InputStream
import java.net.URL
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

// App 唯一可以連外的檔案（M2 A12 修訂）：只連 apiOrigin(BuildConfig.CHAT_URL) 算出的網域
// 連線物件一律轉成 HttpsURLConnection：不是加密連線就轉型失敗、不送出（密鑰不會走明文）

// 常數定義
const val WORKER_TIMEOUT_MILLIS = 15_000          // 連線逾時 15 秒
const val WORKER_READ_TIMEOUT_MILLIS = 45_000     // 讀取逾時 45 秒：parse 會呼叫語言模型 2～3 次，實測 14～29 秒（2026-10-05 使用者決定）
const val WORKER_MAX_RESPONSE_BYTES = 64 * 1024   // 回應最多讀 64 KB，超過視為連不上
const val HEADER_APP_SECRET = "x-app-secret"      // 授權標頭
const val CONTENT_TYPE_JSON = "application/json; charset=utf-8"  // 送出的格式

// 呼叫 Worker 的結果：status 為 HTTP 狀態碼，或 STATUS_NOT_SET（沒設定）、STATUS_UNREACHABLE（連不上、逾時）；text 為回應原文
data class WorkerResult(val status: Int, val text: String)

// 呼叫 Worker：在背景執行緒連線，結果一律回主執行緒；回應內容與密鑰不寫進 log
object WorkerApi {
    private val worker = Executors.newSingleThreadExecutor()  // 依序送出，避免同時多個請求
    private val main = Handler(Looper.getMainLooper())         // 主執行緒

    // 送 POST，bodyJson 為 JSON 字串
    fun post(path: String, bodyJson: String, callback: (WorkerResult) -> Unit) = send("POST", path, bodyJson, callback)

    // 送 GET
    fun get(path: String, callback: (WorkerResult) -> Unit) = send("GET", path, null, callback)

    // 送 PUT（戒飲設定儲存用），bodyJson 為 JSON 字串
    fun put(path: String, bodyJson: String, callback: (WorkerResult) -> Unit) = send("PUT", path, bodyJson, callback)

    // 組網址；沒設定聊天網址或密鑰時回 null（不連線）
    private fun targetUrl(path: String): String? {
        val origin = apiOrigin(BuildConfig.CHAT_URL) ?: return null  // 只能連聊天網址的網域
        if (BuildConfig.API_SECRET.isEmpty()) return null             // 沒密鑰不連
        if (!path.startsWith("/")) return null                         // 路徑必須從根目錄開始，避免拼出別的網域
        return origin + path
    }

    // 在背景執行緒送出請求，結果回主執行緒
    private fun send(method: String, path: String, bodyJson: String?, callback: (WorkerResult) -> Unit) {
        val url = targetUrl(path)
        if (url == null) {
            main.post { callback(WorkerResult(STATUS_NOT_SET, "")) }  // 尚未設定：不連線
            return
        }
        worker.execute {
            val result = request(method, url, bodyJson)
            Log.i(LOG_TAG, "Worker $method $path 狀態 ${result.status}")  // 只記狀態碼
            main.post { callback(result) }
        }
    }

    // 實際連線（在背景執行緒）；任何連線錯誤都回 STATUS_UNREACHABLE
    private fun request(method: String, url: String, bodyJson: String?): WorkerResult {
        var conn: HttpsURLConnection? = null
        return try {
            val opened = URL(url).openConnection() as? HttpsURLConnection
                ?: return WorkerResult(STATUS_UNREACHABLE, "")  // 不是加密連線就不送
            conn = opened.apply {
                requestMethod = method
                connectTimeout = WORKER_TIMEOUT_MILLIS
                readTimeout = WORKER_READ_TIMEOUT_MILLIS
                instanceFollowRedirects = false                       // 不跟著轉址到別的網域
                useCaches = false
                setRequestProperty(HEADER_APP_SECRET, BuildConfig.API_SECRET)
                setRequestProperty("content-type", CONTENT_TYPE_JSON)
            }
            if (bodyJson != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(bodyJson.toByteArray(Charsets.UTF_8)) }
            }
            val status = conn.responseCode
            val stream = if (status in 200..399) conn.inputStream else conn.errorStream  // 400 也要讀出 error 欄位
            WorkerResult(status, readLimited(stream))
        } catch (e: IOException) {
            Log.w(LOG_TAG, "Worker 連不上：${e.javaClass.simpleName}")  // 只記例外種類
            WorkerResult(STATUS_UNREACHABLE, "")
        } catch (e: SecurityException) {
            Log.w(LOG_TAG, "Worker 連線被系統拒絕")
            WorkerResult(STATUS_UNREACHABLE, "")
        } finally {
            conn?.disconnect()
        }
    }

    // 讀出回應文字（UTF-8），超過上限時丟出 IOException
    private fun readLimited(stream: InputStream?): String {
        if (stream == null) return ""
        val out = java.io.ByteArrayOutputStream()
        stream.use { input ->
            val buf = ByteArray(8 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break                                                     // 讀完了
                out.write(buf, 0, n)
                if (out.size() > WORKER_MAX_RESPONSE_BYTES) throw IOException("回應過大")  // 不無限制讀進記憶體
            }
        }
        return String(out.toByteArray(), Charsets.UTF_8)
    }
}
