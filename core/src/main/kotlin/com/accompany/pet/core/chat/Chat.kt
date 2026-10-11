package com.accompany.pet.core.chat

// 常數定義
const val CHAT_NOT_SET_MESSAGE = "還沒設定聊天網址，見 docs/WORKER-SETUP.md"  // 沒設定聊天網址時泡泡顯示的文字
private const val HTTPS_PREFIX = "https://"     // 聊天網址唯一接受的開頭
private const val SCHEME_SEPARATOR = "://"      // scheme 與主機之間的分隔
private const val HTTPS_DEFAULT_PORT = 443      // https 沒寫埠號時的預設
private const val HTTP_DEFAULT_PORT = 80        // http 沒寫埠號時的預設
private const val AUTHORITY_END = "/?#"         // 主機段結束的字元

// 按「聊聊」後要做的事
enum class ChatAction { OPEN, SHOW_NOT_SET }

// 網址的來源：scheme、主機（皆小寫）與埠號
private data class Origin(val scheme: String, val host: String, val port: Int)

// scheme 沒寫埠號時的預設埠號；不認識的 scheme 回傳 null
private fun defaultPort(scheme: String): Int? = when (scheme) {
    "https" -> HTTPS_DEFAULT_PORT
    "http" -> HTTP_DEFAULT_PORT
    else -> null
}

// 以字串解析「scheme://主機[:埠號][/其餘]」；含帳密（@）、IPv6 或埠號不是數字時視為無法解析
private fun parseOrigin(url: String): Origin? {
    val sep = url.indexOf(SCHEME_SEPARATOR)
    if (sep <= 0) return null
    val scheme = url.substring(0, sep).lowercase()
    val rest = url.substring(sep + SCHEME_SEPARATOR.length)
    val end = rest.indexOfFirst { it in AUTHORITY_END }.let { if (it < 0) rest.length else it }
    val authority = rest.substring(0, end)
    if ('@' in authority || '[' in authority) return null  // 帳密與 IPv6 一律不接受（保守）
    val colon = authority.indexOf(':')
    val host = (if (colon < 0) authority else authority.substring(0, colon)).lowercase()
    if (host.isEmpty()) return null
    val port = if (colon < 0) {
        defaultPort(scheme) ?: return null
    } else {
        val text = authority.substring(colon + 1)
        if (text.isEmpty() || !text.all { it.isDigit() } || text.length > 5) return null
        text.toInt()
    }
    return Origin(scheme, host, port)
}

// 檢查聊天網址：trim 後必須是 https:// 開頭且主機非空，否則 null；其餘原樣回傳
fun normalizeChatUrl(raw: String?): String? {
    val url = raw?.trim() ?: return null
    if (!url.startsWith(HTTPS_PREFIX, ignoreCase = true)) return null  // 只接受 https（M15-S05）
    return if (parseOrigin(url) != null) url else null
}

// 兩個網址是否同源（scheme、主機、埠號都相同）；任一方無法解析回傳 false
fun isSameOrigin(baseUrl: String, targetUrl: String): Boolean {
    val base = parseOrigin(baseUrl) ?: return false
    val target = parseOrigin(targetUrl) ?: return false
    return base == target
}

// 依聊天網址決定開啟聊天畫面或提示未設定
fun decideChat(rawUrl: String?): ChatAction =
    if (normalizeChatUrl(rawUrl) == null) ChatAction.SHOW_NOT_SET else ChatAction.OPEN

// 常數定義
const val CHAT_EXIT_URL = "chat-exit://close"  // 與 call.json 的 exitUrl 相同

// 判斷網址是不是聊天網頁要求關閉聊天畫面的網址；只接受與 CHAT_EXIT_URL 逐字相同者（不分大小寫的 scheme 也不放行）
fun isChatExitUrl(url: String?): Boolean = url == CHAT_EXIT_URL
