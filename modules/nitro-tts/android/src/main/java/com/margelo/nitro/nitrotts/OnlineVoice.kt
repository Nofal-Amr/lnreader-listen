package com.margelo.nitro.nitrotts

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

/**
 * Microsoft neural voices (e.g. en-US-SteffanNeural) as a pseudo TTS engine.
 *
 * Default source is the endpoint Microsoft Edge's "Read aloud" uses. It is not
 * an official API and may change without notice, so every failure falls back
 * to the device voice. An Azure Speech key switches to the official REST API.
 */
internal object OnlineVoice {
    const val ENGINE_NAME = "lnreader.online"
    const val ENGINE_LABEL = "Microsoft Edge voices (online)"

    val VOICES: List<Pair<String, String>> = listOf(
        "en-US-SteffanNeural" to "Steffan (US)",
        "en-US-AndrewNeural" to "Andrew (US)",
        "en-US-BrianNeural" to "Brian (US)",
        "en-US-ChristopherNeural" to "Christopher (US)",
        "en-US-EricNeural" to "Eric (US)",
        "en-US-GuyNeural" to "Guy (US)",
        "en-US-RogerNeural" to "Roger (US)",
        "en-US-AvaNeural" to "Ava (US)",
        "en-US-AriaNeural" to "Aria (US)",
        "en-US-EmmaNeural" to "Emma (US)",
        "en-US-JennyNeural" to "Jenny (US)",
        "en-US-MichelleNeural" to "Michelle (US)",
        "en-GB-RyanNeural" to "Ryan (UK)",
        "en-GB-ThomasNeural" to "Thomas (UK)",
        "en-GB-SoniaNeural" to "Sonia (UK)",
        "en-GB-LibbyNeural" to "Libby (UK)",
        "en-AU-WilliamNeural" to "William (Australia)",
        "en-AU-NatashaNeural" to "Natasha (Australia)",
        "en-IE-ConnorNeural" to "Connor (Ireland)",
        "en-CA-LiamNeural" to "Liam (Canada)",
        "en-IN-PrabhatNeural" to "Prabhat (India)",
    )
    private const val DEFAULT_VOICE = "en-US-SteffanNeural"

    private const val TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
    private const val GEC_VERSION = "1-143.0.3650.75"
    private const val EDGE_URL =
        "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1"
    private const val OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"
    private const val FETCH_TIMEOUT_MS = 10_000L
    private const val CACHE_SIZE = 8

    data class Request(
        val text: String,
        val voice: String?,
        val rate: Double,
        val pitch: Double,
        val azureKey: String?,
        val azureRegion: String?,
    ) {
        val key: String get() = "$voice|$rate|$pitch|${azureKey != null}|$text"
    }

