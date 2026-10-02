package com.margelo.nitro.nitrotts

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener

/** Speaks a sample with a given engine/voice on a throwaway engine instance. */
internal object TtsVoicePreview {
    private val handler = Handler(Looper.getMainLooper())
    private var active: TextToSpeech? = null

    fun speak(
        context: Context,
        text: String,
        rate: Double,
        pitch: Double,
        engineName: String?,
        voiceIdentifier: String?,
        completion: (Result<Unit>) -> Unit,
    ) {
        handler.post {
            active?.shutdown()
            active = null
            var finished = false
            var tts: TextToSpeech? = null
            fun finish(result: Result<Unit>) {
                handler.post {
                    if (finished) return@post
                    finished = true
                    tts?.shutdown()
                    if (active === tts) active = null
                    completion(result)
                }
            }
            val listener = TextToSpeech.OnInitListener { status ->
                handler.post {
                    val engine = tts
                    if (status != TextToSpeech.SUCCESS || engine == null) {
                        finish(Result.failure(IllegalStateException("The voice engine failed to start.")))
                        return@post
                    }
                    engine.voices?.firstOrNull { it.name == voiceIdentifier }?.let { engine.voice = it }
                    engine.setSpeechRate(rate.toFloat().coerceIn(0.1f, 4.0f))
                    engine.setPitch(pitch.toFloat().coerceIn(0.1f, 2.0f))
                    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String) = Unit

                        override fun onDone(utteranceId: String) {
                            finish(Result.success(Unit))
                        }

                        @Deprecated("Deprecated by Android")
                        override fun onError(utteranceId: String) {
                            finish(Result.failure(IllegalStateException("The voice failed to speak.")))
                        }
                    })
                    engine.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), "lnreader-preview")
                }
            }
            tts = if (engineName != null) {
                TextToSpeech(context.applicationContext, listener, engineName)
            } else {
                TextToSpeech(context.applicationContext, listener)
            }
            active = tts
            // Never leave a preview hanging if an engine goes silent.
            handler.postDelayed({ finish(Result.success(Unit)) }, 20_000L)
        }
    }
}
