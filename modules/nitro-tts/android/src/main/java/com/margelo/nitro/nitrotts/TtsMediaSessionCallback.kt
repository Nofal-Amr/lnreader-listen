package com.margelo.nitro.nitrotts

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.support.v4.media.session.MediaSessionCompat
import android.view.KeyEvent

internal class TtsMediaSessionCallback : MediaSessionCompat.Callback() {
    private val handler = Handler(Looper.getMainLooper())
    private var presses = 0

    // Wired headsets and many earbuds send one button for everything:
    // 1 press = play/pause, 2 = forward, 3 = rewind, like music players.
    private val resolvePresses = Runnable {
        when (presses) {
            1 -> togglePlayPause()
            2 -> TtsPlaybackStore.skipNext()
            else -> TtsPlaybackStore.skipPrevious()
        }
        presses = 0
    }

    override fun onMediaButtonEvent(mediaButtonEvent: Intent): Boolean {
        val event = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            mediaButtonEvent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
        } else {
            @Suppress("DEPRECATION")
            mediaButtonEvent.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
        } ?: return super.onMediaButtonEvent(mediaButtonEvent)

        val singleButton = event.keyCode == KeyEvent.KEYCODE_HEADSETHOOK ||
            event.keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
        if (!singleButton) return super.onMediaButtonEvent(mediaButtonEvent)

        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
            presses += 1
            handler.removeCallbacks(resolvePresses)
            handler.postDelayed(resolvePresses, MULTI_PRESS_WINDOW_MS)
        }
        return true
    }

    private fun togglePlayPause() {
        if (TtsPlaybackStore.snapshot().state == TtsPlaybackState.PLAYING) {
            TtsPlaybackStore.pause()
        } else {
            TtsPlaybackStore.play()
        }
    }

    override fun onPlay() {
        TtsPlaybackStore.play()
    }

    override fun onPause() {
        TtsPlaybackStore.pause()
    }

    override fun onStop() {
        TtsPlaybackStore.stop()
    }

    // Separate previous/next buttons (Bluetooth, watches, car, notification)
    // move by the configured rewind/forward unit.
    override fun onSkipToPrevious() {
        TtsPlaybackStore.skipPrevious()
    }

    override fun onSkipToNext() {
        TtsPlaybackStore.skipNext()
    }

    override fun onRewind() {
        TtsPlaybackStore.skipPrevious()
    }

    override fun onFastForward() {
        TtsPlaybackStore.skipNext()
    }

    private companion object {
        const val MULTI_PRESS_WINDOW_MS = 450L
    }
}
