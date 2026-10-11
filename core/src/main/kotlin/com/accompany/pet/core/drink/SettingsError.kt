package com.accompany.pet.core.drink

// 常數定義
const val SETTINGS_ERROR_PREFIX = "設定值不正確："   // Worker 回報欄位錯誤的固定開頭（與 backend/core/drink.js 的 SETTINGS_ERROR_PREFIX 相同）

// 設定頁的五個欄位；label 與 backend/core/drink.js 的 SETTING_RULES 的 label 逐字相同
enum class SettingsField(val label: String) {
    NAME("訂閱名稱"),
    FEE("月費"),
    RESIST("忍住一杯的入帳金額"),
    QUOTA("每月額度"),
    ASK("每天詢問時間"),
}

// 從 Worker 回的錯誤訊息找出是哪個欄位；找不到對應欄位回 null（不猜、不做模糊或包含比對）
fun settingsFieldOf(message: String?): SettingsField? {
    if (message == null || !message.startsWith(SETTINGS_ERROR_PREFIX)) return null  // 沒有固定開頭
    val name = message.substring(SETTINGS_ERROR_PREFIX.length).trim()  // 去掉開頭與前後空白
    return SettingsField.values().firstOrNull { it.label == name }  // 必須恰好等於某個 label
}
