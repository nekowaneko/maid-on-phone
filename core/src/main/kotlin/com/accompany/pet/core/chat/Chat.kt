package com.accompany.pet.core.chat

// 常數定義
const val CHAT_NOT_SET_MESSAGE = "還沒設定聊天網址，見 docs/WORKER-SETUP.md"  // 沒設定聊天網址時泡泡顯示的文字

// 按「聊聊」後要做的事
enum class ChatAction { OPEN, SHOW_NOT_SET }

// 檢查聊天網址：trim 後必須是 https:// 開頭且主機非空，否則 null
fun normalizeChatUrl(raw: String?): String? = TODO()

// 兩個網址是否同源（scheme、主機、埠號都相同）
fun isSameOrigin(baseUrl: String, targetUrl: String): Boolean = TODO()

// 依聊天網址決定開啟聊天畫面或提示未設定
fun decideChat(rawUrl: String?): ChatAction = TODO()
