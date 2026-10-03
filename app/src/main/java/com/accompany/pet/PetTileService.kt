package com.accompany.pet

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

// 常數定義
const val EXTRA_AUTO_START = "auto_start"  // 開啟主畫面時自動按「開始」

// 快速設定磚：點一下開／關角色（docs/M0.5-RECOVERY-PLAN.md §2.3）
class PetTileService : TileService() {

    // 磁磚出現在通知欄時更新狀態
    override fun onStartListening() {
        super.onStartListening()
        updateTile()
    }

    // 點擊磁磚：開著就停止，關著就啟動
    override fun onClick() {
        super.onClick()
        if (OverlayService.running) {
            stopPetService(this)  // 服務收到停止指令會記錄不想開著
        } else {
            runIntentStore(this).save(true)
            if (!hasOverlayPermission(this) || !startPetService(this)) openMainActivity()  // 沒權限或被拒絕時改開主畫面
        }
        updateTile()
    }

    // 依服務狀態更新磁磚外觀
    private fun updateTile() {
        val tile = qsTile ?: return
        tile.state = if (OverlayService.running) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = "陪伴角色"
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
