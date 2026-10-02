package com.margelo.nitro.nitrotts

import android.app.Service
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.media.AudioManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat

internal class TtsPlaybackService : Service() {
    private lateinit var mediaNotification: TtsMediaNotification
    private var removeSnapshotListener: (() -> Unit)? = null

    override fun onCreate() {
        super.onCreate()
        mediaNotification = TtsMediaNotification(this)
        val snapshot = TtsPlaybackStore.snapshot()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                mediaNotification.build(snapshot),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        } else {
            startForeground(NOTIFICATION_ID, mediaNotification.build(snapshot))
        }
        removeSnapshotListener = TtsPlaybackStore.addSnapshotListener(
            mediaNotification::notify,
        )
        ContextCompat.registerReceiver(
            this,
            noisyReceiver,
            IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    // Headphones unplugged / Bluetooth disconnected: pause instead of blaring
    // the chapter out of the phone speaker.
    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                TtsPlaybackStore.pause()
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY -> TtsPlaybackStore.play()
            ACTION_PAUSE -> TtsPlaybackStore.pause()
            ACTION_STOP -> TtsPlaybackStore.stop()
            ACTION_PREVIOUS -> TtsPlaybackStore.skipPrevious()
            ACTION_NEXT -> TtsPlaybackStore.skipNext()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(noisyReceiver) }
        removeSnapshotListener?.invoke()
        removeSnapshotListener = null
        mediaNotification.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        internal const val NOTIFICATION_ID = 1001
        internal const val ACTION_PLAY = "com.lnreader.TTS_PLAY"
        internal const val ACTION_PAUSE = "com.lnreader.TTS_PAUSE"
        internal const val ACTION_STOP = "com.lnreader.TTS_STOP"
        internal const val ACTION_PREVIOUS = "com.lnreader.TTS_PREVIOUS"
        internal const val ACTION_NEXT = "com.lnreader.TTS_NEXT"

        fun start(context: Context) {
            val intent = Intent(context, TtsPlaybackService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TtsPlaybackService::class.java))
        }

    }
}
