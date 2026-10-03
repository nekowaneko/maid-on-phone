package com.accompany.pet.helper

import com.accompany.pet.core.BatterySample
import com.accompany.pet.core.parseCsvLine
import com.accompany.pet.core.toCsvLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.ZoneId

// 輔助測試：樣本檔一行可以解析回原本的樣本
class CsvParseTest {

    // 常數定義
    private val zone = ZoneId.of("Asia/Taipei")

    @Test
    fun `樣本寫成一行再解析回來相同`() {
        val s = BatterySample(1_700_000_000_000L, 42, true, false)
        assertEquals(s, parseCsvLine(toCsvLine(s, zone), zone))
    }

    @Test
    fun `格式錯誤的行回傳 null`() {
        assertNull(parseCsvLine("時間,電量百分比,螢幕,動畫", zone))
        assertNull(parseCsvLine("壞掉", zone))
    }
}
