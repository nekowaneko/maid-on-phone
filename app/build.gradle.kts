import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

// 讀入 firebase.properties（不進 git）；不存在時全部用空字串，建置照常
val firebaseProps = Properties().apply {
    val f = rootProject.file("firebase.properties")
    if (f.isFile) f.inputStream().use { load(it) }
}

// 取得 Firebase 設定值並轉成 BuildConfig 用的字串字面值
fun firebaseValue(key: String): String = "\"" + firebaseProps.getProperty(key, "").trim() + "\""

android {
    namespace = "com.accompany.pet"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.accompany.pet"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "FIREBASE_PROJECT_ID", firebaseValue("projectId"))
        buildConfigField("String", "FIREBASE_APPLICATION_ID", firebaseValue("applicationId"))
        buildConfigField("String", "FIREBASE_API_KEY", firebaseValue("apiKey"))
        buildConfigField("String", "FIREBASE_SENDER_ID", firebaseValue("senderId"))
    }

    buildTypes {
        release {
            optimization {
                enable = true
                packageScope = setOf("androidx.**", "kotlin.**", "kotlinx.**")
            }
        }
    }
    buildFeatures {
        buildConfig = true
    }
    lint {
        abortOnError = true  // error 等級中斷建置，warning 不中斷
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(project(":core"))
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.androidx.core.ktx)
    implementation(libs.material)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
}