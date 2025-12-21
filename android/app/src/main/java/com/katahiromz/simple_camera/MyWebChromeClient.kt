// GenericAppのクロームクライアント。
// Copyright (c) 2023-2025 Katayama Hirofumi MZ. All Rights Reserved.

package com.katahiromz.simple_camera

import android.content.Intent
import android.net.Uri
import android.text.InputType
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.EditText
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import timber.log.Timber
import java.util.Locale

class MyWebChromeClient(private var activity: MainActivity?, private val listener: Listener) :
    WebChromeClient() {

    // リスナ。
    interface Listener {
        fun onSpeech(text: String, volume: Float): Boolean
        fun onShowToast(text: String, typeOfToast: Int)
        fun onShowSnackbar(text: String, typeOfSnack: Int)
        fun onProgressChanged(view: WebView?, newProgress: Int)
        fun onBrightness(value: String)
        fun onFinishApp()
        fun onStartVibrator(length: Int)
        fun onStopVibrator()
        fun onStartShutterSound()
        fun onEndShutterSound()
    }

    // ローカライズされた文字列を取得する。
    // 複数の翻訳版に対応するため、特別に処理を用意した。
    private fun getLocString(resId: Int): String {
        return activity?.getLocString(resId) ?: ""
    }

    override fun onProgressChanged(view: WebView?, newProgress: Int) {
        listener.onProgressChanged(view, newProgress)
    }

    /////////////////////////////////////////////////////////////////////
    // パーミッション関連。
    override fun onPermissionRequest(request: PermissionRequest) {
        // MainActivity で Android のランタイム権限を確保してから grant/deny する
        activity?.handlePermissionRequest(request)
    }

    /////////////////////////////////////////////////////////////////////
    // JavaScript interface-related
    // これらの関数はJavaScriptからアクセスできる。

    // 画面の明るさを調整する。
    @JavascriptInterface
    fun setBrightness(brightness: String) {
        listener.onBrightness(brightness)
    }

    // アプリを終了する。
    @JavascriptInterface
    fun finishApp() {
        listener.onFinishApp()
    }

    // スピーチをキャンセルする。
    @JavascriptInterface
    fun cancelSpeech() {
        listener.onSpeech("", -1.0f)
    }

    // スピーチする。
    @JavascriptInterface
    fun startSpeech(msg: String, volume: Float): Boolean {
        return listener.onSpeech(msg, volume)
    }

    // GenericAppの設定をクリアする。
    @JavascriptInterface
    fun clearSettings() {
        activity?.let { MainRepository.clearMessageList(it) }
    }

    // 振動を開始する。
    @JavascriptInterface
    fun startVibrator(length: Float) {
        listener.onStartVibrator(length.toInt())
    }

    // 振動を停止する。
    @JavascriptInterface
    fun stopVibrator() {
        listener.onStopVibrator()
    }

    // Toastを表示する。
    @JavascriptInterface
    fun showToast(text: String) {
        listener.onShowToast(text, LONG_TOAST)
    }

    // Snackbarを表示する。
    @JavascriptInterface
    fun showSnackbar(text: String) {
        listener.onShowSnackbar(text, LONG_SNACK)
    }

    // シャッター音を開始する前に音量を調整する。
    @JavascriptInterface
    fun onStartShutterSound() {
        listener.onStartShutterSound()
    }

    // シャッター音を終了した後に音量を調整する。
    @JavascriptInterface
    fun onEndShutterSound() {
        listener.onEndShutterSound()
    }

    // ストレージ権限を要求するメソッド
    @JavascriptInterface
    fun requestStoragePermission() {
        activity?.triggerStorageFeature(
            onGranted = {
                Timber.i("Storage permission granted")
            },
            onDenied = {
                Timber.w("Storage permission denied")
            }
        )
    }

    // カメラの権限が付与されているか確認する。
    // 音声権限はオプションとして扱う。
    @JavascriptInterface
    fun hasMediaPermissions(): Boolean {
        val currentActivity = activity ?: return false
        val hasCameraPermission = android.content.pm.PackageManager.PERMISSION_GRANTED ==
            androidx.core.content.ContextCompat.checkSelfPermission(
                currentActivity,
                android.Manifest.permission.CAMERA
            )
        // カメラ権限のみを必須とする（音声権限はオプション）
        return hasCameraPermission
    }

    // TopSnackbarを表示してファイルを開くアクションを提供するヘルパーメソッド
    private fun showFileOpenSnackbar(currentActivity: MainActivity, uri: Uri, messageResId: Int, mimeType: String) {
        currentActivity.runOnUiThread {
            try {
                val message = currentActivity.getString(messageResId)
                val actionLabel = currentActivity.getString(R.string.open_file)
                TopSnackbar.show(
                    currentActivity,
                    message,
                    actionLabel,
                    {
                        try {
                            val openIntent = Intent(Intent.ACTION_VIEW).apply {
                                setDataAndType(uri, mimeType)
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            // アプリが利用可能かチェック
                            if (openIntent.resolveActivity(currentActivity.packageManager) != null) {
                                currentActivity.startActivity(openIntent)
                            } else {
                                Timber.w("No app available to open file of type: $mimeType")
                            }
                        } catch (e: Exception) {
                            Timber.e(e, "Failed to open file")
                        }
                    }
                )
            } catch (e: Exception) {
                Timber.e(e, "Failed to show TopSnackbar")
            }
        }
    }

    // 画像をギャラリーに保存する
    @JavascriptInterface
    fun saveImageToGallery(base64Data: String, filename: String, mimeType: String): Boolean {
        val currentActivity = activity ?: return false

        // Android 9以前では権限チェック
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(
                    currentActivity,
                    android.Manifest.permission.WRITE_EXTERNAL_STORAGE
                ) != android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                Timber.e("WRITE_EXTERNAL_STORAGE permission not granted")

                // UIスレッドで権限リクエストを実行
                currentActivity.runOnUiThread {
                    currentActivity.triggerStorageFeature(
                        onGranted = {
                            // 権限取得後、再度保存を試行
                            saveImageToGallery(base64Data, filename, mimeType)
                        },
                        onDenied = {
                            Timber.w("Storage permission denied by user")
                            currentActivity.showToast(
                                currentActivity.getString(R.string.needs_storage),
                                LONG_TOAST
                            )
                        }
                    )
                }
                return false
            }
        }

        return try {
            // �J���}���܂܂�Ă���ꍇ�A����ȍ~�̃f�[�^�݂̂𒊏o����C��
            val pureBase64 = if (base64Data.contains(",")) {
                base64Data.substring(base64Data.lastIndexOf(",") + 1)
            } else {
                base64Data
            }

            val imageBytes = try {
                android.util.Base64.decode(pureBase64, android.util.Base64.DEFAULT)
            } catch (e: IllegalArgumentException) {
                Timber.e(e, "Invalid base64 data")
                currentActivity.runOnUiThread {
                    currentActivity.showToast("Invalid image data", LONG_TOAST)
                }
                return false
            }

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                // Android 10以降: MediaStore APIを使用
                val contentValues = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, filename)
                    put(android.provider.MediaStore.Images.Media.MIME_TYPE, mimeType)
                    put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, 
                        android.os.Environment.DIRECTORY_PICTURES + "/SimpleCamera")
                }
                
                val uri = currentActivity.contentResolver.insert(
                    android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    contentValues
                )
                
                uri?.let {
                    currentActivity.contentResolver.openOutputStream(it)?.use { outputStream ->
                        outputStream.write(imageBytes)
                    }
                    
                    // Snackbarを表示
                    showFileOpenSnackbar(currentActivity, it, R.string.image_saved, "image/*")
                    
                    true
                } ?: false
            } else {
                // Android 9以前: 従来の方法
                val picturesDir = android.os.Environment.getExternalStoragePublicDirectory(
                    android.os.Environment.DIRECTORY_PICTURES
                )
                val appDir = java.io.File(picturesDir, "SimpleCamera")
                if (!appDir.exists()) {
                    appDir.mkdirs()
                }
                
                val file = java.io.File(appDir, filename)
                java.io.FileOutputStream(file).use { outputStream ->
                    outputStream.write(imageBytes)
                }
                
                // MediaScannerConnectionを使ってギャラリーに通知
                android.media.MediaScannerConnection.scanFile(
                    currentActivity,
                    arrayOf(file.absolutePath),
                    arrayOf(mimeType),
                    null
                )
                
                // Snackbarを表示
                val uri = android.net.Uri.fromFile(file)
                showFileOpenSnackbar(currentActivity, uri, R.string.image_saved, "image/*")
                
                true
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to save image")
            false
        }
    }

    // 動画をギャラリーに保存する
    @JavascriptInterface
    fun saveVideoToGallery(base64Data: String, filename: String, mimeType: String): Boolean {
        val currentActivity = activity ?: return false

        // Android 9以前では権限チェック
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(
                    currentActivity,
                    android.Manifest.permission.WRITE_EXTERNAL_STORAGE
                ) != android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                Timber.e("WRITE_EXTERNAL_STORAGE permission not granted")

                // UIスレッドで権限リクエストを実行
                currentActivity.runOnUiThread {
                    currentActivity.triggerStorageFeature(
                        onGranted = {
                            // 権限取得後、再度保存を試行
                            saveVideoToGallery(base64Data, filename, mimeType)
                        },
                        onDenied = {
                            Timber.w("Storage permission denied by user")
                            currentActivity.showToast(
                                currentActivity.getString(R.string.needs_storage),
                                LONG_TOAST
                            )
                        }
                    )
                }

                return false
            }
        }

        return try {
            // �J���}���܂܂�Ă���ꍇ�A����ȍ~�̃f�[�^�݂̂𒊏o����C��
            val pureBase64 = if (base64Data.contains(",")) {
                base64Data.substring(base64Data.lastIndexOf(",") + 1)
            } else {
                base64Data
            }

            val videoBytes = try {
                android.util.Base64.decode(pureBase64, android.util.Base64.DEFAULT)
            } catch (e: IllegalArgumentException) {
                Timber.e(e, "Invalid base64 data")
                currentActivity.runOnUiThread {
                    currentActivity.showToast("Invalid video data", LONG_TOAST)
                }
                return false
            }

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                // Android 10以降: MediaStore APIを使用
                val contentValues = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.Video.Media.DISPLAY_NAME, filename)
                    put(android.provider.MediaStore.Video.Media.MIME_TYPE, mimeType)
                    put(android.provider.MediaStore.Video.Media.RELATIVE_PATH, 
                        android.os.Environment.DIRECTORY_MOVIES + "/SimpleCamera")
                }
                
                val uri = currentActivity.contentResolver.insert(
                    android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                    contentValues
                )
                
                uri?.let {
                    currentActivity.contentResolver.openOutputStream(it)?.use { outputStream ->
                        outputStream.write(videoBytes)
                    }
                    
                    // Snackbarを表示
                    showFileOpenSnackbar(currentActivity, it, R.string.video_saved, "video/*")
                    
                    true
                } ?: false
            } else {
                // Android 9以前: 従来の方法
                val moviesDir = android.os.Environment.getExternalStoragePublicDirectory(
                    android.os.Environment.DIRECTORY_MOVIES
                )
                val appDir = java.io.File(moviesDir, "SimpleCamera")
                if (!appDir.exists()) {
                    appDir.mkdirs()
                }
                
                val file = java.io.File(appDir, filename)
                java.io.FileOutputStream(file).use { outputStream ->
                    outputStream.write(videoBytes)
                }
                
                // MediaScannerConnectionを使ってギャラリーに通知
                android.media.MediaScannerConnection.scanFile(
                    currentActivity,
                    arrayOf(file.absolutePath),
                    arrayOf(mimeType),
                    null
                )
                
                // Snackbarを表示
                val uri = android.net.Uri.fromFile(file)
                showFileOpenSnackbar(currentActivity, uri, R.string.video_saved, "video/*")
                
                true
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to save video")
            false
        }
    }

    // 現在の言語をセットする。
    @JavascriptInterface
    fun setLanguage(lang: String) {
        // {{LANGUAGE_SPECIFIC}}
        // TODO: Add the language(s) you need and remove the ones you don't need.
        val locale : Locale
        when (lang) {
            "ja", "jp", "ja-JP" -> { // Japanese
                locale = Locale.JAPANESE
            }
            "zh-CN" -> { // Chinese (Simplified)
                locale = Locale.SIMPLIFIED_CHINESE
            }
            "zh-TW" -> { // Chinese (Traditional)
                locale = Locale.TRADITIONAL_CHINESE
            }
            "ko-KR" -> { // Korean
                locale = Locale.KOREAN
            }
            "it", "it-IT" -> { // Italian
                locale = Locale.ITALIAN
            }
            "de", "de-DE" -> { // German
                locale = Locale.GERMAN
            }
            "es", "es-ES" -> { // Spanish
                locale = Locale.Builder()
                    .setLanguage("es")
                    .setRegion("ES")
                    .build()
            }
            "ru", "ru-RU" -> { // Russian
                locale = Locale.Builder()
                    .setLanguage("ru")
                    .setRegion("RU")
                    .build()
            }
            else -> { // English is default
                locale = Locale.ENGLISH
            }
        }
        Locale.setDefault(locale)
        activity?.setCurLocale(locale)
    }

    private var modalDialog: AlertDialog? = null

    // JavaScriptのalert関数をフックする。
    override fun onJsAlert(
        view: WebView?,
        url: String?,
        message: String?,
        result: JsResult?
    ): Boolean {
        // MaterialAlertDialogを使用して普通に実装する。
        val currentActivity = activity ?: run {
            result?.cancel()
            return false
        }
        val title = getLocString(R.string.app_name)
        val okText = getLocString(R.string.ok)
        modalDialog = MaterialAlertDialogBuilder(currentActivity, R.style.AlertDialogTheme)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton(okText) { _, _ ->
                result?.confirm()
                modalDialog = null
            }
            .setCancelable(false)
            .create()
        modalDialog?.show()
        return true
    }

    // JavaScriptのconfirm関数をフックする。
    override fun onJsConfirm(
        view: WebView?,
        url: String?,
        message: String?,
        result: JsResult?
    ): Boolean {
        // MaterialAlertDialogを使用して普通に実装する。
        val currentActivity = activity ?: run {
            result?.cancel()
            return false
        }
        val title = getLocString(R.string.app_name)
        val okText = getLocString(R.string.ok)
        val cancelText = getLocString(R.string.cancel)
        modalDialog = MaterialAlertDialogBuilder(currentActivity, R.style.AlertDialogTheme)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton(okText) { _, _ ->
                result?.confirm()
                modalDialog = null
            }
            .setNegativeButton(cancelText) { _, _ ->
                result?.cancel()
                modalDialog = null
            }
            .setCancelable(false)
            .create()
        modalDialog?.show()
        return true
    }

    // JavaScriptのprompt関数をフックする。
    override fun onJsPrompt(
        view: WebView?,
        url: String?,
        message: String?,
        defaultValue: String?,
        result: JsPromptResult?
    ): Boolean {
        val currentActivity = activity ?: run {
            result?.cancel()
            return false
        }
        currentActivity.currLocaleContext = null
        val title = getLocString(R.string.app_name)

        // MaterialAlertDialogを使用して普通に実装する。
        val okText = getLocString(R.string.ok)
        val cancelText = getLocString(R.string.cancel)
        val input = EditText(currentActivity)
        input.inputType = InputType.TYPE_CLASS_TEXT
        input.setText(if (defaultValue != null) defaultValue else "")
        modalDialog = MaterialAlertDialogBuilder(currentActivity, R.style.AlertDialogTheme)
            .setTitle(title)
            .setMessage(message)
            .setView(input)
            .setPositiveButton(okText) { _, _ ->
                result?.confirm(input.text.toString())
                modalDialog = null
            }
            .setNegativeButton(cancelText) { _, _ ->
                result?.cancel()
                modalDialog = null
            }
            .setCancelable(false)
            .create()
        modalDialog?.show()
        return true
    }

    override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
        if (BuildConfig.DEBUG) {
            if (consoleMessage != null) {
                val msg = consoleMessage.message()
                val line = consoleMessage.lineNumber()
                val src = consoleMessage.sourceId()
                Timber.d("console: $msg at Line $line of $src")
            }
        }
        return super.onConsoleMessage(consoleMessage)
    }
}