    private val handler = Handler(Looper.getMainLooper())
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()
    private val cache = object : LinkedHashMap<String, ByteArray>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ByteArray>?) =
            size > CACHE_SIZE
    }
    private val inflight = HashMap<String, MutableList<(Result<ByteArray>) -> Unit>>()
    private var player: MediaPlayer? = null
    private var activeId: String? = null
    private var disabledUntil = 0L

    fun isOnline(engineName: String?) = engineName == ENGINE_NAME

    fun voices(): List<TtsVoice> = VOICES.map { (id, label) ->
        TtsVoice(identifier = id, name = label, language = id.substringBeforeLast('-'))
    }

    /** False for a while after a failure, so playback stays on the device voice. */
    fun usable(): Boolean = SystemClock.elapsedRealtime() >= disabledUntil

    fun disableFor(ms: Long) {
        disabledUntil = SystemClock.elapsedRealtime() + ms
    }

    /** Synthesizes ahead so the next sentence starts without a gap. */
    fun prefetch(request: Request) {
        if (request.text.isBlank() || !usable()) return
        fetch(request) { }
    }

    fun speak(
        context: Context,
        request: Request,
        utteranceId: String,
        volume: Float,
        onStart: () -> Unit,
        onDone: () -> Unit,
        onError: (String) -> Unit,
    ) {
        stop()
        activeId = utteranceId
        val timeout = Runnable {
            if (activeId == utteranceId && player == null) {
                activeId = null
                onError("The online voice did not answer in time.")
            }
        }
        handler.postDelayed(timeout, FETCH_TIMEOUT_MS)
        fetch(request) { result ->
            handler.post {
                handler.removeCallbacks(timeout)
                if (activeId != utteranceId) return@post
                result.fold(
                    onSuccess = { bytes -> play(context, bytes, utteranceId, volume, onStart, onDone, onError) },
                    onFailure = {
                        activeId = null
                        onError(it.message ?: "The online voice failed.")
                    },
                )
            }
        }
    }

    fun stop() {
        activeId = null
        player?.let {
            runCatching { it.stop() }
            it.release()
        }
        player = null
    }

    private fun play(
        context: Context,
        bytes: ByteArray,
        utteranceId: String,
        volume: Float,
        onStart: () -> Unit,
        onDone: () -> Unit,
        onError: (String) -> Unit,
    ) {
        val file = File(context.cacheDir, "online-tts-current.mp3")
        try {
            file.writeBytes(bytes)
        } catch (error: IOException) {
            activeId = null
            onError("Could not store the online voice audio.")
            return
        }
        val mediaPlayer = MediaPlayer()
        player = mediaPlayer
        mediaPlayer.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        mediaPlayer.setOnPreparedListener {
            if (activeId != utteranceId) return@setOnPreparedListener
            it.setVolume(volume, volume)
            it.start()
            onStart()
        }
        mediaPlayer.setOnCompletionListener {
            if (activeId != utteranceId) return@setOnCompletionListener
            it.release()
            player = null
            activeId = null
            onDone()
        }
        mediaPlayer.setOnErrorListener { mp, _, _ ->
            mp.release()
            if (player === mp) player = null
            if (activeId == utteranceId) {
                activeId = null
                onError("The online voice audio could not be played.")
            }
            true
        }
        try {
            mediaPlayer.setDataSource(file.path)
            mediaPlayer.prepareAsync()
        } catch (error: Exception) {
            mediaPlayer.release()
            player = null
            activeId = null
            onError("The online voice audio could not be played.")
        }
    }

    private fun fetch(request: Request, callback: (Result<ByteArray>) -> Unit) {
        val key = request.key
        synchronized(cache) {
            cache[key]?.let {
                callback(Result.success(it))
                return
            }
            inflight[key]?.let {
                it.add(callback)
                return
            }
            inflight[key] = mutableListOf(callback)
        }
        val finish = { result: Result<ByteArray> ->
            val callbacks = synchronized(cache) {
                result.onSuccess { cache[key] = it }
                inflight.remove(key) ?: mutableListOf()
            }
            callbacks.forEach { it(result) }
        }
        val azureKey = request.azureKey
        if (!azureKey.isNullOrBlank() && !request.azureRegion.isNullOrBlank()) {
            fetchAzure(request, azureKey, request.azureRegion, finish)
        } else {
            fetchEdge(request, finish)
        }
    }

    private fun fetchAzure(
        request: Request,
        key: String,
        region: String,
        done: (Result<ByteArray>) -> Unit,
    ) {
        val http = okhttp3.Request.Builder()
            .url("https://$region.tts.speech.microsoft.com/cognitiveservices/v1")
            .header("Ocp-Apim-Subscription-Key", key)
            .header("X-Microsoft-OutputFormat", OUTPUT_FORMAT)
            .header("User-Agent", "LNReaderListen")
            .post(ssml(request, shortName = true).toRequestBody("application/ssml+xml".toMediaType()))
            .build()
        client.newCall(http).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: IOException) {
                done(Result.failure(e))
            }

            override fun onResponse(call: okhttp3.Call, response: Response) {
                response.use {
                    val body = it.body?.bytes()
                    if (it.isSuccessful && body != null && body.isNotEmpty()) {
                        done(Result.success(body))
                    } else {
                        done(Result.failure(IOException("Azure Speech returned ${it.code}.")))
                    }
                }
            }
        })
    }

    private fun fetchEdge(request: Request, done: (Result<ByteArray>) -> Unit) {
        val connectionId = UUID.randomUUID().toString().replace("-", "")
        val url = "$EDGE_URL?TrustedClientToken=$TRUSTED_CLIENT_TOKEN" +
            "&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=$GEC_VERSION&ConnectionId=$connectionId"
        val http = okhttp3.Request.Builder()
            .url(url)
            .header("Pragma", "no-cache")
            .header("Cache-Control", "no-cache")
            .header("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold")
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                    "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
            )
            .build()
        val audio = ByteArrayOutputStream()
        var finished = false
        val complete = { result: Result<ByteArray> ->
            if (!finished) {
                finished = true
                done(result)
            }
        }
        client.newWebSocket(http, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                val now = timestamp()
                webSocket.send(
                    "X-Timestamp:$now\r\nContent-Type:application/json; charset=utf-8\r\n" +
                        "Path:speech.config\r\n\r\n" +
                        "{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":" +
                        "{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"}," +
                        "\"outputFormat\":\"$OUTPUT_FORMAT\"}}}}",
                )
                webSocket.send(
                    "X-RequestId:$connectionId\r\nContent-Type:application/ssml+xml\r\n" +
                        "X-Timestamp:${now}Z\r\nPath:ssml\r\n\r\n" + ssml(request, shortName = false),
                )
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.contains("Path:turn.end")) {
                    webSocket.close(1000, null)
                    complete(
                        if (audio.size() > 0) {
                            Result.success(audio.toByteArray())
                        } else {
                            Result.failure(IOException("The online voice returned no audio."))
                        },
                    )
                }
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                val data = bytes.toByteArray()
                if (data.size < 2) return
                val headerLength = ((data[0].toInt() and 0xff) shl 8) or (data[1].toInt() and 0xff)
                if (2 + headerLength > data.size) return
                val header = String(data, 2, headerLength, Charsets.UTF_8)
                if (header.contains("Path:audio")) {
                    audio.write(data, 2 + headerLength, data.size - 2 - headerLength)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                complete(Result.failure(IOException(t.message ?: "The online voice is unreachable.")))
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                complete(Result.failure(IOException("The online voice closed the connection.")))
            }
        })
    }

    // Edge's Read Aloud endpoint requires this rolling token (5-minute window).
    private fun secMsGec(): String {
        var seconds = System.currentTimeMillis() / 1000 + 11_644_473_600L
        seconds -= seconds % 300
        val ticks = seconds * 10_000_000L
        val digest = MessageDigest.getInstance("SHA-256")
            .digest("$ticks$TRUSTED_CLIENT_TOKEN".toByteArray(Charsets.US_ASCII))
        return digest.joinToString("") { "%02X".format(it) }
    }

    private fun timestamp(): String {
        val format = SimpleDateFormat(
            "EEE MMM dd yyyy HH:mm:ss 'GMT+0000 (Coordinated Universal Time)'",
            Locale.US,
        )
        format.timeZone = TimeZone.getTimeZone("UTC")
        return format.format(Date())
    }

    private fun ssml(request: Request, shortName: Boolean): String {
        val voice = request.voice?.takeIf { v -> VOICES.any { it.first == v } } ?: DEFAULT_VOICE
        val locale = voice.split('-').take(2).joinToString("-")
        val name = if (shortName) {
            voice
        } else {
            "Microsoft Server Speech Text to Speech Voice ($locale, ${voice.split('-').drop(2).joinToString("-")})"
        }
        val rate = ((request.rate - 1.0) * 100).roundToInt().coerceIn(-90, 300)
        val pitch = ((request.pitch - 1.0) * 50).roundToInt().coerceIn(-50, 50)
        val rateText = if (rate >= 0) "+$rate%" else "$rate%"
        val pitchText = if (pitch >= 0) "+${pitch}Hz" else "${pitch}Hz"
        return "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='$locale'>" +
            "<voice name='$name'><prosody pitch='$pitchText' rate='$rateText' volume='+0%'>" +
            escapeXml(request.text) + "</prosody></voice></speak>"
    }

    private fun escapeXml(text: String) = text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")
}
