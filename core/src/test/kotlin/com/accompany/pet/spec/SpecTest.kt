package com.accompany.pet.spec

import com.accompany.pet.core.BatterySample
import com.accompany.pet.core.CSV_HEADER
import com.accompany.pet.core.EDGE_MARGIN_PX
import com.accompany.pet.core.FilePositionStore
import com.accompany.pet.core.INITIAL_STATE
import com.accompany.pet.core.LOG_INTERVAL_MINUTES
import com.accompany.pet.core.PetEvent
import com.accompany.pet.core.PetState
import com.accompany.pet.core.Point
import com.accompany.pet.core.RenderState
import com.accompany.pet.core.ServiceState
import com.accompany.pet.core.Size
import com.accompany.pet.core.clampInScreen
import com.accompany.pet.core.exportCsv
import com.accompany.pet.core.initialPosition
import com.accompany.pet.core.nextSampleTime
import com.accompany.pet.core.permission.MIC_DENIED_MESSAGE
import com.accompany.pet.core.permission.StartAction
import com.accompany.pet.core.permission.decideStart
import com.accompany.pet.core.reduce
import com.accompany.pet.core.snapToEdge
import com.accompany.pet.core.toCsvLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.ZoneId

// 規格範例表（docs/EXPENSIVE-PLAN.md §4.5）轉寫的測試，凍結後不得修改
class SpecTest {

    // 常數定義
    private val zone = ZoneId.of("Asia/Taipei")  // 時區一律用台北
    private val screen = Size(1080, 2400)         // 測試用螢幕尺寸
    private val pet = Size(288, 324)              // 測試用角色尺寸

    @get:Rule
    val tmp = TemporaryFolder()  // 檔案相關測試的暫存資料夾

    @Test
    fun `S01 還沒授權懸浮窗時按開始會顯示權限說明而不是角色`() {
        assertEquals(StartAction.SHOW_PERMISSION_EXPLANATION, decideStart(false))
    }

    @Test
    fun `S02 麥克風權限被拒絕時泡泡顯示需要麥克風權限才能用說的`() {
        assertEquals("需要麥克風權限才能用說的", MIC_DENIED_MESSAGE)
    }

    @Test
    fun `S03 同一時間連續匯出兩次會產生兩個不同檔案且第一個檔案內容不變`() {
        val dir = tmp.newFolder("exports")
        val now = 1_700_000_000_000L
        val samples = listOf(BatterySample(now, 80, true, true))
        val first = exportCsv(dir, samples, now, zone)
        val firstContent = first.readText()
        val second = exportCsv(dir, listOf(BatterySample(now, 79, false, false)), now, zone)
        assertNotEquals(first.absolutePath, second.absolutePath)
        assertTrue(first.exists())
        assertTrue(second.exists())
        assertEquals(firstContent, first.readText())
        assertTrue(first.name.startsWith("battery-log-"))
        assertTrue(second.name.startsWith("battery-log-"))
        assertEquals(CSV_HEADER, first.readLines().first())
    }

    @Test
    fun `S07 把角色拖到左半邊放開會吸附到左邊緣`() {
        val drop = Point(100, 1000)  // 角色中心在左半邊
        val result = snapToEdge(drop, pet, screen)
        assertEquals(EDGE_MARGIN_PX, result.x)
    }

    @Test
    fun `S08 拖出螢幕上下邊界時角色停在螢幕邊界內`() {
        val above = clampInScreen(Point(300, -500), pet, screen)
        val below = clampInScreen(Point(300, 5000), pet, screen)
        assertEquals(0, above.y)
        assertEquals(screen.h - pet.h, below.y)
    }

    @Test
    fun `S09 停止後重新開始角色出現在上次放開的位置`() {
        val file = File(tmp.root, "pet-position.txt")
        val last = Point(EDGE_MARGIN_PX, 900)
        FilePositionStore(file).save(last)
        val loaded = FilePositionStore(file).load()  // 新實例模擬重新開始
        assertEquals(last, initialPosition(loaded, pet, screen))
    }

    @Test
    fun `S10 螢幕關閉時動畫暫停打開後恢復播放`() {
        val running = PetState(ServiceState.RUNNING, RenderState.PLAYING, true)
        val off = reduce(running, PetEvent.SCREEN_OFF)
        assertEquals(RenderState.PAUSED, off.render)
        val on = reduce(off, PetEvent.SCREEN_ON)
        assertEquals(RenderState.PLAYING, on.render)
    }

    @Test
    fun `S13 按通知欄的停止會結束服務並移除常駐通知`() {
        val running = reduce(INITIAL_STATE, PetEvent.START)
        val stopped = reduce(running, PetEvent.STOP)
        assertEquals(ServiceState.STOPPED, stopped.service)
        assertFalse(stopped.notificationShown)
    }

    @Test
    fun `S14 服務運作期間每15分鐘記錄一筆含時間電量螢幕動畫四個欄位`() {
        val last = 1_700_000_000_000L
        assertEquals(15L * 60 * 1000, nextSampleTime(last) - last)
        assertEquals(15, LOG_INTERVAL_MINUTES)
        val line = toCsvLine(BatterySample(last, 80, true, true), zone)
        assertEquals(4, line.split(",").size)
    }

    @Test
    fun `S15 App 只透過 Firebase 推播收資料不自行連其他外部服務`() {
        val candidates = listOf(File("../app/src/main"), File("app/src/main"))
        val mainDir = candidates.first { it.exists() }  // 依執行目錄找原始碼
        val forbidden = listOf("java.net.URL(", "HttpURLConnection", "okhttp", "retrofit", "ktor")
        val sources = mainDir.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()
        assertTrue(sources.isNotEmpty())
        for (f in sources) {
            val text = f.readText()
            for (word in forbidden) assertFalse("${f.name} 含 $word", text.contains(word))
        }
        assertFalse(File(mainDir, "AndroidManifest.xml").readText().contains("android.permission.INTERNET"))
    }
}
