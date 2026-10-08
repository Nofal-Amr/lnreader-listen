package com.margelo.nitro.nitrotts

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

internal class TtsMediaNotification(
    private val context: Context,
) {
    private val manager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    private val mediaSession = MediaSessionCompat(context, "LNReaderTTS")

    init {
        ensureChannel()
        mediaSession.setCallback(TtsMediaSessionCallback())
        mediaSession.isActive = true
    }

    // White book silhouette made for the status bar; the app icon as fallback.
    private val smallIcon: Int =
        context.resources
            .getIdentifier("notification_icon", "drawable", context.packageName)
            .takeIf { it != 0 } ?: context.applicationInfo.icon

    // Novel cover, loaded off the main thread and cached for the current uri.
    private val coverExecutor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var coverUri: String? = null
    private var cover: Bitmap? = null
    private var lastSnapshot: TtsPlaybackSnapshot? = null

    private fun coverFor(uri: String?): Bitmap? {
        if (uri.isNullOrBlank()) {
            coverUri = null
            cover = null
            return null
        }
        if (uri == coverUri) return cover
        coverUri = uri
        cover = null
        coverExecutor.execute {
            val bitmap = runCatching { loadCover(uri) }.getOrNull()
            mainHandler.post {
                if (coverUri != uri) return@post
                cover = bitmap
                if (bitmap != null) lastSnapshot?.let { notify(it) }
            }
        }
        return null
    }

    private fun loadCover(uri: String): Bitmap? {
        val bytes = if (uri.startsWith("http://") || uri.startsWith("https://")) {
            val connection = URL(uri).openConnection() as HttpURLConnection
            connection.connectTimeout = 8_000
            connection.readTimeout = 8_000
            connection.setRequestProperty(
                "User-Agent",
                "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
            )
            try {
                connection.inputStream.use { it.readBytes() }
            } finally {
                connection.disconnect()
            }
        } else {
            val path = if (uri.startsWith("file://")) Uri.parse(uri).path else uri
            val file = File(path ?: return null)
            // A folder or a missing file is not a cover.
            if (!file.isFile) return null
            file.readBytes()
        }
        if (bytes.isEmpty() || bytes.size > MAX_COVER_BYTES) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= COVER_SIZE &&
            bounds.outHeight / (sample * 2) >= COVER_SIZE
        ) {
            sample *= 2
        }
        return BitmapFactory.decodeByteArray(
            bytes,
            0,
            bytes.size,
            BitmapFactory.Options().apply { inSampleSize = sample },
        )
    }

    fun build(snapshot: TtsPlaybackSnapshot): Notification {
        lastSnapshot = snapshot
        val art = coverFor(snapshot.metadata?.coverUri)
        updateMediaSession(snapshot, art)

        val isPlaying = snapshot.state == TtsPlaybackState.PLAYING
        val progressLabel = paragraphProgressLabel(snapshot.progress)
        val playPauseAction = if (isPlaying) {
            action(
                android.R.drawable.ic_media_pause,
                "Pause",
                TtsPlaybackService.ACTION_PAUSE,
            )
        } else {
            action(
                android.R.drawable.ic_media_play,
                "Play",
                TtsPlaybackService.ACTION_PLAY,
            )
        }

        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(snapshot.metadata?.chapterName ?: "Text to speech")
            .setContentText(
                listOfNotNull(TtsPlaybackStore.sleepLabel(), progressLabel)
                    .joinToString(" · ")
                    .ifEmpty { snapshot.metadata?.novelName ?: "Vonkai Novel Reader" },
            )
            .setSubText(snapshot.metadata?.novelName)
            .setLargeIcon(art)
            .setSmallIcon(smallIcon)
            .setContentIntent(contentIntent())
            .setDeleteIntent(serviceIntent(TtsPlaybackService.ACTION_STOP))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            // Android 12+ may hold a service's notification back for ~10 s
            // while the app is open; show the controls straight away.
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setOnlyAlertOnce(true)
            .setOngoing(isPlaying)
            .addAction(
                action(
                    android.R.drawable.ic_media_previous,
                    "Previous paragraph",
                    TtsPlaybackService.ACTION_PREVIOUS,
                ),
            )
            .addAction(playPauseAction)
            .addAction(
                action(
                    android.R.drawable.ic_media_next,
                    "Next paragraph",
                    TtsPlaybackService.ACTION_NEXT,
                ),
            )
            .addAction(
                action(
                    android.R.drawable.ic_lock_idle_alarm,
                    TtsPlaybackStore.sleepLabel() ?: "Sleep timer",
                    TtsPlaybackService.ACTION_SLEEP,
                ),
            )
            .setStyle(
                MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2),
            )
            .build()
    }

    fun notify(snapshot: TtsPlaybackSnapshot) {
        manager.notify(TtsPlaybackService.NOTIFICATION_ID, build(snapshot))
    }

    fun release() {
        coverExecutor.shutdownNow()
        mainHandler.removeCallbacksAndMessages(null)
        mediaSession.isActive = false
        mediaSession.release()
        manager.cancel(TtsPlaybackService.NOTIFICATION_ID)
    }

    private fun updateMediaSession(snapshot: TtsPlaybackSnapshot, art: Bitmap?) {
        val progress = snapshot.progress
        val playbackState = when (snapshot.state) {
            TtsPlaybackState.PLAYING -> PlaybackStateCompat.STATE_PLAYING
            TtsPlaybackState.PAUSED -> PlaybackStateCompat.STATE_PAUSED
            TtsPlaybackState.ERROR -> PlaybackStateCompat.STATE_ERROR
            TtsPlaybackState.COMPLETED -> PlaybackStateCompat.STATE_STOPPED
            TtsPlaybackState.LOADING -> PlaybackStateCompat.STATE_BUFFERING
            TtsPlaybackState.IDLE -> PlaybackStateCompat.STATE_NONE
        }

        mediaSession.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or
                        PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_PLAY_PAUSE or
                        PlaybackStateCompat.ACTION_STOP or
                        PlaybackStateCompat.ACTION_REWIND or
                        PlaybackStateCompat.ACTION_FAST_FORWARD or
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT,
                )
                .setState(
                    playbackState,
                    PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN,
                    if (snapshot.state == TtsPlaybackState.PLAYING) 1f else 0f,
                )
                .build(),
        )

        mediaSession.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(
                    MediaMetadataCompat.METADATA_KEY_TITLE,
                    snapshot.metadata?.chapterName ?: "",
                )
                .putString(
                    MediaMetadataCompat.METADATA_KEY_ARTIST,
                    snapshot.metadata?.novelName ?: "",
                )
                .putString(
                    MediaMetadataCompat.METADATA_KEY_ALBUM,
                    paragraphProgressLabel(progress) ?: "",
                )
                .apply {
                    if (art != null) {
                        putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art)
                        putBitmap(MediaMetadataCompat.METADATA_KEY_ART, art)
                    }
                }
                .build(),
        )
    }

    private fun paragraphProgressLabel(progress: TtsProgress?): String? {
        val total = progress?.total?.toInt() ?: return null
        if (total <= 0) {
            return null
        }
        val current = progress.index.toInt().coerceIn(0, total - 1) + 1
        return "Paragraph $current of $total"
    }

    private fun action(icon: Int, title: String, action: String): NotificationCompat.Action {
        return NotificationCompat.Action.Builder(
            icon,
            title,
            serviceIntent(action),
        ).build()
    }

    private fun serviceIntent(action: String): PendingIntent {
        val intent = Intent(context, TtsPlaybackService::class.java).setAction(action)
        return PendingIntent.getService(
            context,
            action.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun contentIntent(): PendingIntent {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent()
        return PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val channel = NotificationChannel(
            CHANNEL_ID,
            "TTS Media Controls",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Text-to-speech playback controls"
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        private const val CHANNEL_ID = "tts-media-controls"
        private const val COVER_SIZE = 512
        private const val MAX_COVER_BYTES = 15_000_000
    }
}
