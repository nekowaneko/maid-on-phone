package com.accompany.pet.helper

import com.accompany.pet.core.ma.MA_PAGE_PATH
import com.accompany.pet.core.ma.MA_PAYLOAD_MAX_CHARS
import com.accompany.pet.core.ma.maPageUrl
import com.accompany.pet.core.ma.pickMaPayload
import com.accompany.pet.core.reminder.Reminder
import com.accompany.pet.core.reminder.Route
import com.accompany.pet.core.reminder.RouteInput
import com.accompany.pet.core.reminder.decideRoute
import com.accompany.pet.core.reminder.parseReminder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

// M4 輔助測試：盤前均線在 core 端的決策分流與資料模型整合（可自由增修）
class M4HelperTest {

    // 測試既有的分流決策函式對帶 ma 欄位的提醒不受影響（M4-S15C 情境驗證）
    @Test
    fun decideRouteWithMaReminder() {
        val validMa = "{\"status\":\"ok\",\"u\":3,\"d\":0,\"m\":1}"
        val reminder = parseReminder(
            mapOf("id" to "m4-01", "text" to "早安報告", "ma" to validMa),
            100L
        )
        assertNotNull(reminder)
        assertEquals(validMa, reminder?.ma)

        // 角色模式開、未玩遊戲 -> SHOW_PET
        val routeShow = decideRoute(RouteInput(petMode = true, gaming = false, alreadySeen = false))
        assertEquals(Route.SHOW_PET, routeShow)

        // 角色模式關、未玩遊戲 -> NOTIFY
        val routeNotify = decideRoute(RouteInput(petMode = false, gaming = false, alreadySeen = false))
        assertEquals(Route.NOTIFY, routeNotify)

        // 正在玩遊戲 -> QUEUE
        val routeQueue = decideRoute(RouteInput(petMode = true, gaming = true, alreadySeen = false))
        assertEquals(Route.QUEUE, routeQueue)

        // 已看過 -> IGNORE
        val routeIgnore = decideRoute(RouteInput(petMode = true, gaming = false, alreadySeen = true))
        assertEquals(Route.IGNORE, routeIgnore)
    }

    // 測試 ma 負載格式損毀或超過 2048 字元時降級為一般提醒
    @Test
    fun corruptedMaPayloadFallsBackToRegularReminder() {
        // 非 JSON 物件格式（字串壞掉）
        val corruptedData = mapOf("id" to "m4-02", "text" to "均線通知", "ma" to "not-a-json-object")
        val reminderCorrupted = parseReminder(corruptedData, 200L)
        assertNotNull(reminderCorrupted)
        assertEquals("m4-02", reminderCorrupted?.id)
        assertEquals("均線通知", reminderCorrupted?.text)
        assertNull(reminderCorrupted?.ma)

        // 超過 2048 字元
        val oversizedData = mapOf("id" to "m4-03", "text" to "均線通知", "ma" to "{" + "x".repeat(2048) + "}")
        val reminderOversized = parseReminder(oversizedData, 300L)
        assertNotNull(reminderOversized)
        assertNull(reminderOversized?.ma)
    }

    // 測試常數定義與預期規格一致
    @Test
    fun verifyMaConstants() {
        assertEquals(2048, MA_PAYLOAD_MAX_CHARS)
        assertEquals("/web/ma.html", MA_PAGE_PATH)
    }

    // 測試 maPageUrl 組合結果
    @Test
    fun verifyMaPageUrl() {
        assertEquals("https://pet.example.workers.dev/web/ma.html", maPageUrl("https://pet.example.workers.dev/chat?token=123"))
        assertNull(maPageUrl("http://insecure.example.com"))
        assertNull(maPageUrl(null))
    }
}
