// core 模組：純 Kotlin JVM 邏輯，不依賴 Android，可在電腦上用 JUnit 測試
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.pitest)
}

java {
    sourceCompatibility = JavaVersion.VERSION_11  // 與 app 一致
    targetCompatibility = JavaVersion.VERSION_11
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11)
    }
}

dependencies {
    testImplementation(libs.junit)
}

// 突變測試針對權限判斷與提醒分流（M1 計畫 §2.2）
pitest {
    targetClasses.set(listOf("com.accompany.pet.core.permission.*", "com.accompany.pet.core.reminder.*"))
    targetTests.set(listOf("com.accompany.pet.*"))  // 用全部測試（spec＋helper）去殺突變
    outputFormats.set(listOf("HTML", "XML"))
    timestampedReports.set(false)
}
