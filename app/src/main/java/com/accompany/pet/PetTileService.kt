package com.accompany.pet

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

// 常數定義
const val EXTRA_AUTO_START = "auto_start"  // 開啟主畫面時自動按「開始」

// 快速設定磚：點一下切換角色模式開／關（開：角色立刻出現，提醒由角色說；關：角色收起，提醒改成一般通知）
class PetTileService : TileService() {

    // 磁磚出現在通知欄時更新狀態
    override fun onStartListening() {
        super.onStartListening()
        updateTile()
    }

    // 點擊磁磚：角色模式開著就關閉並收起角色，關著就開啟並叫出角色
    override fun onClick() {
        super.onClick()
        val store = petModeStore(this)
        if (store.load()) {
            store.save(false)
            stopPetService(this)
        } else {
            store.save(true)
            if (!hasOverlayPermission(this) || !startPetService(this)) openMainActivity()  // 沒權限或被拒絕時改開主畫面
        }
        updateTile()
    }

    // 依角色模式更新磁磚外觀（亮＝開）
    private fun updateTile() {
        val tile = qsTile ?: return
        tile.state = if (petModeStore(this).load()) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = "🐾 陪伴角色"
        tile.updateTile()
    }

    // 收起通知欄並開啟主畫面（自動按「開始」）
    @SuppressLint("StartActivityAndCollapseDeprecated")
    private fun openMainActivity() {
        val intent = Intent(this, MainActivity::class.java)
            .putExtra(EXTRA_AUTO_START, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE))
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
