// PermissionManager.kt --- Androidアプリ権限管理
// Author: katahiromz
// License: MIT
// Copyright (c) 2025 Katayama Hirofumi MZ. All Rights Reserved.

package com.katahiromz.simple_camera

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.webkit.PermissionRequest
import androidx.appcompat.app.AlertDialog
import timber.log.Timber

// 権限管理
class PermissionManager(private val activity: AppCompatActivity) {
    // コールバック関数を保持
    private var permissionCallback: ((Map<String, Boolean>) -> Unit)? = null

    // 権限リクエストランチャー
    private val permissionLauncher: ActivityResultLauncher<Array<String>> =
        activity.registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) { permissions ->
            permissionCallback?.invoke(permissions)
        }

    companion object {
        // 【権限の定義】ここから
          // --- ハードウェア権限 ---
          val CAMERA_PERMISSIONS = arrayOf(Manifest.permission.CAMERA) // カメラ
          val RECORD_AUDIO_PERMISSIONS = arrayOf(Manifest.permission.RECORD_AUDIO) // マイク
          val CAMERA_AND_AUDIO_PERMISSIONS = CAMERA_PERMISSIONS + RECORD_AUDIO_PERMISSIONS // カメラとマイク

          // --- メディア/ストレージ権限 ---
          val READ_IMAGES_PERMISSIONS = arrayOf(Manifest.permission.READ_MEDIA_IMAGES) // 画像読み書き
          val READ_VIDEO_PERMISSIONS = arrayOf(Manifest.permission.READ_MEDIA_VIDEO) // ビデオ読み書き
          val READ_AUDIO_PERMISSIONS = arrayOf(Manifest.permission.READ_MEDIA_AUDIO) // 音声ファイル読み書き

          // --- ストレージ権限 ---
          val STORAGE_PERMISSIONS = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // Android 13以上
              READ_IMAGES_PERMISSIONS + READ_VIDEO_PERMISSIONS + READ_AUDIO_PERMISSIONS
          } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) { // Android 11, 12
              arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
          } else { // Android 10以下（WRITE_EXTERNAL_STORAGEが必要な唯一の層）
              arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE)
          }

          // --- すべての権限 ---
          // TODO: このアプリに必要なすべての権限をここに指定する
          val ALL_PERMISSIONS = CAMERA_AND_AUDIO_PERMISSIONS + STORAGE_PERMISSIONS
        // 【権限の定義】ここまで
    }

    // 指定された権限がすべて許可されているか確認
    fun hasPermissions(permissions: Array<String>): Boolean {
        return permissions.all { permission ->
            ContextCompat.checkSelfPermission(
                activity,
                permission
            ) == PackageManager.PERMISSION_GRANTED
        }
    }

    // 権限をリクエスト
    fun requestPermissions(
        permissions: Array<String>,
        callback: (Map<String, Boolean>) -> Unit
    ) {
        permissionCallback = callback
        permissionLauncher.launch(permissions)
    }

    // すべての権限をリクエスト
    fun requestAllPermissions(callback: (Map<String, Boolean>) -> Unit) {
        requestPermissions(ALL_PERMISSIONS, callback)
    }

    // 権限の説明が必要かチェック
    fun shouldShowRationale(permission: String): Boolean {
        return activity.shouldShowRequestPermissionRationale(permission)
    }

    // アプリ設定を開く
    fun openAppSettings() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", activity.packageName, null)
        }
        activity.startActivity(intent)
    }

    // 「権限が拒否された」ダイアログを表示し、設定画面に誘導する
    fun showPermissionDeniedDialog(deniedPermissions: List<String>) {
        val message = buildString {
            append("以下の権限が拒否されました:\n\n")
            deniedPermissions.forEach { permission ->
                append("• ${getPermissionName(permission)}\n")
            }
            append("\n機能を利用するには、設定画面から権限を許可してください。")
        }

        AlertDialog.Builder(activity)
            .setTitle("権限が必要です")
            .setMessage(message)
            .setPositiveButton("設定を開く") { _, _ ->
                // 設定画面へ誘導
                openAppSettings()
            }
            .setNegativeButton("キャンセル") { dialog, _ ->
                dialog.dismiss()
            }
            .setCancelable(false) // 重要な案内なので枠外タップで閉じないようにする
            .show()
    }

    // 権限文字列から権限の名前を取得
    fun getPermissionName(permission: String): String {
        return when {
            permission.contains("CAMERA") -> "カメラ"
            permission.contains("AUDIO") || permission.contains("RECORD") -> "マイク"
            permission.contains("STORAGE") || permission.contains("MEDIA") -> "ストレージ"
            else -> permission
        }
    }

    // Web側からの権限リクエストを処理
    fun onPermissionRequest(request: PermissionRequest) {
        val resources = request.resources

        // リクエストされたリソースを分類
        val needsCamera = resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
        val needsAudio = resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)

        // 必要なAndroid権限を決定
        val androidPermissions = mutableListOf<String>()
        if (needsCamera) androidPermissions.add(Manifest.permission.CAMERA)
        if (needsAudio) androidPermissions.add(Manifest.permission.RECORD_AUDIO)

        // 権限が不要なリソースリクエストなら即座に拒否して終了
        if (androidPermissions.isEmpty()) {
            activity?.runOnUiThread {
                request.deny()
            }
            return
        }

        // 権限チェックとリクエスト
        if (hasPermissions(androidPermissions.toTypedArray())) {
            // すでに権限がある場合は許可
            activity.runOnUiThread { request.grant(request.resources) }
        } else {
            // 権限をリクエスト
            requestPermissions(androidPermissions.toTypedArray()) { results ->
                activity?.runOnUiThread {
                    try {
                        if (results.values.all { it }) {
                            request.grant(resources)
                        } else {
                            request.deny()
                        }
                    } catch (e: Exception) {
                        Timber.e(e, "Error granting/denying permission request")
                    }
                }
            }
        }
    }
}
