package com.accompany.pet.helper

import com.accompany.pet.core.BatterySample
import com.accompany.pet.core.EDGE_MARGIN_PX
import com.accompany.pet.core.FilePositionStore
import com.accompany.pet.core.INITIAL_STATE
import com.accompany.pet.core.InMemoryPositionStore
import com.accompany.pet.core.PetEvent
import com.accompany.pet.core.Point
import com.accompany.pet.core.RenderState
import com.accompany.pet.core.Size
import com.accompany.pet.core.exportCsv
import com.accompany.pet.core.exportFileName
import com.accompany.pet.core.initialPosition
import com.accompany.pet.core.permission.StartAction
import com.accompany.pet.core.permission.decideStart
import com.accompany.pet.core.reduce
import com.accompany.pet.core.snapToEdge
import com.accompany.pet.core.toCsvLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.ZoneId
import java.time.ZonedDateTime

// 輔助測試：補強規格測試沒涵蓋的邊界
class HelperTest {

    // 常數定義
    private val zone = ZoneId.of("Asia/Taipei")
    private val screen = Size(1080, 2400)
    private val pet = Size(288, 324)

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun `有懸浮窗權限時直接開始`() {
        assertEquals(StartAction.START_OVERLAY, decideStart(true))
    }

    @Test
    fun `右半邊放開吸附到右邊緣`() {
        assertEquals(screen.w - pet.w - EDGE_MARGIN_PX, snapToEdge(Point(900, 100), pet, screen).x)
    }

    @Test
    fun `沒有紀錄時預設右下`() {
        assertEquals(Point(screen.w - pet.w - EDGE_MARGIN_PX, 1560), initialPosition(null, pet, screen))
    }

    @Test
    fun `紀錄超出螢幕會被拉回`() {
        assertEquals(Point(screen.w - pet.w, screen.h - pet.h), initialPosition(Point(5000, 5000), pet, screen))
    }

    @Test
    fun `位置檔格式錯誤或不存在回傳 null`() {
        val f = File(tmp.root, "p.txt")
        f.writeText("abc")
        assertNull(FilePositionStore(f).load())
        assertNull(FilePositionStore(File(tmp.root, "none.txt")).load())
    }

    @Test
    fun `記憶體位置存取`() {
        val s = InMemoryPositionStore()
        assertNull(s.load())
        s.save(Point(1, 2))
        assertEquals(Point(1, 2), s.load())
    }

    @Test
    fun `CSV 一行與檔名格式`() {
        val t = ZonedDateTime.of(2026, 10, 3, 14, 5, 9, 0, zone).toInstant().toEpochMilli()
        assertEquals("2026-10-03 14:05:09,55,關,暫停", toCsvLine(BatterySample(t, 55, false, false), zone))
        assertEquals("battery-log-20261003-140509.csv", exportFileName(t, zone))
    }

    @Test
    fun `同秒匯出三次依序加後綴`() {
        val dir = tmp.newFolder()
        val names = (1..3).map { exportCsv(dir, emptyList(), 0L, zone).name }
        val expected = listOf(
            "battery-log-19700101-080000.csv",
            "battery-log-19700101-080000-1.csv",
            "battery-log-19700101-080000-2.csv",
        )
        assertEquals(expected, names)
    }

    @Test
    fun `停止時螢幕打開不播放`() {
        assertEquals(RenderState.PAUSED, reduce(INITIAL_STATE, PetEvent.SCREEN_ON).render)
    }
}
