// TopSnackbar: A custom view that displays notifications at the top of the screen.
// Copyright (c) 2023-2025 Katayama Hirofumi MZ. All Rights Reserved.

package com.katahiromz.simple_camera

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import timber.log.Timber
import kotlin.math.abs

/**
 * TopSnackbar displays a Snackbar-like notification at the top of the screen.
 *
 * Features:
 * - Displays at the top of the screen with slide-in animation
 * - Respects safe area (status bar, notch) using WindowInsets
 * - Auto-dismisses after specified duration with fade-out animation
 * - Supports optional action button with callback
 * - Replaces existing TopSnackbar when show() is called multiple times
 * - Accessibility support with contentDescription
 * - Swipe to dismiss (up, left, or right)
 */
@SuppressLint("StaticFieldLeak")
object TopSnackbar {
    // Constants
    private const val SLIDE_DISTANCE = -500f
    private const val SNACKBAR_BACKGROUND_COLOR = "#323232"
    private const val ACTION_BUTTON_COLOR = "#64B5F6"
    private const val ANIMATION_DURATION_SHOW = 300L
    private const val ANIMATION_DURATION_HIDE = 200L
    private const val SWIPE_THRESHOLD = 50f
    private const val SWIPE_VELOCITY_THRESHOLD = 50f

    @Volatile
    private var currentSnackbarView: View? = null
    @Volatile
    private var currentAnimator: AnimatorSet? = null
    @Volatile
    private var dismissRunnable: Runnable? = null

    private var currentActivity: Activity? = null

    /**
     * Custom FrameLayout that handles swipe gestures while allowing child views
     * (like buttons) to receive touch events properly.
     */
    private class SwipeableFrameLayout(context: Context) : FrameLayout(context) {
        private var gestureDetector: GestureDetector? = null
        private var onSwipeListener: ((SwipeDirection) -> Unit)? = null
        
        // スワイプ検出の初期位置
        private var initialX = 0f
        private var initialY = 0f
        private var isSwiping = false
        
        /**
         * Set the gesture detector for swipe detection.
         */
        fun setGestureDetector(detector: GestureDetector) {
            this.gestureDetector = detector
        }
        
        /**
         * Set the swipe callback listener.
         */
        fun setOnSwipeListener(listener: (SwipeDirection) -> Unit) {
            this.onSwipeListener = listener
        }
        
        /**
         * Intercept touch events to determine if we should handle swipe gestures
         * or let child views (buttons) handle clicks.
         */
        override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    // タッチ開始位置を記録
                    initialX = ev.x
                    initialY = ev.y
                    isSwiping = false
                    
                    // GestureDetectorに通知（onDownを呼ぶため）
                    gestureDetector?.onTouchEvent(ev)
                    
                    // まだインターセプトしない（子ビューにチャンスを与える）
                    return false
                }
                
