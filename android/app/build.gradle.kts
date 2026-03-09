plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.delightful.shell"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.delightful.shell"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    sourceSets {
        getByName("main") {
            kotlin.srcDirs("src/main/kotlin")
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
}

// ── Build web assets before Android build ─────────────────────────────
// Runs `bun run build` in web/ and copies dist/ into assets/
// Vite outputs absolute paths (/assets/index.js), so the dist root
// must be the assets root for WebViewAssetLoader to resolve them.
tasks.register<Exec>("buildWebAssets") {
    workingDir = file("${rootProject.projectDir}/../web")
    commandLine("bun", "run", "build")
}

tasks.register<Copy>("copyWebAssets") {
    dependsOn("buildWebAssets")
    from("${rootProject.projectDir}/../web/dist")
    into("src/main/assets")
}

tasks.named("preBuild") {
    dependsOn("copyWebAssets")
}
