package com.accompany.pet.helper

import com.accompany.pet.core.drink.SETTINGS_ERROR_PREFIX
import com.accompany.pet.core.drink.SettingsField
import com.accompany.pet.core.drink.settingsFieldOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// M4.4 輔助測試：settingsFieldOf 的邊界
class M44HelperTest {

    @Test
    fun `空字串與只有開頭沒有名稱都回 null`() {
        assertNull(settingsFieldOf(""))
        assertNull(settingsFieldOf(SETTINGS_ERROR_PREFIX))
        assertNull(settingsFieldOf("設定值不正確：   "))
    }

    @Test
    fun `名稱前後的空白會被忽略`() {
        assertEquals(SettingsField.FEE, settingsFieldOf("設定值不正確： 月費 "))
    }

    @Test
    fun `全形與半形冒號不同，半形冒號回 null`() {
        assertNull(settingsFieldOf("設定值不正確:月費"))
    }

    @Test
    fun `label 之後有多餘文字回 null，不做包含比對`() {
        assertNull(settingsFieldOf("設定值不正確：月費過高"))
        assertNull(settingsFieldOf("設定值不正確：月費、每月額度"))
    }

    @Test
    fun `開頭前面有多餘文字回 null`() {
        assertNull(settingsFieldOf("錯誤。設定值不正確：月費"))
        assertNull(settingsFieldOf(" 設定值不正確：月費"))
    }

    @Test
    fun `名稱只是 label 的一部分或不同字元回 null`() {
        assertNull(settingsFieldOf("設定值不正確：入帳金額"))
        assertNull(settingsFieldOf("設定值不正確：訂閱"))
        assertNull(settingsFieldOf("設定值不正確：ＭＯＮＴＨ"))
    }

    @Test
    fun `五個 label 與欄位一一對應`() {
        for (field in SettingsField.values()) {
            assertEquals(field, settingsFieldOf("設定值不正確：" + field.label))
        }
        assertEquals(5, SettingsField.values().size)
    }
}
