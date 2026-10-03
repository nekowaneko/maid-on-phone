package com.accompany.pet.core

// 產生匯出檔名 battery-log-yyyyMMdd-HHmmss.csv
fun exportFileName(nowMillis: Long, zone: java.time.ZoneId): String = TODO()

// 把樣本匯出成新的 CSV 檔，絕不覆蓋舊檔
fun exportCsv(dir: java.io.File, samples: List<BatterySample>, nowMillis: Long, zone: java.time.ZoneId): java.io.File = TODO()
