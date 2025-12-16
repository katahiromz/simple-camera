// TopSnackbar: A custom view that displays notifications at the top of the screen.
// Copyright (c) 2023-2025 Katayama Hirofumi MZ. All Rights Reserved.

package com.katahiromz.simple_camera

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.app.Activity
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import timber.log.Timber

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
 */
object TopSnackbar {
    private var currentSnackbarView: View? = null
    private var currentAnimator: AnimatorSet? = null
    
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
        activity.runOnUiThread {
            try {
                // Dismiss any existing snackbar first
                dismiss()
                
                // Get the root view
                val rootView = activity.findViewById<ViewGroup>(android.R.id.content)
                
                // Create the snackbar container
                val snackbarView = createSnackbarView(activity, message, actionLabel, action)
                
                // Set initial position (hidden above screen)
                snackbarView.translationY = -500f
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
                val slideIn = ObjectAnimator.ofFloat(snackbarView, "translationY", -500f, 0f)
                val fadeIn = ObjectAnimator.ofFloat(snackbarView, "alpha", 0f, 1f)
                
                val showAnimator = AnimatorSet().apply {
                    playTogether(slideIn, fadeIn)
                    duration = 300
                }
                
                currentAnimator = showAnimator
                showAnimator.start()
                
                // Schedule auto-dismiss
                snackbarView.postDelayed({
                    dismissWithAnimation()
                }, durationMillis.toLong())
                
            } catch (e: Exception) {
                Timber.e(e, "Failed to show TopSnackbar")
            }
        }
    }
    
    /**
     * Dismiss the current TopSnackbar immediately without animation.
     */
    fun dismiss() {
        currentAnimator?.cancel()
        currentAnimator = null
        
        currentSnackbarView?.let { view ->
            val parent = view.parent as? ViewGroup
            parent?.removeView(view)
        }
        currentSnackbarView = null
    }
    
    /**
     * Dismiss the current TopSnackbar with fade-out animation.
     */
    private fun dismissWithAnimation() {
        val view = currentSnackbarView ?: return
        
        currentAnimator?.cancel()
        
        val slideOut = ObjectAnimator.ofFloat(view, "translationY", 0f, -500f)
        val fadeOut = ObjectAnimator.ofFloat(view, "alpha", 1f, 0f)
        
        val hideAnimator = AnimatorSet().apply {
            playTogether(slideOut, fadeOut)
            duration = 200
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
     * Create the snackbar view layout programmatically.
     */
    private fun createSnackbarView(
        activity: Activity,
        message: String,
        actionLabel: String?,
        action: (() -> Unit)?
    ): View {
        // Container with dark background (similar to Snackbar)
        val container = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#323232"))
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
            ).apply {
                gravity = Gravity.TOP
            }
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
            contentDescription = message // Accessibility support
        }
        
        container.addView(messageText)
        
        // Optional action button
        if (actionLabel != null && action != null) {
            val actionButton = Button(activity).apply {
                text = actionLabel
                setTextColor(Color.parseColor("#64B5F6")) // Light blue
                background = null // Borderless button
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
                contentDescription = actionLabel // Accessibility support
                
                setOnClickListener {
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
        
        return container
    }
    
    /**
     * Convert dp to pixels.
     */
    private fun dpToPx(activity: Activity, dp: Int): Int {
        val density = activity.resources.displayMetrics.density
        return (dp * density).toInt()
    }
}
