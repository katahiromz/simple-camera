// GenericAppのメインアクティビティ。
// Copyright (c) 2023-2025 Katayama Hirofumi MZ. All Rights Reserved.

package com.katahiromz.simple_camera

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.StrictMode
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.view.View
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import java.util.Locale
import timber.log.Timber

// 複数の翻訳版を有効にするために、任意の翻訳版のコンテキストを作成できるようにする。
// https://qiita.com/tarumzu/items/b076c4635b38366cddee
fun Context.createLocalizedContext(locale: Locale): Context {
    val res = resources
    val config = Configuration(res.configuration)
    config.setLocale(locale)
    return createConfigurationContext(config)
}

/////////////////////////////////////////////////////////////////////
// region 定数

// トーストの種類 (showToast用)
const val SHORT_TOAST = 0
const val LONG_TOAST = 1

// スナックの種類 (showSnackbar用)
const val SHORT_SNACK = 0
const val LONG_SNACK = 1
const val ACTION_SNACK_OK = 2
// TODO: Add more snack

// 権限を使うか？
const val USE_AUDIO = true
const val USE_CAMERA = true
const val USE_TEXTTOSPEECH = false
const val USE_STORAGE = true
// endregion

class MainActivity : AppCompatActivity(), ValueCallback<String>, TextToSpeech.OnInitListener {
    /////////////////////////////////////////////////////////////////////
    // region 共通

    // デバッグログにTimberを使用する。
    private fun initTimber() {
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
    }

    // Toast を表示する。
    fun showToast(text: String, typeOfToast: Int) {
        if (text == "") {
            cancelToast()
            return
        }
        when (typeOfToast) {
            SHORT_TOAST -> {
                lastToast = Toast.makeText(this, text, Toast.LENGTH_SHORT)
                lastToast?.show()
            }
            LONG_TOAST -> {
                lastToast = Toast.makeText(this, text, Toast.LENGTH_LONG)
                lastToast?.show()
            }
            else -> {
                Timber.w("showToast: Unknown typeOfToast: $typeOfToast. Displaying short toast as default.")
            }
        }
    }
    private var lastToast : Toast? = null
    // Toastをキャンセルする。
    fun cancelToast() {
        if (lastToast != null) {
            lastToast?.cancel()
            lastToast = null
        }
    }

    // Snackbar を表示する。
    fun showSnackbar(text: String, typeOfSnack: Int) {
        if (text == "") {
            cancelSnackbar()
            return
        }
        val view = findViewById<View>(android.R.id.content)
        when (typeOfSnack) {
            SHORT_SNACK -> {
                lastSnackbar = Snackbar.make(view, text, Snackbar.LENGTH_SHORT)
                lastSnackbar?.show()
            }
            LONG_SNACK -> {
                lastSnackbar = Snackbar.make(view, text, Snackbar.LENGTH_LONG)
                lastSnackbar?.show()
            }
            ACTION_SNACK_OK -> {
                lastSnackbar = Snackbar.make(view, text, Snackbar.LENGTH_INDEFINITE)
                val buttonText = getLocString(R.string.ok)
                lastSnackbar?.setAction(buttonText) {
                    // TODO: Add action
                }
                lastSnackbar?.show()
            }
            // TODO: Add more Snack
            else -> {
                Timber.w("showSnackbar: Unknown typeOfSnack: $typeOfSnack. Snackbar not shown.")
            }
        }
    }
    private var lastSnackbar : Snackbar? = null
    // Snackbarをキャンセルする。
    fun cancelSnackbar() {
        if (lastSnackbar != null) {
            lastSnackbar?.dismiss()
            lastSnackbar = null
        }
    }

    // 画面の明るさを調整する。
    private var screenBrightness: String = "normal"
    fun setBrightness(value: String) {
        runOnUiThread {
            val params: WindowManager.LayoutParams = window.attributes
            if (value == "brighter") {
                params.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL
            } else {
                params.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            }
            window.attributes = params
        }

        screenBrightness = value
    }

