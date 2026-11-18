package com.margelo.nitro.nitrotts

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.media.MediaBrowserServiceCompat
import java.util.UUID

/**
 * Keeps reading alive in the background and owns the media notification.
 *
 * It is also a media browser service. Android hides a paused player after
 * about ten minutes unless the app supports "media resumption": then the
 * player stays in quick settings as a resume card, and Play from the card or
 * a headset reaches this app instead of a music app.
 */
internal class TtsPlaybackService : MediaBrowserServiceCompat() {
    private lateinit var mediaNotification: TtsMediaNotification
    private var removeSnapshotListener: (() -> Unit)? = null
    private var foreground = false

    override fun onCreate() {
        super.onCreate()
        mediaNotification = TtsMediaNotification(this)
        sessionToken = mediaNotification.sessionToken
        // Started for playback (not just bound by the system for a resume card).
        if (TtsPlaybackStore.hasQueue()) goForeground()
        removeSnapshotListener = TtsPlaybackStore.addSnapshotListener(::onSnapshot)
        ContextCompat.registerReceiver(
            this,
            noisyReceiver,
            IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    private fun onSnapshot(snapshot: TtsPlaybackSnapshot) {
        when (snapshot.state) {
            TtsPlaybackState.IDLE, TtsPlaybackState.COMPLETED -> leaveForeground()
            TtsPlaybackState.PLAYING, TtsPlaybackState.LOADING ->
                // Resumed from a resume card while only bound: start properly.
                if (!foreground) runCatching { start(this) }
            else -> Unit
        }
        if (foreground) mediaNotification.notify(snapshot)
    }

    private fun goForeground() {
        val notification = mediaNotification.build(TtsPlaybackStore.snapshot())
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            foreground = true
        }
    }

    private fun leaveForeground() {
        if (!foreground) return
        foreground = false
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    }

    // Headphones unplugged / Bluetooth disconnected: pause instead of blaring
    // the chapter out of the phone speaker.
    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                TtsPlaybackStore.pauseFor("Paused: headphones disconnected.")
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // startForegroundService() needs startForeground() every time.
        goForeground()
        if (!TtsPlaybackStore.hasQueue()) {
            leaveForeground()
            stopSelf()
            return Service.START_NOT_STICKY
        }
        // The service is exported for the media browser, so only accept the
        // commands from this app's own notification buttons.
        if (intent?.getStringExtra(EXTRA_KEY) == commandKey) {
            runCatching {
                when (intent.action) {
                    ACTION_PLAY -> TtsPlaybackStore.play()
                    ACTION_PAUSE -> TtsPlaybackStore.pause()
                    ACTION_STOP -> TtsPlaybackStore.stop()
                    ACTION_PREVIOUS -> TtsPlaybackStore.skipPrevious()
                    ACTION_NEXT -> TtsPlaybackStore.skipNext()
                    ACTION_SLEEP -> TtsPlaybackStore.cycleSleepTimer()
                }
            }
        }
        return Service.START_NOT_STICKY
    }

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?,
    ): BrowserRoot? {
        val recent = rootHints?.getBoolean(BrowserRoot.EXTRA_RECENT) == true
        // Nothing to resume: no resume card.
        if (recent && !TtsPlaybackStore.hasQueue()) return null
        val extras = Bundle().apply {
            if (recent) putBoolean(BrowserRoot.EXTRA_RECENT, true)
        }
        return BrowserRoot(if (recent) RECENT_ROOT else ROOT, extras)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<MutableList<MediaBrowserCompat.MediaItem>>,
    ) {
        if (!TtsPlaybackStore.hasQueue()) {
            result.sendResult(mutableListOf())
            return
        }
        val metadata = TtsPlaybackStore.snapshot().metadata
        val description = MediaDescriptionCompat.Builder()
            .setMediaId(CURRENT_ITEM)
            .setTitle(metadata?.chapterName ?: "Text to speech")
            .setSubtitle(metadata?.novelName)
            .build()
        result.sendResult(
            mutableListOf(
                MediaBrowserCompat.MediaItem(
                    description,
                    MediaBrowserCompat.MediaItem.FLAG_PLAYABLE,
                ),
            ),
        )
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(noisyReceiver) }
        removeSnapshotListener?.invoke()
        removeSnapshotListener = null
        mediaNotification.release()
        super.onDestroy()
    }

    companion object {
        internal const val NOTIFICATION_ID = 1001
        internal const val ACTION_PLAY = "com.lnreader.TTS_PLAY"
        internal const val ACTION_PAUSE = "com.lnreader.TTS_PAUSE"
        internal const val ACTION_STOP = "com.lnreader.TTS_STOP"
        internal const val ACTION_PREVIOUS = "com.lnreader.TTS_PREVIOUS"
        internal const val ACTION_NEXT = "com.lnreader.TTS_NEXT"
        internal const val ACTION_SLEEP = "com.lnreader.TTS_SLEEP"
        internal const val EXTRA_KEY = "com.lnreader.TTS_KEY"
        private const val ROOT = "root"
        private const val RECENT_ROOT = "recent"
        private const val CURRENT_ITEM = "current"

        /** Changes every launch, so other apps can't send playback commands. */
        internal val commandKey: String = UUID.randomUUID().toString()

        fun start(context: Context) {
            val intent = Intent(context, TtsPlaybackService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TtsPlaybackService::class.java))
        }
    }
}