                MotionEvent.ACTION_MOVE -> {
                    // 移動距離を計算
                    val deltaX = ev.x - initialX
                    val deltaY = ev.y - initialY
                    val distance = Math.sqrt((deltaX * deltaX + deltaY * deltaY).toDouble())
                    
                    // 一定距離以上移動したらスワイプと判定
                    if (distance > SWIPE_THRESHOLD && !isSwiping) {
                        isSwiping = true
                        Timber.d("SwipeableFrameLayout: Swipe detected, intercepting")
                        // この時点でタッチイベントをインターセプト
                        return true
                    }
                    
                    return isSwiping
                }
                
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    isSwiping = false
                    return false
                }
            }
            
            return false
        }
        
        /**
         * Handle touch events that we've intercepted (swipe gestures).
         */
        override fun onTouchEvent(event: MotionEvent): Boolean {
            // GestureDetectorに処理を委譲
            val handled = gestureDetector?.onTouchEvent(event) ?: false
            
            // スワイプ中またはGestureDetectorが処理した場合はtrue
            return isSwiping || handled
        }
    }

    /**
     * Show a TopSnackbar notification.
     *
     * @param activity The activity to display the snackbar in
     * @param message The message text to display
     * @param actionLabel Optional action button label
     * @param action Optional action button callback
     * @param durationMillis Duration to display the snackbar (default: 3000ms)
     */
    fun show(
        activity: Activity,
        message: String,
        actionLabel: String? = null,
        action: (() -> Unit)? = null,
        durationMillis: Int = 3000
    ) {
        Timber.d("TopSnackbar: show called")
        // メインスレッド以外から呼ばれた場合はメインスレッドにディスパッチする
        if (android.os.Looper.myLooper() != android.os.Looper.getMainLooper()) {
            activity.runOnUiThread { show(activity, message, actionLabel, action, durationMillis) }
            return
        }
        currentActivity = activity
        try {
            // Dismiss any existing snackbar first
            dismiss()

            // Get the root view
            val rootView = activity.findViewById<ViewGroup>(android.R.id.content)

            // Create the snackbar container
            val snackbarView = createSnackbarView(activity, message, actionLabel, action)

            // Set initial position (hidden above screen)
            snackbarView.translationY = SLIDE_DISTANCE
            snackbarView.alpha = 0f

            // Add to root view
            rootView.addView(snackbarView)

            // Apply window insets to respect safe area
            ViewCompat.setOnApplyWindowInsetsListener(snackbarView) { view, insets ->
                val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                val topInset = systemBars.top

                // Apply top margin to avoid status bar/notch
                val layoutParams = view.layoutParams as FrameLayout.LayoutParams
                layoutParams.topMargin = topInset
                view.layoutParams = layoutParams

                insets
            }

            // Request insets to be applied
            ViewCompat.requestApplyInsets(snackbarView)

            // Store reference
            currentSnackbarView = snackbarView

            // Animate slide-in from top
            val slideIn = ObjectAnimator.ofFloat(snackbarView, "translationY", SLIDE_DISTANCE, 0f)
            val fadeIn = ObjectAnimator.ofFloat(snackbarView, "alpha", 0f, 1f)

            val showAnimator = AnimatorSet().apply {
                playTogether(slideIn, fadeIn)
                duration = ANIMATION_DURATION_SHOW
            }

            currentAnimator = showAnimator
            showAnimator.start()

            // Schedule auto-dismiss
            dismissRunnable = Runnable {
                dismissWithAnimation()
            }
            dismissRunnable?.let { snackbarView.postDelayed(it, durationMillis.toLong()) }
        } catch (e: Exception) {
            Timber.e(e, "Failed to show TopSnackbar")
        }
    }

    /**
     * Dismiss the current TopSnackbar immediately without animation.
     */
    fun dismiss() {
        currentActivity!!?.runOnUiThread { // 安全のため UI スレッドで実行
            currentAnimator?.end() // cancel ではなく end で確実に終了状態へ
            currentAnimator = null

            currentSnackbarView?.let { view ->
                dismissRunnable?.let { view.removeCallbacks(it) }
                dismissRunnable = null

                val parent = view.parent as? ViewGroup
                parent?.removeView(view)
                Timber.d("TopSnackbar: Removed from parent")
            }
            currentSnackbarView = null
        }
    }

    /**
     * Dismiss the current TopSnackbar with fade-out animation.
     */
    private fun dismissWithAnimation() {
        val view = currentSnackbarView ?: return

        currentAnimator?.cancel()

        // Cancel any pending dismiss callback
        dismissRunnable?.let { view.removeCallbacks(it) }
        dismissRunnable = null

        val slideOut = ObjectAnimator.ofFloat(view, "translationY", 0f, SLIDE_DISTANCE)
        val fadeOut = ObjectAnimator.ofFloat(view, "alpha", 1f, 0f)

        val hideAnimator = AnimatorSet().apply {
            playTogether(slideOut, fadeOut)
            duration = ANIMATION_DURATION_HIDE
        }

        hideAnimator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                dismiss()
            }
        })

        currentAnimator = hideAnimator
        hideAnimator.start()
    }

    /**
     * Dismiss with swipe animation in the specified direction.
     */
    private fun dismissWithSwipe(view: View, direction: SwipeDirection) {
        currentAnimator?.cancel()

        // Cancel any pending dismiss callback
        dismissRunnable?.let { view.removeCallbacks(it) }
        dismissRunnable = null

        val (translationXEnd, translationYEnd) = when (direction) {
            SwipeDirection.UP -> 0f to SLIDE_DISTANCE
            SwipeDirection.LEFT -> -view.width.toFloat() to 0f
            SwipeDirection.RIGHT -> view.width.toFloat() to 0f
        }

        val slideOutX = ObjectAnimator.ofFloat(view, "translationX", view.translationX, translationXEnd)
        val slideOutY = ObjectAnimator.ofFloat(view, "translationY", view.translationY, translationYEnd)
        val fadeOut = ObjectAnimator.ofFloat(view, "alpha", view.alpha, 0f)

        val hideAnimator = AnimatorSet().apply {
            playTogether(slideOutX, slideOutY, fadeOut)
            duration = ANIMATION_DURATION_HIDE
        }

        hideAnimator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                dismiss()
            }
        })

        currentAnimator = hideAnimator
        hideAnimator.start()
    }

    /**
     * Swipe direction enum.
     */
    private enum class SwipeDirection {
        UP, LEFT, RIGHT
    }

    /**
     * Create the snackbar view layout programmatically.
     */
    private fun createSnackbarView(
        activity: Activity,
        message: String,
        actionLabel: String?,
        action: (() -> Unit)?
    ): View {
        // カスタムViewGroupを使用（通常のFrameLayoutの代わり）
        val swipeableContainer = SwipeableFrameLayout(activity).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.TOP
            }
        }
        
        // 内部コンテナ（メッセージとボタンを含む）
        val container = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor(SNACKBAR_BACKGROUND_COLOR))
            elevation = 8f
            setPadding(
                dpToPx(activity, 16),
                dpToPx(activity, 12),
                dpToPx(activity, 8),
                dpToPx(activity, 12)
            )
            
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // Message text
        val messageText = TextView(activity).apply {
            text = message
            setTextColor(Color.WHITE)
            textSize = 14f
            layoutParams = LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
            ).apply {
                gravity = Gravity.CENTER_VERTICAL
            }
            contentDescription = message
        }

        container.addView(messageText)

        // Optional action button
        if (actionLabel != null && action != null) {
            val actionButton = Button(activity).apply {
                text = actionLabel
                setTextColor(Color.parseColor(ACTION_BUTTON_COLOR))
                background = null
                textSize = 14f
                isAllCaps = true
                setPadding(
                    dpToPx(activity, 16),
                    dpToPx(activity, 8),
                    dpToPx(activity, 16),
                    dpToPx(activity, 8)
                )
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.CENTER_VERTICAL
                }
                contentDescription = actionLabel
                
                // クリックリスナー
                setOnClickListener {
                    Timber.d("TopSnackbar: Action button clicked")
                    try {
                        action.invoke()
                        dismissWithAnimation()
                    } catch (e: Exception) {
                        Timber.e(e, "Error executing TopSnackbar action")
                    }
                }
            }

            container.addView(actionButton)
        }
        
        // コンテナをSwipeableFrameLayoutに追加
        swipeableContainer.addView(container)
        
        // スワイプジェスチャーのセットアップ
        setupSwipeGestureForCustomView(swipeableContainer)

        return swipeableContainer
    }

    /**
     * Setup swipe gesture detection for the custom SwipeableFrameLayout.
     */
    private fun setupSwipeGestureForCustomView(view: SwipeableFrameLayout) {
        val gestureDetector = GestureDetector(view.context, object : GestureDetector.SimpleOnGestureListener() {
            override fun onFling(
                e1: MotionEvent?,
                e2: MotionEvent,
                velocityX: Float,
                velocityY: Float
            ): Boolean {
                val startEvent = e1 ?: return false

                val diffX = e2.x - startEvent.x
                val diffY = e2.y - startEvent.y

                Timber.d("TopSnackbar onFling diffX=%.1f diffY=%.1f vX=%.1f vY=%.1f", 
                    diffX, diffY, velocityX, velocityY)

                // Check if swipe distance exceeds threshold
                if (abs(diffX) > SWIPE_THRESHOLD || abs(diffY) > SWIPE_THRESHOLD) {
                    // Check if it's primarily a vertical swipe (UP)
                    if (abs(diffY) > abs(diffX)) {
                        if (diffY < 0 && abs(velocityY) > SWIPE_VELOCITY_THRESHOLD) {
                            // Swipe Up
                            dismissWithSwipe(view, SwipeDirection.UP)
                            return true
                        }
                    }
                    // Check if it's primarily a horizontal swipe (LEFT or RIGHT)
                    else {
                        if (abs(velocityX) > SWIPE_VELOCITY_THRESHOLD) {
                            if (diffX < 0) {
                                // Swipe Left
                                dismissWithSwipe(view, SwipeDirection.LEFT)
                                return true
                            } else {
                                // Swipe Right
                                dismissWithSwipe(view, SwipeDirection.RIGHT)
                                return true
                            }
                        }
                    }
                }
                return false
            }

            override fun onDown(e: MotionEvent): Boolean {
                return true
            }
        })
        
        // GestureDetectorをカスタムビューに設定
        view.setGestureDetector(gestureDetector)
        
        // スワイプリスナーを設定（オプション）
        view.setOnSwipeListener { direction ->
            dismissWithSwipe(view, direction)
        }
    }

    /**
     * Convert dp to pixels.
     */
    private fun dpToPx(activity: Activity, dp: Int): Int {
        val density = activity.resources.displayMetrics.density
        return (dp * density).toInt()
    }
}
