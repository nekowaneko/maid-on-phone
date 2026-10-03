package com.accompany.pet.core

import java.io.File
import java.time.Instant
import java.time.format.DateTimeFormatter

// 常數定義
private const val EXPORT_PREFIX = "battery-log-"          // 匯出檔名開頭
private const val EXPORT_TIME_PATTERN = "yyyyMMdd-HHmmss" // 檔名中的時間格式
private const val MAX_SUFFIX = 10_000                     // 加後綴的上限，避免無窮迴圈

// 產生匯出檔名 battery-log-yyyyMMdd-HHmmss.csv
fun exportFileName(nowMillis: Long, zone: java.time.ZoneId): String {
    val stamp = DateTimeFormatter.ofPattern(EXPORT_TIME_PATTERN).withZone(zone).format(Instant.ofEpochMilli(nowMillis))
    return "$EXPORT_PREFIX$stamp.csv"
}

// 把樣本組成 CSV 全文（第一行是標題）
fun buildCsv(samples: List<BatterySample>, zone: java.time.ZoneId): String =
    (listOf(CSV_HEADER) + samples.map { toCsvLine(it, zone) }).joinToString("\n", postfix = "\n")

// 把樣本匯出成新的 CSV 檔，絕不覆蓋舊檔
fun exportCsv(dir: File, samples: List<BatterySample>, nowMillis: Long, zone: java.time.ZoneId): File {
    dir.mkdirs()
    val base = exportFileName(nowMillis, zone).removeSuffix(".csv")
    val content = buildCsv(samples, zone)
    for (i in 0..MAX_SUFFIX) {
        val name = if (i == 0) "$base.csv" else "$base-$i.csv"  // 已存在就加 -1、-2…
        val file = File(dir, name)
        if (file.createNewFile()) {  // 原子建立：已存在時回傳 false，不會覆蓋
            file.writeText(content)
            return file
        }
    }
    throw java.io.IOException("匯出檔名已用盡：$base")
}
