package com.delightful.shell

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)

        // Serve from assets/ root via HTTPS
        // Vite outputs absolute paths (/assets/index.js), so dist/ contents
        // are copied directly into assets/ — no subdirectory nesting.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        // Expose the bridge to JavaScript
        webView.addJavascriptInterface(AndroidBridgeInterface(), "AndroidBridge")

        webView.loadUrl("https://appassets.androidplatform.net/index.html")

        // Enable remote debugging via chrome://inspect
        WebView.setWebContentsDebuggingEnabled(true)
    }

    /**
     * JavaScript interface exposed as window.AndroidBridge.
     * Single invoke() method — same pattern as the C++ bridge.
     */
    inner class AndroidBridgeInterface {
        @JavascriptInterface
        fun invoke(method: String, argsJson: String): String {
            val result = NativeBridge.invoke(method, argsJson)

            // Check if the call mutated data and push event to React
            if (NativeBridge.consumeDataChanged()) {
                webView.post {
                    webView.evaluateJavascript(
                        "window.__bridgeEvent && window.__bridgeEvent('dataChanged')",
                        null
                    )
                }
            }

            return result
        }
    }

    @Deprecated("Use OnBackPressedCallback instead")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
