package com.accompany.pet.core

// 常數定義
const val WATCHDOG_INTERVAL_MINUTES = 5  // 定時巡邏間隔
private const val WANTED = "1"            // 檔案內容：想開著
private const val NOT_WANTED = "0"        // 檔案內容：不想開著

// 「使用者是否想讓角色開著」的存取介面
interface RunIntentStore {
    fun load(): Boolean
    fun save(wanted: Boolean)
}

// 把使用者意圖存成檔案（內容 1 或 0）
class FileRunIntentStore(private val file: java.io.File) : RunIntentStore {
    // 讀取意圖；檔案不存在、讀取失敗或內容不明時視為不想開著（保守）
    override fun load(): Boolean = try {
        file.isFile && file.readText().trim() == WANTED
    } catch (e: java.io.IOException) {
        false
    }

    // 寫入意圖
    override fun save(wanted: Boolean) {
        file.parentFile?.mkdirs()
        file.writeText(if (wanted) WANTED else NOT_WANTED)
    }
}

// 算出下一次巡邏的時間
fun nextWatchdogTime(nowMillis: Long): Long = nowMillis + WATCHDOG_INTERVAL_MINUTES * 60_000L
