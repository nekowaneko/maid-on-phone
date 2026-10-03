package com.accompany.pet.core.reminder

import java.util.Base64

// 常數定義
private const val FIELD_SEPARATOR = "\t"  // 排隊檔案的欄位分隔

// 把文字編成 Base64（避免內容裡的換行、定位字元弄壞檔案格式）
private fun encode(text: String): String = Base64.getEncoder().encodeToString(text.toByteArray(Charsets.UTF_8))

// 把 Base64 還原成文字；格式錯誤回傳 null
private fun decode(text: String): String? = try {
    String(Base64.getDecoder().decode(text), Charsets.UTF_8)
} catch (e: IllegalArgumentException) {
    null
}

// 把一則提醒轉成檔案裡的一行
private fun toLine(r: Reminder): String =
    listOf(r.receivedAtMillis.toString(), encode(r.id), encode(r.text)).joinToString(FIELD_SEPARATOR)

// 把檔案裡的一行還原成提醒；壞掉的行回傳 null
private fun fromLine(line: String): Reminder? {
    val parts = line.split(FIELD_SEPARATOR)
    if (parts.size != 3) return null
    val at = parts[0].toLongOrNull() ?: return null
    val id = decode(parts[1]) ?: return null
    val text = decode(parts[2]) ?: return null
    return Reminder(id, text, at)
}

// 排隊中提醒的存取介面
interface ReminderQueueStore {
    fun load(): List<Reminder>
    fun save(queue: List<Reminder>)
}

// 把排隊存成檔案（一則一行，壞掉的行略過）
class FileReminderQueueStore(private val file: java.io.File) : ReminderQueueStore {
    // 讀取排隊；檔案不存在或讀取失敗回傳空清單
    override fun load(): List<Reminder> = try {
        if (file.isFile) file.readLines().mapNotNull { fromLine(it) } else emptyList()
    } catch (e: java.io.IOException) {
        emptyList()
    }

    // 寫入排隊（只會寫這一個專用檔案）
    override fun save(queue: List<Reminder>) {
        file.parentFile?.mkdirs()
        file.writeText(queue.joinToString("\n") { toLine(it) })
    }
}

// 只存在記憶體的排隊，給測試用
class InMemoryReminderQueueStore : ReminderQueueStore {
    private var saved: List<Reminder> = emptyList()  // 目前的排隊

    override fun load(): List<Reminder> = saved
    override fun save(queue: List<Reminder>) {
        saved = queue
    }
}

// 已處理過的提醒編號（去重用）
interface SeenIdStore {
    fun contains(id: String): Boolean
    fun add(id: String)
}

// 把已處理編號存成檔案（一個編號一行，Base64），只保留最近 keep 個
class FileSeenIdStore(private val file: java.io.File, private val keep: Int = 200) : SeenIdStore {
    // 讀出所有已處理的編號
    private fun loadIds(): List<String> = try {
        if (file.isFile) file.readLines().mapNotNull { decode(it) } else emptyList()
    } catch (e: java.io.IOException) {
        emptyList()
    }

    override fun contains(id: String): Boolean = id in loadIds()

    // 加入一個編號，超過上限時丟掉最舊的
    override fun add(id: String) {
        val ids = (loadIds() + id).takeLast(keep)
        file.parentFile?.mkdirs()
        file.writeText(ids.joinToString("\n") { encode(it) })
    }
}

// 只存在記憶體的已處理編號，給測試用
class InMemorySeenIdStore : SeenIdStore {
    private val ids = mutableListOf<String>()  // 已處理的編號

    override fun contains(id: String): Boolean = id in ids
    override fun add(id: String) {
        ids.add(id)
    }
}

// 角色模式（開／關）的存取介面
interface PetModeStore {
    fun load(): Boolean
    fun save(on: Boolean)
}

// 把角色模式存成檔案（內容 1／0；讀取失敗為 false）
class FilePetModeStore(private val file: java.io.File) : PetModeStore {
    // 讀取角色模式；檔案不存在或讀取失敗為 false
    override fun load(): Boolean = try {
        file.isFile && file.readText().trim() == "1"
    } catch (e: java.io.IOException) {
        false
    }

    // 寫入角色模式
    override fun save(on: Boolean) {
        file.parentFile?.mkdirs()
        file.writeText(if (on) "1" else "0")
    }
}

// 只存在記憶體的角色模式，給測試用
class InMemoryPetModeStore : PetModeStore {
    private var on = false  // 目前的角色模式

    override fun load(): Boolean = on
    override fun save(on: Boolean) {
        this.on = on
    }
}
