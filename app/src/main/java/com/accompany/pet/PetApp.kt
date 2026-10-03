package com.accompany.pet

import android.app.Application
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging

// Application：有設定 firebase.properties 時，手動初始化 Firebase（不使用 google-services 外掛）
class PetApp : Application() {

    override fun onCreate() {
        super.onCreate()
        initFirebase()
    }

    // 四個設定值都有才初始化；沒有就略過，不閃退（A16）
    private fun initFirebase() {
        val values = listOf(
            BuildConfig.FIREBASE_PROJECT_ID, BuildConfig.FIREBASE_APPLICATION_ID,
            BuildConfig.FIREBASE_API_KEY, BuildConfig.FIREBASE_SENDER_ID,
        )
        if (values.any { it.isEmpty() }) {
            Log.i(LOG_TAG, "未設定 Firebase，推播停用")
            return
        }
        try {
            val options = FirebaseOptions.Builder()
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setApplicationId(BuildConfig.FIREBASE_APPLICATION_ID)
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                .build()
            FirebaseApp.initializeApp(this, options)
            fetchPushCode()
        } catch (e: Exception) {
            Log.w(LOG_TAG, "Firebase 初始化失敗：${e.javaClass.simpleName}")  // 只記例外類型
        }
    }

    // 取得目前的推播代碼並存起來，主畫面才看得到
    private fun fetchPushCode() {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { value ->
            PushTokenStore(this).save(value)
        }
    }
}
