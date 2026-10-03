package com.accompany.pet

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import com.accompany.pet.core.BatterySample
import com.accompany.pet.core.nextSampleTime
import com.accompany.pet.core.parseCsvLine
import com.accompany.pet.core.toCsvLine
import java.io.File
import java.io.FileOutputStream
import java.time.ZoneId

// 常數定義
const val SAMPLES_FILE = "battery-samples.csv"         // 樣本檔名（只附加寫入）
val LOG_ZONE: ZoneId = ZoneId.of("Asia/Taipei")        // CSV 時區

// 樣本檔位置
fun samplesFile(context: Context): File = File(context.filesDir, SAMPLES_FILE)

// 讀出樣本檔中所有可解析的樣本
fun readSamples(context: Context): List<BatterySample> {
    val file = samplesFile(context)
    if (!file.isFile) return emptyList()
    return file.readLines().mapNotNull { parseCsvLine(it, LOG_ZONE) }
}

// 以附加方式寫入一行，絕不整檔覆寫
fun appendLine(file: File, line: String) {
    FileOutputStream(file, true).use { it.write((line + "\n").toByteArray(Charsets.UTF_8)) }  // true＝附加模式
}

// 耗電紀錄：服務運作期間每 15 分鐘取樣一次，螢幕關閉時照常取樣（S14 優先於 S10）
class BatteryLogger(
    private val context: Context,
    private val isAnimating: () -> Boolean,  // 目前動畫是否播放中
) {
    private val handler = Handler(Looper.getMainLooper())
    private var running = false
    private val tick = Runnable { sampleAndReschedule() }

    // 開始取樣（立刻記一筆）
    fun start() {
        if (running) return
        running = true
        sampleAndReschedule()
    }

    // 停止取樣
    fun stop() {
        running = false
        handler.removeCallbacks(tick)
    }

    // 記一筆，並依 nextSampleTime 排下一次
    private fun sampleAndReschedule() {
        if (!running) return
        val now = System.currentTimeMillis()
        appendLine(samplesFile(context), toCsvLine(takeSample(now), LOG_ZONE))
        val delay = nextSampleTime(now) - now  // 15 分鐘
        handler.postAtTime(tick, SystemClock.uptimeMillis() + delay)
    }

    // 讀取目前電量與螢幕狀態
    private fun takeSample(now: Long): BatterySample {
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))  // 黏性廣播，不會持續註冊
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val percent = if (level >= 0 && scale > 0) level * 100 / scale else -1
        val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return BatterySample(now, percent, power.isInteractive, isAnimating())
    }
}
