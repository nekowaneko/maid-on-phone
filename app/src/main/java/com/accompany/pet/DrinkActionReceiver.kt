package com.accompany.pet

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.accompany.pet.core.drink.ACTION_RESIST
import com.accompany.pet.core.drink.ACTION_SPEAK
import com.accompany.pet.core.drink.UNREACHABLE_MESSAGE
import com.accompany.pet.core.drink.drinkEndpointFor
import com.accompany.pet.core.drink.workerErrorMessage
import org.json.JSONException
import org.json.JSONObject

// 常數定義
const val ACTION_DRINK_BUTTON = "com.accompany.pet.DRINK_BUTTON"  // 通知按鈕送來的廣播
const val EXTRA_DRINK_ACTION = "drinkAction"                       // 按了哪個按鈕（resist、speak）
const val EXTRA_NOTIFICATION_ID = "notificationId"                 // 原通知的編號（結果要取代它）
const val NEED_OVERLAY_MESSAGE = "角色出不來：請打開 App，開啟「顯示在其他應用程式上層」"  // 叫不出角色時的提示

// 通知按鈕「沒喝」「有喝，用說的」的接收端（Manifest 不對外開放）
class DrinkActionReceiver : BroadcastReceiver() {

    // 收到通知按鈕
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_DRINK_BUTTON) return
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0)
        when (intent.getStringExtra(EXTRA_DRINK_ACTION)) {
            ACTION_RESIST -> sendResist(context.applicationContext, notificationId)
            ACTION_SPEAK -> openAndListen(context.applicationContext, notificationId)
        }
    }

    // 「沒喝」：送 Worker 記錄，結果以通知顯示（取代原通知）
    private fun sendResist(context: Context, notificationId: Int) {
        val path = drinkEndpointFor(ACTION_RESIST) ?: return
        val pending = goAsync()  // 等 Worker 回應前不讓系統結束這次廣播
        WorkerApi.post(path, "{}") { result ->
            try {
                val message = workerErrorMessage(result.status)
                if (message != null) {
                    showDrinkResultNotification(context, notificationId, message, null)
                } else {
                    val (text, script) = responseTexts(result.text)
                    showDrinkResultNotification(context, notificationId, text, script)
                }
            } finally {
                pending.finish()
            }
        }
    }

    // 「有喝，用說的」：收掉原通知，叫出角色並開始語音辨識（沒有麥克風權限時角色照現有提示）
    private fun openAndListen(context: Context, notificationId: Int) {
        if (!hasOverlayPermission(context) || !startPetService(context, listen = true)) {
            showDrinkResultNotification(context, notificationId, NEED_OVERLAY_MESSAGE, null)  // 不嘗試繞過
            return
        }
        cancelReminderNotification(context, notificationId)
    }
}

// 從 Worker 回應取出通知要顯示的 text 與演出用 script；格式不對時回固定提示
fun responseTexts(json: String): Pair<String, String?> = try {
    val obj = JSONObject(json)
    val text = obj.optString("text").trim()                    // 通知欄用的純文字
    val script = (obj.opt("script") as? String)?.trim()        // 角色演出用的原文
    if (text.isEmpty()) UNREACHABLE_MESSAGE to null else text to script
} catch (e: JSONException) {
    UNREACHABLE_MESSAGE to null
}
