package com.margelo.nitro.nitrotts

import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
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
            2 -> safely { TtsPlaybackStore.skipNext() }
            else -> safely { TtsPlaybackStore.skipPrevious() }
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

        // While paused, the silent keep-alive track still streams to the
        // earbuds, so many of them think audio is playing and send Pause
        // again instead of Play. A Pause press while already paused resumes.
        if (event.keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                if (isPlaying()) {
                    pauseNow()
                } else if (SystemClock.elapsedRealtime() - lastPauseAt > REPEAT_GUARD_MS) {
                    safely { TtsPlaybackStore.play() }
                }
            }
            return true
        }

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

    private var lastPauseAt = 0L

    private fun isPlaying(): Boolean {
        val state = TtsPlaybackStore.snapshot().state
        return state == TtsPlaybackState.PLAYING || state == TtsPlaybackState.LOADING
    }

    private fun pauseNow() {
        lastPauseAt = SystemClock.elapsedRealtime()
        safely { TtsPlaybackStore.pause() }
    }

    private fun togglePlayPause() {
        if (isPlaying()) {
            pauseNow()
        } else {
            safely { TtsPlaybackStore.play() }
        }
    }

    override fun onPlay() {
        safely { TtsPlaybackStore.play() }
    }

    // Some Bluetooth stacks send the earbud press here instead of as a key
    // event; same rule: Pause while already paused resumes.
    override fun onPause() {
        when {
            isPlaying() -> pauseNow()
            SystemClock.elapsedRealtime() - lastPauseAt > REPEAT_GUARD_MS ->
                safely { TtsPlaybackStore.play() }
        }
    }

    override fun onStop() {
        safely { TtsPlaybackStore.stop() }
    }

    // Separate previous/next buttons (Bluetooth, watches, car, notification)
    // move by the configured rewind/forward unit.
    override fun onSkipToPrevious() {
        safely { TtsPlaybackStore.skipPrevious() }
    }

    override fun onSkipToNext() {
        safely { TtsPlaybackStore.skipNext() }
    }

    override fun onRewind() {
        safely { TtsPlaybackStore.skipPrevious() }
    }

    override fun onFastForward() {
        safely { TtsPlaybackStore.skipNext() }
    }

    // A command with nothing loaded (or the engine not ready) must not
    // crash the app from a headset or the lock screen.
    private inline fun safely(block: () -> Unit) {
        runCatching(block)
    }

    private companion object {
        const val MULTI_PRESS_WINDOW_MS = 450L
        // Ignore a second Pause that arrives right after the first one.
        const val REPEAT_GUARD_MS = 1_500L
    }
}
