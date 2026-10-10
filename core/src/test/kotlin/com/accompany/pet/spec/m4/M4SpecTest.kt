package com.accompany.pet.spec.m4

import com.accompany.pet.core.ma.MA_PAGE_PATH
import com.accompany.pet.core.ma.MA_PAYLOAD_MAX_CHARS
import com.accompany.pet.core.ma.maPageUrl
import com.accompany.pet.core.ma.pickMaPayload
import com.accompany.pet.core.reminder.Route
import com.accompany.pet.core.reminder.RouteInput
import com.accompany.pet.core.reminder.decideRoute
import com.accompany.pet.core.reminder.parseReminder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

// M4 規格範例表（docs/M4-EXPENSIVE-PLAN.md §4.5）中 Kotlin 的列（M4-S15C），凍結後不得修改
// 常數以接口塊 backend/config/ma-contract.json 為準（core 沒有 JSON 程式庫，這裡用正規表示式取值）
class M4SpecTest {

    // 常數定義
    private val now = 1_800_000_000_000L  // 固定時間，不讀系統時鐘
    private val contractPath = "backend/config/ma-contract.json"
    private val payload = """{"date":"2026-10-14","asOf":"2026-10-13","u":1,"d":1,"m":3,"status":"ok"}"""

    // 從目前目錄往上找契約檔（Gradle 的工作目錄是 core/）
    private fun contractText(): String {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val f = File(dir, contractPath)
            if (f.isFile) return f.readText(Charsets.UTF_8)
            dir = dir.parentFile
        }
        throw IllegalStateException("找不到 $contractPath")
    }

    // 取出契約裡某個鍵的數字，例如 "maxChars": 2048
    private fun contractInt(key: String): Int =
        Regex("\"$key\"\\s*:\\s*(\\d+)").find(contractText())?.groupValues?.get(1)?.toInt()
            ?: throw IllegalStateException("契約缺少 $key")

    // 取出契約裡某個鍵的字串，例如 "page": "/web/ma.html"
    private fun contractString(key: String): String =
        Regex("\"$key\"\\s*:\\s*\"([^\"]*)\"").find(contractText())?.groupValues?.get(1)
            ?: throw IllegalStateException("契約缺少 $key")

    @Test
    fun `M4-S15C 帶 ma 欄位的推播保留原文，過長或格式不對就丟掉，分流不受影響，網址由聊天網址算出`() {
        // 常數與契約一致
        assertEquals(contractInt("maxChars"), MA_PAYLOAD_MAX_CHARS)
        assertEquals(contractString("page"), MA_PAGE_PATH)

        // 合格的 ma 欄位保留原文（前後空白去掉），其他欄位照舊
        val r = parseReminder(mapOf("id" to "ma-20261014", "text" to "主人早安 多頭 1、空頭 1、其他 3。", "script" to "[smile]主人早安", "ma" to payload), now)
        assertNotNull(r)
        assertEquals(payload, r!!.ma)
        assertEquals("[smile]主人早安", r.script)
        val padded = parseReminder(mapOf("id" to "p", "text" to "提醒", "ma" to "  $payload  "), now)
        assertEquals(payload, padded!!.ma)

        // 太長、不是 {…}：丟掉 ma，只當一般提醒，不閃退
        val tooLong = "{\"date\":\"" + "很".repeat(2100) + "\"}"
        val long = parseReminder(mapOf("id" to "l", "text" to "提醒", "ma" to tooLong), now)
        assertNotNull(long)
        assertNull(long!!.ma)
        assertEquals("提醒", long.text)
        val notJson = parseReminder(mapOf("id" to "n", "text" to "提醒", "ma" to "ok,1,1,3"), now)
        assertNull(notJson!!.ma)

        // 舊格式推播沒有 ma
        val old = parseReminder(mapOf("id" to "old", "text" to "該喝水了"), now)
        assertNotNull(old)
        assertNull(old!!.ma)

        assertNull(pickMaPayload(null))
        assertNull(pickMaPayload(""))
        assertNull(pickMaPayload("p2,A01"))
        assertEquals(payload, pickMaPayload(payload))

        // 分流：角色模式開→出現；關→通知；玩遊戲→排隊（帶 ma 與否都一樣）
        assertEquals(Route.SHOW_PET, decideRoute(RouteInput(petMode = true, gaming = false, alreadySeen = false)))
        assertEquals(Route.NOTIFY, decideRoute(RouteInput(petMode = false, gaming = false, alreadySeen = false)))
        assertEquals(Route.QUEUE, decideRoute(RouteInput(petMode = true, gaming = true, alreadySeen = false)))
        assertEquals(Route.IGNORE, decideRoute(RouteInput(petMode = true, gaming = false, alreadySeen = true)))

        // 明細網頁網址：聊天網址的網域加上契約的頁面路徑；不是 https 或空的就是 null
        assertEquals("https://pet-maid-api.example.workers.dev/web/ma.html", maPageUrl("https://pet-maid-api.example.workers.dev/web/index.html"))
        assertEquals("https://pet-maid-api.example.workers.dev/web/ma.html", maPageUrl("  HTTPS://Pet-Maid-Api.Example.Workers.Dev/  "))
        assertNull(maPageUrl("http://pet-maid-api.example.workers.dev/web/index.html"))
        assertNull(maPageUrl(""))
        assertNull(maPageUrl(null))
    }
}
