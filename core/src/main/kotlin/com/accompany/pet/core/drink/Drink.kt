package com.accompany.pet.core.drink

// 常數定義
const val HTTPS_PREFIX = "https://"                     // 只接受加密連線
const val ACTION_RESIST = "resist"                      // 動作：沒喝
const val ACTION_SPEAK = "speak"                        // 動作：有喝，用說的
const val ACTION_CONFIRM = "confirm"                    // 動作：對，記下來
const val ACTION_PREVIEW = "preview"                    // 動作：改甜度、選品項後重新複述
const val ACTION_UNDO = "undo"                          // 動作：撤銷
const val ACTION_CANCEL = "cancel"                      // 動作：取消
const val ACTION_HISTORY = "history"                    // 動作：過往紀錄
const val RESIST_LABEL = "沒喝"                         // 通知按鈕文字（與 drink-labels.js 的 buttons 同一套字）
const val SPEAK_LABEL = "有喝，用說的"                  // 通知按鈕文字
const val PARSE_PATH = "/api/drink/parse"               // 語音辨識結果送去解析
const val SETTINGS_PATH = "/api/drink/settings"         // 戒飲設定
const val STATUS_NOT_SET = -1                           // 狀態：apiOrigin 或 apiSecret 沒設定，沒有連線
const val STATUS_UNREACHABLE = 0                        // 狀態：連不上或逾時
const val STATUS_UNAUTHORIZED = 401                     // 狀態：密鑰不對
const val ENABLED_PATH = "/api/drink/enabled"           // 戒飲記錄開關
const val STATUS_DISABLED = 403                         // 狀態：戒飲記錄已關閉
const val DRINK_DISABLED_MESSAGE = "戒飲記錄已關閉，請到「戒飲設定」重新開啟"  // 回 403 時的提示（以 Worker 的「戒飲記錄已關閉」開頭）
const val UNREACHABLE_MESSAGE = "連不上伺服器，晚點再試一次"                     // 連不上時的提示（§7.2）
const val API_NOT_SET_MESSAGE = "還沒設定 apiSecret，見 docs/WORKER-SETUP.md 第 8 節"  // 尚未設定時的提示
const val WRONG_SECRET_MESSAGE = "密鑰不對，檢查 apiSecret"                     // 回 401 時的提示
const val MAX_PORT_DIGITS = 5                           // 埠號最多 5 位數
val PUSH_ACTIONS = listOf(ACTION_RESIST, ACTION_SPEAK)  // 推播按鈕只認這兩個
private val DRINK_ENDPOINTS = mapOf(                    // 網頁按鈕動作對應的 Worker 路徑
    ACTION_CONFIRM to "/api/drink/confirm",
    ACTION_PREVIEW to "/api/drink/preview",
    ACTION_RESIST to "/api/drink/resist",
    ACTION_UNDO to "/api/drink/undo",
    ACTION_HISTORY to "/api/drink/history",
)
private const val AUTHORITY_END = "/?#"                 // 網域段結束的字元

// 從聊天網址取出「https://網域[:埠]」；不是 https:// 開頭、沒有網域、含帳密或埠號不對時回 null
fun apiOrigin(chatUrl: String): String? {
    val url = chatUrl.trim()                                            // 去掉前後空白
    if (!url.startsWith(HTTPS_PREFIX, ignoreCase = true)) return null  // 只接受 https
    val authority = url.substring(HTTPS_PREFIX.length).takeWhile { it !in AUTHORITY_END }  // 網域（含埠）到路徑前為止
    if (!isPlainAuthority(authority)) return null                      // 空的或可疑的網域
    return HTTPS_PREFIX + authority.lowercase()
}

// 檢查網域段：非空、不含帳密／IPv6／空白／反斜線，有冒號時後面必須是 1～5 位數字
fun isPlainAuthority(authority: String): Boolean {
    if (authority.isEmpty()) return false
    if (authority.any { it.isWhitespace() || it == '@' || it == '[' || it == '\\' }) return false  // 保守：一律拒絕
    val colon = authority.indexOf(':')
    if (colon < 0) return true                                  // 沒寫埠號
    if (colon == 0) return false                                // 只有埠號沒有網域
    val port = authority.substring(colon + 1)                   // 埠號文字
    return port.isNotEmpty() && port.length <= MAX_PORT_DIGITS && port.all { it in '0'..'9' }
}

// 網頁按鈕動作對應的 Worker 路徑；不需要連線或不認得的動作回 null
fun drinkEndpointFor(action: String): String? = DRINK_ENDPOINTS[action]

// 解析推播的按鈕字串：逗號分隔、trim、只留 resist 與 speak、去重、保留順序
fun parseDrinkActions(raw: String?): List<String> {
    if (raw.isNullOrEmpty()) return emptyList()    // 沒有按鈕
    return raw.split(',')
        .map { it.trim() }                         // 去掉空白
        .filter { it in PUSH_ACTIONS }             // 不認得的略過
        .distinct()                                // 重複的只留第一個
}

// 通知按鈕的文字；不認得的動作回 null
fun pushActionLabel(action: String): String? = when (action) {
    ACTION_RESIST -> RESIST_LABEL
    ACTION_SPEAK -> SPEAK_LABEL
    else -> null
}

// 呼叫 Worker 的結果要顯示的固定提示；2xx 回 null（照回應內容顯示）
fun workerErrorMessage(status: Int): String? = when {
    status in 200..299 -> null                     // 成功
    status == STATUS_NOT_SET -> API_NOT_SET_MESSAGE
    status == STATUS_UNAUTHORIZED -> WRONG_SECRET_MESSAGE
    status == STATUS_DISABLED -> DRINK_DISABLED_MESSAGE
    else -> UNREACHABLE_MESSAGE                    // 連不上、逾時、其他非 2xx
}

// 角色泡泡要不要顯示戒飲按鈕：只有「成功（2xx）且明確讀到 enabled 為 false」才隱藏；
// 非 2xx、沒設定、連不上、讀不到或格式不對（enabled 為 null）一律顯示（M43-S10 唯一允許的降級）
fun drinkUiEnabled(status: Int, enabled: Boolean?): Boolean = !(status in 200..299 && enabled == false)

// 每天詢問時間的選項：00:00～23:00 共 24 個
fun askTimeOptions(): List<String> = (0..23).map { it.toString().padStart(2, '0') + ":00" }  // 不受語系影響
