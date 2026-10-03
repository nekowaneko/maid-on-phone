package com.accompany.pet.core

// 角色位置的存取介面
interface PositionStore {
    fun load(): Point?
    fun save(p: Point)
}

// 把位置存成檔案（內容 x,y）
class FilePositionStore(private val file: java.io.File) : PositionStore {
    // 讀取位置；失敗回傳 null
    override fun load(): Point? = TODO()
    // 寫入位置
    override fun save(p: Point): Unit = TODO()
}

// 只存在記憶體的位置存取，給測試用
class InMemoryPositionStore : PositionStore {
    // 讀取位置
    override fun load(): Point? = TODO()
    // 寫入位置
    override fun save(p: Point): Unit = TODO()
}