    // アプリを終了する。
    fun finishApp() {
        finish() // 完全には終了しない（タスクリストに残る）。
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        Timber.i("onWindowFocusChanged")
        super.onWindowFocusChanged(hasFocus)
    }

    // endregion

    /////////////////////////////////////////////////////////////////////
    // region パーミッション関連

    // 許可されたときに実行する処理を保持する変数 (null許容)
    private var actionOnPermissionsGranted: (() -> Unit)? = null
    // 拒否されたときに実行する処理を保持する変数 (null許容)
    private var actionOnPermissionsDenied: (() -> Unit)? = null

    // 複数のパーミッションをリクエストするActivity Result Launcher。
    private val requestMultiplePermissionsLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
            // 戻り値: Map<String, Boolean> (パーミッション名, 許可されたか)

            // 全て許可されたかを確認する例
            val allGranted = permissions.entries.all { it.value }

            if (allGranted) {
                // 保持しておいたラムダを実行
                actionOnPermissionsGranted?.invoke()
            } else {
                // 一部または全てのパーミッションが拒否された場合の処理
                actionOnPermissionsDenied?.invoke()
            }
        }

    /**
     * 汎用的なパーミッションチェック・リクエスト関数。
     * @param needs_something_id 機能を要求するメッセージの文字列ID。
     * @param requiredPermissions チェックするパーミッションの配列。
     * @param onGranted パーミッションが全て許可されたときに実行する処理 (ラムダ式)。
     * @param onDenied パーミッションが拒否されたときに実行する処理 (ラムダ式)。
     */
    fun checkAndRequestPermissions(
        needs_something_id: Int,
        requiredPermissions: Array<String>,
        onGranted: () -> Unit,
        onDenied: () -> Unit,
    ) {
        // 許可されたときに実行するラムダを保持
        actionOnPermissionsGranted = onGranted
        actionOnPermissionsDenied = onDenied

        val permissionsNeeded = requiredPermissions.filter {
            // 'this' は Activity または Fragment
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()

        if (permissionsNeeded.isEmpty()) {
            // すでに全て許可されている場合は、即座に実行
            onGranted()
            return
        }

        // Rationaleを表示する必要があるか確認
        val shouldShowRationale = permissionsNeeded.any {
            ActivityCompat.shouldShowRequestPermissionRationale(this, it)
        }

        if (shouldShowRationale) {
            // Rationaleが必要な場合は、説明ダイアログを表示
            showPermissionRationaleDialog(
                needs_something_id,
                permissionsNeeded,
                requestMultiplePermissionsLauncher)
        } else {
            // Rationaleが不要な場合は、即座にリクエストを実行
            // 許可されていないものだけをリクエスト
            requestMultiplePermissionsLauncher.launch(permissionsNeeded)
        }
    }

    /**
     * パーミッションが必要な理由を説明するダイアログを表示する
     * @param needs_something_id 機能を要求するメッセージの文字列ID。
     * @param permissionsToRequest 再度リクエストするパーミッションの配列
     * @param launcher 複数のパーミッションをリクエストするActivity Result Launcher。
     */
    fun showPermissionRationaleDialog(
        needs_something_id: Int,
        permissionsToRequest: Array<String>,
        launcher: ActivityResultLauncher<Array<String>>
    ) {
        val title = getLocString(R.string.app_name)
        val message = getLocString(needs_something_id)
        MaterialAlertDialogBuilder(this, R.style.AlertDialogTheme)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton(getLocString(R.string.ok)) { dialog, which ->
                launcher.launch(permissionsToRequest)
            }.setCancelable(false)
            .show()
    }

    // TODO: パーミッションが必要な機能に関して、checkAndRequestPermissionsを呼び出す関数をここで追加・削除する。
    //       必要なければ削除してもよい。

    // カメラが必要な処理を行う。カメラのパーミッションがなければ事前に要求する。
    fun triggerCameraFeature(onGranted: (() -> Unit)?, onDenied: (() -> Unit)?) {
        checkAndRequestPermissions(
            R.string.needs_camera,
            arrayOf(Manifest.permission.CAMERA),
            onGranted ?: {},
            onDenied ?: {}
        )
    }

    // マイクが必要な処理を行う。マイクのパーミッションがなければ事前に要求する。
    fun triggerAudioFeature(onGranted: (() -> Unit)?, onDenied: (() -> Unit)?) {
        checkAndRequestPermissions(
            R.string.needs_microphone,
            arrayOf(Manifest.permission.RECORD_AUDIO),
            onGranted ?: {},
            onDenied ?: {}
        )
    }

    // ストレージが必要な処理を行う。ストレージのパーミッションがなければ事前に要求する。
    fun triggerStorageFeature(onGranted: (() -> Unit)?, onDenied: (() -> Unit)?) {
        checkAndRequestPermissions(
            R.string.needs_storage,
            arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE),
            onGranted ?: {},
            onDenied ?: {}
        )
    }

    /**
     * WebView の PermissionRequest を処理する。
     * Android のランタイム権限を確保してから WebView の権限を grant/deny する。
     * @param request WebView の PermissionRequest
     */
    fun handlePermissionRequest(request: PermissionRequest) {
        val androidPermissions = mutableSetOf<String>()
        var needsCamera = false
        var needsAudio = false

        for (resource in request.resources) {
            when (resource) {
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> {
                    androidPermissions.add(Manifest.permission.CAMERA)
                    needsCamera = true
                }
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> {
                    androidPermissions.add(Manifest.permission.RECORD_AUDIO)
                    needsAudio = true
                }
            }
        }

        // 必要なパーミッションがない場合は何もしない
        if (androidPermissions.isEmpty()) {
            request.deny()
            return
        }

        // メッセージ ID を決定（カメラとマイク両方が必要な場合は camera を優先）
        val messageId = when {
            needsCamera && needsAudio -> R.string.needs_camera
            needsCamera -> R.string.needs_camera
            needsAudio -> R.string.needs_microphone
            else -> R.string.needs_camera
        }

        // checkAndRequestPermissions を使って必要なランタイム権限をリクエスト
        checkAndRequestPermissions(
            messageId,
            androidPermissions.toTypedArray(),
            onGranted = {
                // 権限が許可された場合、WebView の PermissionRequest を grant
                runOnUiThread {
                    request.grant(request.resources)
                }
            },
            onDenied = {
                // 一部の権限が拒否された場合でも、許可された権限のリソースは付与する
                runOnUiThread {
                    val grantedResources = mutableListOf<String>()

                    for (resource in request.resources) {
                        val permission = when (resource) {
                            PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
                            PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
                            else -> null
                        }

                        if (permission != null) {
                            val isGranted = ContextCompat.checkSelfPermission(
                                this@MainActivity,
                                permission
                            ) == PackageManager.PERMISSION_GRANTED
                            
                            if (isGranted) {
                                grantedResources.add(resource)
                            }
                        }
                    }

                    // 付与された権限があれば、その分だけ WebView アクセスを許可
                    if (grantedResources.isNotEmpty()) {
                        request.grant(grantedResources.toTypedArray())
                    } else {
                        request.deny()
                    }
                }
            }
        )
    }

    // endregion

    /////////////////////////////////////////////////////////////////////
    // region イベントハンドラ関連

    // アクティビティの作成時。
    override fun onCreate(savedInstanceState: Bundle?) {
        Timber.i("onCreate")

        setStrictMode()

        // おまじない。
        window.attributes.layoutInDisplayCutoutMode =
            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS

        // 最初の画面を表示する。
        installSplashScreen()

        super.onCreate(savedInstanceState)

        // レイアウト ビューを指定する。
        setContentView(R.layout.activity_main)

        // アクションバーを隠す。
        // Theme.MaterialComponents.DayNight.NoActionBarで指定できるので省略。
        //supportActionBar?.hide()

        // パーミッション関連。

        // 必要なパーミッションを一度にリクエストする。
        val startupPerms = mutableListOf<String>()
        if (USE_CAMERA) startupPerms.add(Manifest.permission.CAMERA)
        if (USE_AUDIO) startupPerms.add(Manifest.permission.RECORD_AUDIO)
        if (USE_STORAGE) startupPerms.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        if (startupPerms.isNotEmpty()) {
            checkAndRequestPermissions(
                R.string.needs_permissions,
                startupPerms.toTypedArray(),
                onGranted = {},
                onDenied = {}
            )
        }

        // 音声合成を使うか？
        if (USE_TEXTTOSPEECH) {
            // TextToSpeechを初期化。
            initTextToSpeech()
        }

        // WebViewを初期化。
        initWebView(savedInstanceState)

        // ロケールをセットする。
        setCurLocale(Locale.getDefault())

        // Timberを初期化。
        initTimber()

        // システムバーが変更された場合を検出する。
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
            Timber.i("ViewCompat.setOnApplyWindowInsetsListener")
            val sysBarsVisible = insets.isVisible(WindowInsetsCompat.Type.systemBars())
            WindowInsetsCompat.toWindowInsetsCompat(view.onApplyWindowInsets(insets.toWindowInsets()))
        }

        // 「戻る」ボタンのコールバックを登録。
        onBackPressedDispatcher.addCallback(this, onBackPressedCallback)
    }

    // 「戻る」ボタンをサポートするコールバック関数。
    private val onBackPressedCallback: OnBackPressedCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            Timber.i("handleOnBackPressed")
            if (false) {
                // 'go_back' メッセージを投函する。おそらく'message'イベントリスナが受け取るはず。
                webView?.evaluateJavascript("postMessage('go_back');") { }
            }
            // 軽く閉じる（完全には閉じたいなら代わりにfinishAndRemoveTaskを使う）
            finish();
        }
    }

    // アクティビティの開始時。
    override fun onStart() {
        Timber.i("onStart")
        super.onStart() // 親にも伝える。
    }

    private var speechVoiceVolume: Float = 1.0f

    // アクティビティの復帰時。
    override fun onResume() {
        Timber.i("onResume")
        super.onResume() // 親にも伝える。

        // ウェブビューを復帰。
        webView?.onResume()

        // 明るさを復帰。
        setBrightness(screenBrightness)

        // 振動を再開。
        if (hasVibratorInitialized && oldVibratorLength > 0)
            startVibrator(-1)
    }

    // アクティビティの一時停止時。
    override fun onPause() {
        Timber.i("onPause")
        super.onPause() // 親にも伝える。

        // ウェブビューも一時停止。
        webView?.onPause()

        if (USE_TEXTTOSPEECH) {
            // スピーチを停止する。
            stopSpeech()
        }

        // 振動を停止。
        if (hasVibratorInitialized)
            stopVibrator()
    }

    // アクティビティの停止時。
    override fun onStop() {
        Timber.i("onStop")
        super.onStop() // 親にも伝える。

        // スピーチを停止する。
        stopSpeech()

        // 振動を停止。
        if (hasVibratorInitialized && oldVibratorLength > 0)
            stopVibrator()
    }

    // アクティビティの破棄時。
    override fun onDestroy() {
        Timber.i("onDestroy")

        // ウェブビューを破棄。
        webView?.destroy()

        if (USE_TEXTTOSPEECH) {
            // TextToSpeechを破棄。
            tts?.shutdown()
        }

        super.onDestroy() // 親にも伝える。
    }

    // 値を受け取るのに使う。ValueCallback<String>より継承。
    override fun onReceiveValue(value: String) {
        resultString = value
    }
    private var resultString = ""

    // endregion

    /////////////////////////////////////////////////////////////////////
    // region WebView関連

    // ウェブビュー オブジェクト。
    private var webView: WebView? = null

    // クロームクライアント。
    private var chromeClient: MyWebChromeClient? = null

    // ウェブビューを初期化する。
    private fun initWebView(savedInstanceState: Bundle?) {
        // 以前の状態を復元する。
        // SEE ALSO: https://twigstechtips.blogspot.com/2013/08/android-retain-instance-of-webview.html
        if (webView != null && savedInstanceState != null) {
            webView?.restoreState(savedInstanceState)
            return
        }

        // ウェブビューのビューを取得する。
        webView = findViewById(R.id.web_view)

        // webViewがnullの場合、以降の処理は行わない
        webView?.let { webViewInstance ->
            initWebSettings(webViewInstance) // webViewインスタンスを渡す
            initWebViewClient()
            initChromeClient(webViewInstance) // webViewインスタンスを渡す
        } ?: Timber.e("WebView (R.id.web_view) not found in layout.")
    }

    // ウェブビュー クライアントを初期化する。
    private fun initWebViewClient() {
        // WebViewAssetLoaderを設定する。
        // ルートパス"/"をassetsフォルダにマップすることで、
        // /simple_camera/... のパスが assets/simple_camera/... として解決される
        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView?.webViewClient = MyWebViewClient(object : MyWebViewClient.Listener {
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?,
                                         error: WebResourceError?) {
                val description = error?.description?.toString()
                val url = request?.url?.toString()
                Timber.e("onReceivedError: %s for URL: %s", description, url)
            }

            override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?,
                                             errorResponse: WebResourceResponse?) {
                val url = request?.url?.toString()
                Timber.e("onReceivedHttpError for URL: %s", url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                Timber.i("onPageFinished: %s", url)
                findViewById<TextView>(R.id.loading).visibility = View.GONE
            }
        }, assetLoader)
    }

    // クロームクライアントを初期化する。
    private fun initChromeClient(currentWebView: WebView) {
        // まず、クロームクライアントを作成する。
        chromeClient = MyWebChromeClient(this, object : MyWebChromeClient.Listener {
            override fun onSpeech(text: String, volume: Float): Boolean {
                Timber.i("onSpeech")
                theSpeechText = text // スピーチテキストをセットする。
                return speechText(text, volume) // スピーチを開始する。
            }

            override fun onShowToast(text: String, typeOfToast: Int) {
                showToast(text, typeOfToast) // Toastを表示する。
            }

            override fun onShowSnackbar(text: String, typeOfSnack: Int) {
                showSnackbar(text, typeOfSnack) // Snackbarを表示する。
            }

            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                val bar: ProgressBar = findViewById(R.id.progressBar)
                bar.progress = newProgress
                if (newProgress == 100)
                    bar.visibility = View.INVISIBLE // 進捗が完了したらプログレスを非表示にする。
            }

            override fun onBrightness(value: String) {
                setBrightness(value) // 明るさを指定する。
            }

            override fun onFinishApp() {
                finishApp() // アプリを終了する。
            }

            override fun onStartVibrator(length: Int) {
                startVibrator(length)
            }

            override fun onStopVibrator() {
                stopVibrator()
            }

            override fun onStartShutterSound() {
                startShutterSound()
            }

            override fun onEndShutterSound() {
                endShutterSound()
            }
        })
        currentWebView.webChromeClient = chromeClient

        // JavaScript側からメソッドを呼び出せるインターフェイスを提供する。
        chromeClient?.let { currentWebView.addJavascriptInterface(it, "android") }

        // URLを指定してウェブページを読み込む。
        val url = getLocString(R.string.url)
        Timber.i("Loading URL: %s", url)
        currentWebView.loadUrl(url)
    }

    // ウェブ設定を初期化する。
    @SuppressLint("SetJavaScriptEnabled")
    private fun initWebSettings(currentWebView: WebView) {
        // 背景色は黒。
        currentWebView.setBackgroundColor(0)

        // 設定を取得する。
        val settings = currentWebView.settings

        settings.javaScriptEnabled = true // JavaScriptを有効化。
        settings.domStorageEnabled = true // localStorageを有効化。
        settings.mediaPlaybackRequiresUserGesture = false // ジェスチャーなくてもメディア反応可。
        // WebViewAssetLoaderを使用する場合でも、内部的にassetsにアクセスする必要があるため
        // allowFileAccessは有効のままにする（ただしfile://スキームの直接使用はしない）
        settings.allowFileAccess = true
        settings.allowContentAccess = false // コンテンツアクセスは無効化。
        if (BuildConfig.DEBUG) {
            settings.cacheMode = WebSettings.LOAD_NO_CACHE // デバッグ中はキャッシュしない。
            WebView.setWebContentsDebuggingEnabled(true) // デバッギングを有効にする。
        }

        // JavaScript側からGenericAppのバージョン情報を取得できるようにする。
        val versionName = getVersionName()
        settings.userAgentString += "/SimpleCamera/Android/$versionName/"
    }

    // バージョン名を取得する。
    private fun getVersionName(): String {
        val appName: String = this.packageName
        val pm: PackageManager = this.packageManager
        val pi: PackageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getPackageInfo(appName, PackageManager.PackageInfoFlags.of(PackageManager.GET_META_DATA.toLong()))
        } else {
            pm.getPackageInfo(appName, PackageManager.GET_META_DATA)
        }
        return pi.versionName ?: "(unknown version)"
    }

    // endregion

    /////////////////////////////////////////////////////////////////////
    // region ロケール関連

    private var currLocale: Locale = Locale.ENGLISH
    var currLocaleContext: Context? = null

    // 現在のロケールをセットする。
    fun setCurLocale(locale: Locale) {
        currLocale = locale
        currLocaleContext = null

        // TextToSpeechにもロケールをセットする。
        if (isSpeechReady && tts != null) {
            tts?.let { textToSpeech ->
                if (textToSpeech.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) {
                    textToSpeech.language = locale
                } else {
                    Timber.w("Locale $locale not available for TTS.")
                }
            }
        } else {
            // TTSが準備できていない場合は、onInitで再度ロケール設定を試みるか、
            // 準備完了後に明示的に設定するロジックが必要になることがあります。
            // 現状では、準備完了時にデフォルトロケールが設定されます。
        }
    }

    // ローカライズされた文字列を取得する。複数ロケール対応のため、特殊な実装が必要。
    private fun getLocString(id: Int, locale: Locale): String {
        if (currLocaleContext == null) {
            currLocaleContext = applicationContext.createLocalizedContext(locale)
        }
        return currLocaleContext?.getString(id) ?: ""
    }
    fun getLocString(id: Int): String {
        return getLocString(id, currLocale)
    }

    // endregion

    /////////////////////////////////////////////////////////////////////
    // region TextToSpeech関連

    private var tts: TextToSpeech? = null // TextToSpeechオブジェクト。
    private var isSpeechReady = false // スピーチの準備が完了したか？
    private var theSpeechText = "" // スピーチテキスト。

    // TextToSpeechを初期化する。
    private fun initTextToSpeech() {
        // 既存のttsインスタンスがあればシャットダウンする。
        tts?.stop()
        tts?.shutdown()
        // 初期化。
        tts = TextToSpeech(this, this)
    }

    // TextToSpeechのために用意された初期化完了ルーチン。
    // TextToSpeech.OnInitListener
    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            isSpeechReady = true
        }
    }

    // スピーチを開始する。
    fun speechText(text: String, volume: Float): Boolean {
        if (isSpeechReady && tts != null) {
            val params = Bundle()
            val speed = 0.3f // 0..1
            val pitch = 0.8f // 0..1
            if (volume >= 0)
                speechVoiceVolume = volume
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, speechVoiceVolume)
            tts?.setPitch(pitch)
            tts?.setSpeechRate(speed)
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, params, "utteranceId_speech")
            return true
        } else {
            Timber.w("tts is not ready")
            return false
        }
    }

    // スピーチを停止する。
    private fun stopSpeech() {
        if (isSpeechReady) {
            tts?.stop()
        }
    }

    // endregion

    /////////////////////////////////////////////////////////////////////
    // region 音量の設定

    // 音量を変更
    private var oldVolume: Int = -1
    fun startShutterSound() {
        Timber.i("onStartShutterSound")
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (oldVolume == -1)
            oldVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
        var musicVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        // 最大値の 3/4 の音量
        musicVolume *= 3;
        musicVolume /= 4;
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, musicVolume, 0)
    }

    // 音量を元に戻す。
    fun endShutterSound() {
        Timber.i("onEndShutterSound")
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (oldVolume != -1) {
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, oldVolume, 0)
            oldVolume = -1;
        }
    }

    // endregion

    /////////////////////////////////////////////////////////////////////
    // region 振動関連

    private var hasVibratorInitialized: Boolean = false // 初期化成功フラグ
    private var oldVibratorLength: Int = 0
    private var vibratorManager: VibratorManager? = null
    private var vibrator: Vibrator? = null

    @Suppress("DEPRECATION")
    fun startVibrator(length: Int) {
        Timber.i("startVibrator")

        if (!hasVibratorInitialized) { // まだ初期化試行していない場合
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(VIBRATOR_MANAGER_SERVICE) as? VibratorManager // 安全キャスト
                if (vm == null) {
                    Timber.i("startVibrator: VibratorManager service not available.")
                    return // 初期化失敗
                }
                vibratorManager = vm
                vibrator = vibratorManager?.defaultVibrator
            } else {
                val v = getSystemService(VIBRATOR_SERVICE) as? Vibrator // 安全キャスト
                if (v == null) {
                    Timber.i("startVibrator: Vibrator service not available.")
                    return // 初期化失敗
                }
                vibrator = v
            }

            if (vibrator?.hasVibrator() != true) { // hasVibrator() も null 安全に呼び出す
                Timber.i("Device does not have a vibrator.")
                vibrator = null // 実際に振動機能がない場合は null に戻す
                return // 初期化失敗（振動機能なし）
            }
            hasVibratorInitialized = true // 初期化成功
            Timber.i("Vibrator initialized successfully.")
        }

        // vibrator が null であれば何もしない
        val currentVibrator = vibrator ?: return
        Timber.i("Has vibrator and initialized.")

        // いったん、振動を止める。
        currentVibrator.cancel()

        // -1だった場合は古い値を使う。
        var len = length
        if (len == -1)
            len = oldVibratorLength

        if (len <= 0) { // 長さが0以下なら何もしない
            oldVibratorLength = 0 // 停止扱いにする
            return
        }

        val timeout: Long = len.toLong()
        // createOneShot は API 26 以上
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && currentVibrator.hasAmplitudeControl()) {
                VibrationEffect.createOneShot(timeout, VibrationEffect.DEFAULT_AMPLITUDE) // API 29から DEFAULT_AMPLITUDE が public
            } else {
                VibrationEffect.createOneShot(timeout, VibrationEffect.DEFAULT_AMPLITUDE) // 古いAPIでは振幅制御不可の場合がある
            }
            currentVibrator.vibrate(effect)
        } else {
            // API 26 未満では vibrate(long) を使用
            currentVibrator.vibrate(timeout)
        }

        // 値を覚えておく。
        oldVibratorLength = len
    }

    fun stopVibrator() {
        Timber.i("stopVibrator")
        // vibrator が null であれば何もしない
        vibrator?.cancel()
        oldVibratorLength = 0
    }

    // endregion

    /////////////////////////////////////////////////////////////////////
    // region その他の設定

    private fun setStrictMode() {
        if (BuildConfig.DEBUG) {
            StrictMode.setThreadPolicy(
                StrictMode.ThreadPolicy.Builder()
                    .detectAll()
                    .build()
            )
            StrictMode.setVmPolicy(
                StrictMode.VmPolicy.Builder()
                    .detectAll()
                    .build()
            )
        }
    }

    // endregion
}
