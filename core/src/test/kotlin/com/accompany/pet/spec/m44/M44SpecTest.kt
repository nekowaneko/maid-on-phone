package com.accompany.pet.spec.m44

import com.accompany.pet.core.drink.SettingsField
import com.accompany.pet.core.drink.settingsFieldOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// M4.4 規格範例表（docs/M4.4-EXPENSIVE-PLAN.md §4.6）中 Kotlin 規格測試列（S01～S09），凍結後不得修改。
// 輸入一律用表格內的字面字串，不引用 SETTINGS_ERROR_PREFIX 去組字串。
class M44SpecTest {

    @Test
    fun `M44-S01 頁首顯示這一句；月費欄標紅；其他欄位不標紅`() {
        assertEquals(SettingsField.FEE, settingsFieldOf("設定值不正確：月費"))
    }

    @Test
    fun `M44-S02 頁首顯示該句；訂閱名稱欄標紅`() {
        assertEquals(SettingsField.NAME, settingsFieldOf("設定值不正確：訂閱名稱"))
    }

    @Test
    fun `M44-S03 頁首顯示該句；每月額度欄標紅`() {
        assertEquals(SettingsField.QUOTA, settingsFieldOf("設定值不正確：每月額度"))
    }

    @Test
    fun `M44-S04 頁首顯示該句；入帳金額欄標紅`() {
        assertEquals(SettingsField.RESIST, settingsFieldOf("設定值不正確：忍住一杯的入帳金額"))
    }

    @Test
    fun `M44-S05 頁首顯示該句；每天詢問時間欄標紅`() {
        assertEquals(SettingsField.ASK, settingsFieldOf("設定值不正確：每天詢問時間"))
    }

    @Test
    fun `M44-S06 頁首顯示該句；沒有任何欄位標紅`() {
        assertNull(settingsFieldOf("連不上伺服器，晚點再試一次"))
    }

    @Test
    fun `M44-S07 頁首顯示「設定值不正確」；沒有任何欄位標紅`() {
        assertNull(settingsFieldOf("設定值不正確"))
        assertNull(settingsFieldOf(null)) // 回 400 但沒有錯誤文字
    }

    @Test
    fun `M44-S08 頁首顯示該句；沒有文字欄位標紅；已存的五個欄位不回滾`() {
        assertNull(settingsFieldOf("設定值不正確：啟用戒飲記錄"))
    }

    @Test
    fun `M44-S09 所有紅框清除；頁首顯示「已儲存」`() {
        assertNull(settingsFieldOf("已儲存"))
    }
}
