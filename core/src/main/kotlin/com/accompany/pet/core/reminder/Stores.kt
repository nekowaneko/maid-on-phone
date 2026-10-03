package com.accompany.pet.core.reminder

// 排隊中提醒的存取介面
interface ReminderQueueStore {
    fun load(): List<Reminder>
    fun save(queue: List<Reminder>)
}

// 把排隊存成檔案（一則一行，壞掉的行略過）
class FileReminderQueueStore(private val file: java.io.File) : ReminderQueueStore {
    override fun load(): List<Reminder> = TODO()
    override fun save(queue: List<Reminder>) = TODO()
}

// 只存在記憶體的排隊，給測試用
class InMemoryReminderQueueStore : ReminderQueueStore {
    override fun load(): List<Reminder> = TODO()
    override fun save(queue: List<Reminder>) = TODO()
}

// 已處理過的提醒編號（去重用）
interface SeenIdStore {
    fun contains(id: String): Boolean
    fun add(id: String)
}

// 把已處理編號存成檔案，只保留最近 keep 個
class FileSeenIdStore(private val file: java.io.File, private val keep: Int = 200) : SeenIdStore {
    override fun contains(id: String): Boolean = TODO()
    override fun add(id: String) = TODO()
}

// 只存在記憶體的已處理編號，給測試用
class InMemorySeenIdStore : SeenIdStore {
    override fun contains(id: String): Boolean = TODO()
    override fun add(id: String) = TODO()
}

// 角色模式（開／關）的存取介面
interface PetModeStore {
    fun load(): Boolean
    fun save(on: Boolean)
}

// 把角色模式存成檔案（內容 1／0；讀取失敗為 false）
class FilePetModeStore(private val file: java.io.File) : PetModeStore {
    override fun load(): Boolean = TODO()
    override fun save(on: Boolean) = TODO()
}

// 只存在記憶體的角色模式，給測試用
class InMemoryPetModeStore : PetModeStore {
    override fun load(): Boolean = TODO()
    override fun save(on: Boolean) = TODO()
}
