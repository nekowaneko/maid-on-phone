package com.accompany.pet.helper

import com.accompany.pet.core.reminder.DEFAULT_GREETING
import com.accompany.pet.core.reminder.FilePetModeStore
import com.accompany.pet.core.reminder.FileReminderQueueStore
import com.accompany.pet.core.reminder.FileSeenIdStore
import com.accompany.pet.core.reminder.ForegroundKind
import com.accompany.pet.core.reminder.InMemoryPetModeStore
import com.accompany.pet.core.reminder.InMemoryReminderQueueStore
import com.accompany.pet.core.reminder.InMemorySeenIdStore
import com.accompany.pet.core.reminder.MAX_TEXT_LENGTH
import com.accompany.pet.core.reminder.QUEUE_REPORT_HEADER
import com.accompany.pet.core.reminder.Reminder
import com.accompany.pet.core.reminder.Route
import com.accompany.pet.core.reminder.RouteInput
import com.accompany.pet.core.reminder.classifyForeground
import com.accompany.pet.core.reminder.decideRoute
import com.accompany.pet.core.reminder.isGaming
import com.accompany.pet.core.reminder.parseReminder
import com.accompany.pet.core.reminder.reportText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

// M1 輔助測試：規格測試之外的邊界情況（可自由增修）
class ReminderHelperTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun `parseReminder 會 trim 並截斷過長文字`() {
        val r = parseReminder(mapOf("id" to " a ", "text" to "x".repeat(MAX_TEXT_LENGTH + 50), "extra" to "忽略"), 5L)
        assertNotNull(r)
        assertEquals("a", r!!.id)
        assertEquals(MAX_TEXT_LENGTH, r.text.length)
        assertEquals(5L, r.receivedAtMillis)
        assertNull(parseReminder(mapOf("id" to "  ", "text" to "x"), 0))
    }

    @Test
    fun `classifyForeground 系統分類優先且查不到時為一般`() {
        assertEquals(ForegroundKind.GAME, classifyForeground("a", true, setOf("a")))
        assertEquals(ForegroundKind.NORMAL, classifyForeground(null, false, setOf("a")))
        assertEquals(ForegroundKind.NORMAL, classifyForeground("b", false, setOf("a")))
        assertFalse(isGaming(ForegroundKind.NORMAL, true))
        assertFalse(isGaming(ForegroundKind.CUSTOM_GAME, false))
    }

    @Test
    fun `decideRoute 已看過優先於玩遊戲`() {
        assertEquals(Route.IGNORE, decideRoute(RouteInput(petMode = false, gaming = true, alreadySeen = true)))
        assertEquals(Route.QUEUE, decideRoute(RouteInput(petMode = false, gaming = true, alreadySeen = false)))
    }

    @Test
    fun `reportText 各種組合`() {
        val q = listOf(Reminder("1", "甲", 0), Reminder("2", "乙", 0))
        assertEquals(DEFAULT_GREETING, reportText(emptyList(), null))
        assertEquals(DEFAULT_GREETING, reportText(emptyList(), ""))
        assertEquals("$QUEUE_REPORT_HEADER\n・甲\n・乙", reportText(q, null))
        assertEquals("$QUEUE_REPORT_HEADER\n・甲\n・乙\n\n新", reportText(q, "新"))
    }

    @Test
    fun `排隊檔案可還原含換行與定位字元的內容並略過壞掉的行`() {
        val file = tmp.newFile("q.txt")
        val store = FileReminderQueueStore(file)
        val items = listOf(Reminder("id\t1", "第一行\n第二行\t尾", 100L), Reminder("2", "好", 200L))
        store.save(items)
        file.appendText("\n壞掉的行\nabc\tdef\n")
        assertEquals(items, FileReminderQueueStore(file).load())
        store.save(emptyList())
        assertTrue(store.load().isEmpty())
    }

    @Test
    fun `排隊檔案不存在時為空`() {
        assertTrue(FileReminderQueueStore(java.io.File(tmp.root, "none.txt")).load().isEmpty())
    }

    @Test
    fun `已處理編號只保留最近的幾個`() {
        val store = FileSeenIdStore(tmp.newFile("s.txt"), keep = 3)
        for (i in 1..5) store.add("id$i")
        assertFalse(store.contains("id1"))
        assertFalse(store.contains("id2"))
        assertTrue(store.contains("id3"))
        assertTrue(store.contains("id5"))
        assertFalse(FileSeenIdStore(java.io.File(tmp.root, "none.txt")).contains("x"))
    }

    @Test
    fun `角色模式檔案不存在或內容怪異時為關`() {
        val file = java.io.File(tmp.root, "mode.txt")
        assertFalse(FilePetModeStore(file).load())
        file.writeText("abc")
        assertFalse(FilePetModeStore(file).load())
    }

    @Test
    fun `記憶體版 store 行為與檔案版一致`() {
        val q = InMemoryReminderQueueStore()
        q.save(listOf(Reminder("1", "a", 1)))
        assertEquals(1, q.load().size)
        val s = InMemorySeenIdStore()
        assertFalse(s.contains("a"))
        s.add("a")
        assertTrue(s.contains("a"))
        val m = InMemoryPetModeStore()
        assertFalse(m.load())
        m.save(true)
        assertTrue(m.load())
    }
}
