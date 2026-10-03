package com.accompany.pet

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

// 接收 Firebase 推播：只把資料交給 ReminderDispatcher（A13）
class PetMessagingService : FirebaseMessagingService() {

    // 收到推播訊息
    override fun onMessageReceived(message: RemoteMessage) {
        ReminderDispatcher.handle(this, message.data)
    }

    // 推播代碼更新時存起來（不 log 代碼本身，A17）
    override fun onNewToken(token: String) {
        PushTokenStore(this).save(token)
    }
}
