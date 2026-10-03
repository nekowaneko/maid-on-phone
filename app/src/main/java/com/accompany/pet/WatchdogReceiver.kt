package com.accompany.pet

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.accompany.pet.core.permission.RestoreAction
import com.accompany.pet.core.permission.decideRestore

// 定時巡邏：系統鬧鐘叫醒時，角色該在卻不在就重新啟動（docs/M0.5-RECOVERY-PLAN.md §2.4）
class WatchdogReceiver : BroadcastReceiver() {

    // 收到巡邏鬧鐘
    override fun onReceive(context: Context, intent: Intent) {
        val wanted = runIntentStore(context).load()
        val action = decideRestore(wanted, OverlayService.running, hasOverlayPermission(context))
        Log.i(LOG_TAG, "巡邏：wanted=$wanted running=${OverlayService.running} → $action")
        if (action == RestoreAction.RESTORE) startPetService(context)  // 被拒絕時等下一次巡邏
        if (wanted) scheduleWatchdog(context)  // 使用者想開著才繼續巡邏
    }
}
