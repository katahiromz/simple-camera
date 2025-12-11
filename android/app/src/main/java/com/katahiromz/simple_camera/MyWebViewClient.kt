// GenericAppのウェブビュー クライアント。
// Copyright (c) 2023-2025 Katayama Hirofumi MZ. All Rights Reserved.

package com.katahiromz.simple_camera

import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

class MyWebViewClient(
    private val listener: Listener,
    private val assetLoader: WebViewAssetLoader
) : WebViewClient() {
    companion object {
        private const val ASSET_LOADER_DOMAIN = "https://appassets.androidplatform.net/"
    }

    // リスナー。
    interface Listener {
        fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?)
        fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?,
                                errorResponse: WebResourceResponse?)
        fun onPageFinished(view: WebView?, url: String?)
    }

    // リソースリクエストをインターセプトしてWebViewAssetLoaderを使って処理する。
    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest
    ): WebResourceResponse? {
        val response = assetLoader.shouldInterceptRequest(request.url)
        if (response != null) {
            android.util.Log.d("MyWebViewClient", "Intercepted: ${request.url}")
        }
        return response
    }

    // 読み込み可能なURLを制限したり、フックする。
    override fun shouldOverrideUrlLoading(
        view: WebView?,
        request: WebResourceRequest?
    ): Boolean {
        // WebViewAssetLoaderを使用するため、appassets.androidplatform.netドメインのURLを許可する。
        if (view != null && request != null) {
            val url: String = request.url.toString()
            // WebViewAssetLoaderドメインのURLの場合は許可
            if (url.startsWith(ASSET_LOADER_DOMAIN)) {
                return false // WebViewが処理するように false を返す
            }
        }
        return true // その他のURLは外部ブラウザなどで処理
    }

    // ウェブビューからのエラーをリスナーに渡す。
    override fun onReceivedError(view: WebView?, request: WebResourceRequest?,
                                 error: WebResourceError?)
    {
        super.onReceivedError(view, request, error)
        listener.onReceivedError(view, request, error)
    }

    // ウェブビューからのエラーをリスナーに渡す。
    override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?,
                                     errorResponse: WebResourceResponse?)
    {
        super.onReceivedHttpError(view, request, errorResponse)
        listener.onReceivedHttpError(view, request, errorResponse)
    }

    // ウェブビューからのエラーをリスナーに渡す。
    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        listener.onPageFinished(view, url)
    }
}