package com.accompany.pet.core.ma

import com.accompany.pet.core.drink.apiOrigin

// 常數定義
const val MA_PAYLOAD_MAX_CHARS = 2048
const val MA_PAGE_PATH = "/web/ma.html"
const val MA_EXIT_URL = "ma-exit://close" // 與 ma-contract.json 的 exitUrl 相同

// 解析並清理盤前均線負載：null、超過 2048 字、trim 後不是 { 開頭 } 結尾 → null；否則回傳 trim 後原文
fun pickMaPayload(raw: String?): String? {
    if (raw == null) return null // 沒有負載直接回傳 null
    val trimmed = raw.trim() // 去除前後空白
    if (trimmed.length > MA_PAYLOAD_MAX_CHARS) return null // 超過長度上限丟棄
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null // 非 JSON 物件字串丟棄
    return trimmed // 回傳整理後的原始字串
}

// 根據聊天網址解析出盤前均線網頁的完整網址；chatUrl 不是 https 或無法解析時回傳 null
fun maPageUrl(chatUrl: String?): String? {
    if (chatUrl == null) return null // 未提供聊天網址時無法組裝
    val origin = apiOrigin(chatUrl) ?: return null // 解析同源網域，失敗或非 https 回傳 null
    return "$origin$MA_PAGE_PATH" // 拼接盤前均線網頁路徑
}

// 判斷網址是不是明細網頁要求關閉明細頁的網址；只接受與 MA_EXIT_URL 逐字相同者（不分大小寫的 scheme 也不放行）
fun isMaExitUrl(url: String?): Boolean {
    return url == MA_EXIT_URL // 僅逐字相符時放行
}

