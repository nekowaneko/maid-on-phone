package com.accompany.pet.core

// 角色位置的存取介面
interface PositionStore {
    fun load(): Point?
    fun save(p: Point)
}

// 把 "x,y" 文字解析成座標；格式錯誤回傳 null
fun parsePoint(text: String): Point? {
    val parts = text.trim().split(",")
    if (parts.size != 2) return null
    val x = parts[0].trim().toIntOrNull() ?: return null
    val y = parts[1].trim().toIntOrNull() ?: return null
    return Point(x, y)
}

// 把位置存成檔案（內容 x,y）
class FilePositionStore(private val file: java.io.File) : PositionStore {
    // 讀取位置；檔案不存在或格式錯誤回傳 null
    override fun load(): Point? = try {
        if (file.isFile) parsePoint(file.readText()) else null
    } catch (e: java.io.IOException) {
        null  // 讀取失敗就用預設位置
    }

    // 寫入位置（只會寫這一個專用檔案）
    override fun save(p: Point) {
        file.parentFile?.mkdirs()
        file.writeText("${p.x},${p.y}")
    }
}

// 只存在記憶體的位置存取，給測試用
class InMemoryPositionStore : PositionStore {
    private var saved: Point? = null  // 目前存的位置

    // 讀取位置
    override fun load(): Point? = saved

    // 寫入位置
    override fun save(p: Point) {
        saved = p
    }
}
