package com.accompany.pet.spec.m1

import com.accompany.pet.core.reminder.DEFAULT_GREETING
import com.accompany.pet.core.reminder.FilePetModeStore
import com.accompany.pet.core.reminder.FileSeenIdStore
import com.accompany.pet.core.reminder.ForegroundKind
import com.accompany.pet.core.reminder.IDLE_HIDE_MILLIS
import com.accompany.pet.core.reminder.InMemoryReminderQueueStore
import com.accompany.pet.core.reminder.QUEUE_MAX
import com.accompany.pet.core.reminder.QUEUE_REPORT_HEADER
import com.accompany.pet.core.reminder.Reminder
import com.accompany.pet.core.reminder.Route
import com.accompany.pet.core.reminder.RouteInput
import com.accompany.pet.core.reminder.classifyForeground
import com.accompany.pet.core.reminder.decideRoute
import com.accompany.pet.core.reminder.drainAlive
import com.accompany.pet.core.reminder.enqueue
import com.accompany.pet.core.reminder.idleDeadline
import com.accompany.pet.core.reminder.isGaming
import com.accompany.pet.core.reminder.parseReminder
import com.accompany.pet.core.reminder.queueNoticeText
import com.accompany.pet.core.reminder.reportText
import com.accompany.pet.core.reminder.shouldHide
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

// M1 規格範例表（docs/M1-EXPENSIVE-PLAN.md §4.5）轉寫的測試，凍結後不得修改
class M1SpecTest {

    // 常數定義
    private val now = 1_800_000_000_000L          // 固定的現在時間
    private val minute = 60 * 1000L               // 一分鐘
    private val hour = 60 * minute                // 一小時

    @get:Rule
    val tmp = TemporaryFolder()

    // 建立一則測試用提醒
    private fun reminder(id: String, ageMillis: Long) = Reminder(id, "內容$id", now - ageMillis)

    @Test
    fun `M1-S01 角色模式開且沒在玩遊戲時收到提醒會讓角色出現並顯示該則文字`() {
        assertEquals(Route.SHOW_PET, decideRoute(RouteInput(petMode = true, gaming = false, alreadySeen = false)))
        assertEquals("該吃藥了", reportText(emptyList(), "該吃藥了"))
    }

    @Test
    fun `M1-S02 角色模式關時收到提醒會跳出一般通知`() {
        assertEquals(Route.NOTIFY, decideRoute(RouteInput(petMode = false, gaming = false, alreadySeen = false)))
    }

    @Test
    fun `M1-S03 玩遊戲時收到提醒不出現角色而是排隊並放靜音通知`() {
        assertTrue(isGaming(ForegroundKind.GAME, true))
        assertEquals(Route.QUEUE, decideRoute(RouteInput(petMode = true, gaming = true, alreadySeen = false)))
        assertEquals("有 2 則提醒等你", queueNoticeText(2))
    }

    @Test
    fun `M1-S04 使用自訂遊戲清單內的 App 時和玩遊戲一樣排隊`() {
        val kind = classifyForeground("com.example.mygame", false, setOf("com.example.mygame"))
        assertEquals(ForegroundKind.CUSTOM_GAME, kind)
        assertTrue(isGaming(kind, true))
        assertEquals(Route.QUEUE, decideRoute(RouteInput(petMode = true, gaming = isGaming(kind, true), alreadySeen = false)))
    }

    @Test
    fun `M1-S05 角色出現時先列出排隊中的提醒再顯示新內容並清空排隊`() {
        val store = InMemoryReminderQueueStore()
        store.save(listOf(reminder("a", 10 * minute), reminder("b", 5 * minute)))
        val alive = drainAlive(store.load(), now)
        val text = reportText(alive, "新的提醒")
        store.save(emptyList())  // 報告完清空
        assertTrue(text.startsWith(QUEUE_REPORT_HEADER))
        assertTrue(text.indexOf("內容a") < text.indexOf("內容b"))
        assertTrue(text.indexOf("內容b") < text.indexOf("新的提醒"))
        assertTrue(store.load().isEmpty())
    }

    @Test
    fun `M1-S06 排隊中三小時前的提醒直接丟掉只報告三十分鐘前的兩則`() {
        val alive = drainAlive(listOf(reminder("old", 3 * hour), reminder("x", 30 * minute), reminder("y", 30 * minute)), now)
        assertEquals(listOf("x", "y"), alive.map { it.id })
    }

    @Test
    fun `M1-S07 排隊中的提醒剛好滿兩小時算過期`() {
        assertTrue(drainAlive(listOf(reminder("edge", 2 * hour)), now).isEmpty())
    }

    @Test
    fun `M1-S08 內容空白或格式錯誤的推播解析為空`() {
        assertNull(parseReminder(mapOf("id" to "1", "text" to "   "), now))
        assertNull(parseReminder(mapOf("text" to "你好"), now))
        assertNull(parseReminder(mapOf("id" to "1"), now))
    }

    @Test
    fun `M1-S09 同一個編號收到兩次只處理一次`() {
        val file = tmp.newFile("seen.txt")
        FileSeenIdStore(file).add("r-1")
        assertTrue(FileSeenIdStore(file).contains("r-1"))  // 新實例仍記得
        assertEquals(Route.IGNORE, decideRoute(RouteInput(petMode = true, gaming = false, alreadySeen = true)))
    }

    @Test
    fun `M1-S10 沒給使用情形存取權時當作沒在玩遊戲`() {
        assertFalse(isGaming(ForegroundKind.GAME, false))
    }

    @Test
    fun `M1-S11 角色出現後三分鐘沒互動就自動收起`() {
        val t = now
        assertTrue(shouldHide(t, t + 3 * minute))
        assertFalse(shouldHide(t, t + 3 * minute - 1))
    }

    @Test
    fun `M1-S12 點角色點泡泡或按麥克風會重新計時三分鐘`() {
        val newInteraction = now + 90 * 1000L
        assertEquals(newInteraction + IDLE_HIDE_MILLIS, idleDeadline(newInteraction))
        assertEquals(newInteraction + 3 * minute, idleDeadline(newInteraction))
    }

    @Test
    fun `M1-S14 角色模式開關會被記住且關閉時提醒改成一般通知`() {
        val file = tmp.newFile("mode.txt")
        FilePetModeStore(file).save(true)
        assertTrue(FilePetModeStore(file).load())
        FilePetModeStore(file).save(false)
        val off = FilePetModeStore(file).load()
        assertFalse(off)
        assertEquals(Route.NOTIFY, decideRoute(RouteInput(petMode = off, gaming = false, alreadySeen = false)))
    }

    @Test
    fun `M1-S15 排隊已有二十則又排進第二十一則會丟掉最舊的一則`() {
        var queue = emptyList<Reminder>()
        for (i in 1..QUEUE_MAX) queue = enqueue(queue, reminder("r$i", 0))
        queue = enqueue(queue, reminder("r21", 0))
        assertEquals(QUEUE_MAX, queue.size)
        assertEquals("r2", queue.first().id)
        assertEquals("r21", queue.last().id)
        assertEquals("主人叫我嗎？", DEFAULT_GREETING)  // 預設問候語固定
    }
}
