package com.margelo.nitro.nitrotts

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack

/**
 * Plays inaudible silence from this app while TTS speaks.
 *
 * The voice itself is rendered by the TTS engine's own process (Samsung /
 * Google), so Android does not see this app as the one playing audio and sends
 * headphone / watch / Bluetooth media buttons to the last music app instead.
 * A looping silent track in our process makes this app the active player, so
 * those buttons reach our media session.
 */
internal class SilentKeepAlive {
    private var track: AudioTrack? = null

    fun start() {
        if (track != null) return
        val sampleRate = 8_000
        val frames = sampleRate // one second, looped
        val created = runCatching {
            AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build(),
                )
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(frames * 2)
                .build()
                .apply {
                    write(ShortArray(frames), 0, frames)
                    setLoopPoints(0, frames, -1)
                    play()
                }
        }.getOrNull()
        track = created
    }

    fun stop() {
        track?.let {
            runCatching { it.stop() }
            it.release()
        }
        track = null
    }
}
