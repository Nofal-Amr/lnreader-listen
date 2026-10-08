package com.margelo.nitro.nitrotts

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

internal object TtsPlaybackStore {
    private val ownerHandler = Handler(Looper.getMainLooper())
    private val stateListeners = TtsListenerRegistry<TtsPlaybackState>()
    private val progressListeners = TtsListenerRegistry<TtsProgress>()
    private val errorListeners = TtsListenerRegistry<String>()
    private val snapshotListeners = TtsListenerRegistry<TtsPlaybackSnapshot>()
    private val chapterListeners = TtsListenerRegistry<String>()
    private val pendingInitialization = mutableListOf<(Result<Unit>) -> Unit>()

    // Chapters JS queued ahead of time. Advancing into them happens here, not in
    // the reader WebView, because Android freezes the WebView with the screen off.
    private val upcoming = ArrayDeque<TtsChapter>()
    private var waitingForChapter = false
    private var wakeLock: PowerManager.WakeLock? = null
    private val giveUpWaiting = Runnable {
        if (waitingForChapter) finishWaiting(complete = true)
    }
    private const val WAIT_FOR_CHAPTER_MS = 30_000L
    private const val DEFAULT_PARAGRAPH_PAUSE_MS = 250L
    private const val DEFAULT_CHAPTER_PAUSE_MS = 800L
    // How long the silent track keeps running after a pause (see emitState).
    private const val KEEP_ALIVE_AFTER_PAUSE_MS = 15 * 60 * 1000L

    private var applicationContext: Context? = null
    private var engine: TextToSpeech? = null
    private var boundEngineName: String? = null
    private var isReady = false
    private var paragraphs: List<TtsParagraph> = emptyList()
    private var currentIndex = 0
    private var metadata: TtsMetadata? = null
    private var settings =
        TtsSettings(null, null, 1.0, 1.0, null, null, null, null, null, null, null, null, null, null)
    private const val ONLINE_RETRY_AFTER_MS = 2 * 60_000L
    private var state = TtsPlaybackState.IDLE
    private var generation = 0L

    // Position inside the current paragraph: the active utterance covers
    // [charStart, utteranceEnd); spokenPos follows onRangeStart word by word.
    private var charStart = 0
    private var utteranceEnd = 0
    private var utteranceKind = BoundaryKind.PARAGRAPH
    private var spokenPos = 0
    private var currentUtteranceId: String? = null

    private val sleepTimerListeners = TtsListenerRegistry<TtsSleepTimerState>()
    private var lastSleepLabel: String? = null
    private val sleepTimer = SleepTimerController(
        handler = ownerHandler,
        onExpire = { pauseFor("Sleep timer ended.") },
        onChange = { timerState ->
            sleepTimerListeners.emit(timerState)
            // Refresh the notification only when its minute label changes.
            val label = sleepLabel()
            if (label != lastSleepLabel) {
                lastSleepLabel = label
                snapshotListeners.emit(snapshot())
            }
        },
    )
    private val stopKeepAlive = Runnable { keepAlive.stop() }

    private val autoPause = Runnable {
        if (state == TtsPlaybackState.PLAYING) {
            pauseFor("Paused after ${settings.autoPauseMinutes?.toInt() ?: 0} minutes without interaction.")
        }
    }
    private val keepAlive = SilentKeepAlive()

    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus = false
    private var resumeOnFocusGain = false

    fun prepare(context: Context, completion: (Result<Unit>) -> Unit) {
        runOnOwner {
            applicationContext = context.applicationContext
            if (audioManager == null) {
                audioManager =
                    applicationContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            }
            if (isReady && boundEngineName == localEngineName()) {
                completion(Result.success(Unit))
                return@runOnOwner
            }

            pendingInitialization.add(completion)
            bindEngine(localEngineName())
        }
    }

    /** Lists text-to-speech engines installed on the device. */
    fun listEngines(context: Context): List<TtsEngine> {
        val packageManager = context.packageManager
        val intent = Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE)
        val resolveInfos = packageManager.queryIntentServices(
            intent,
            PackageManager.GET_META_DATA,
        )
        return resolveInfos
            .map { resolveInfo ->
                TtsEngine(
                    name = resolveInfo.serviceInfo.packageName,
                    label = resolveInfo.serviceInfo.loadLabel(packageManager).toString(),
                )
            }
            .distinctBy { it.name }
            .sortedBy { it.label.lowercase() } +
            TtsEngine(name = OnlineVoice.ENGINE_NAME, label = OnlineVoice.ENGINE_LABEL)
    }

    /** Lists voices offered by `engineName`, probing it independently of the active engine. */
    fun listVoices(
        context: Context,
        engineName: String?,
        completion: (Result<List<TtsVoice>>) -> Unit,
    ) {
        if (OnlineVoice.isOnline(engineName)) {
            completion(Result.success(OnlineVoice.voices()))
            return
        }
        runOnOwner {
            var probe: TextToSpeech? = null
            val listener = TextToSpeech.OnInitListener { status ->
                runOnOwner {
                    val result = if (status == TextToSpeech.SUCCESS) {
                        val voices = probe?.voices
                            ?.map { voice ->
                                TtsVoice(
                                    identifier = voice.name,
                                    name = voice.name,
                                    language = voice.locale?.toLanguageTag(),
                                )
                            }
                            ?.sortedBy { it.name }
                            ?: emptyList()
                        Result.success(voices)
                    } else {
                        Result.failure(
                            IllegalStateException("The selected text-to-speech engine failed to initialize."),
                        )
                    }
                    probe?.shutdown()
                    probe = null
                    completion(result)
                }
            }
            probe = if (engineName != null) {
                TextToSpeech(context.applicationContext, listener, engineName)
            } else {
                TextToSpeech(context.applicationContext, listener)
            }
        }
    }

    /** (Re)binds [engine] to [engineName], shutting down any previously bound engine. */
    private fun bindEngine(engineName: String?) {
        val context = checkNotNull(applicationContext)
        isReady = false
        engine?.stop()
        engine?.shutdown()
        engine = null

        val listener = TextToSpeech.OnInitListener { status ->
            runOnOwner {
                if (status == TextToSpeech.SUCCESS) {
                    isReady = true
                    boundEngineName = engineName
                    engine?.setOnUtteranceProgressListener(progressListener)
                    completeInitialization(Result.success(Unit))
                } else {
                    engine = null
                    completeInitialization(
                        Result.failure(
                            IllegalStateException("The selected text-to-speech engine failed to initialize."),
                        ),
                    )
                }
            }
        }
        engine = if (engineName != null) {
            TextToSpeech(context, listener, engineName)
        } else {
            TextToSpeech(context, listener)
        }
    }

    fun load(
        nextParagraphs: Array<TtsParagraph>,
        initialIndex: Int,
        nextMetadata: TtsMetadata,
        nextSettings: TtsSettings,
    ) {
        requireReady()
        require(nextParagraphs.isNotEmpty()) { "The TTS queue cannot be empty." }

        generation += 1
        stopSpeech()
        upcoming.clear()
        finishWaiting(complete = false)
        // Blank paragraphs (emptied by speech rules) keep their slot so indices
        // match the reader highlight; speakCurrent() skips them.
        require(nextParagraphs.any { it.text.isNotBlank() }) {
            "The TTS queue contains no readable paragraphs."
        }
        paragraphs = nextParagraphs.toList()
        currentIndex = initialIndex.coerceIn(paragraphs.indices)
        charStart = 0
        spokenPos = 0
        metadata = nextMetadata
        settings = nextSettings
        noteInteraction()
        state = TtsPlaybackState.PAUSED
        emitProgress()
        emitState()

        val context = checkNotNull(applicationContext)
        TtsPlaybackService.start(context)
    }

    fun play() {
        requireReady()
        check(paragraphs.isNotEmpty()) { "Load a paragraph queue before starting TTS." }
        noteInteraction()
        speakCurrent()
    }

    /**
     * Manual pause (from the user, media notification, or MediaSession controls).
     * Always wins over a later focus regain — even if we're currently paused because of a
     * transient focus loss (e.g. a call), calling this makes sure TTS stays paused once the
     * call ends instead of auto-resuming.
     */
    fun pause() {
        ownerHandler.removeCallbacks(autoPause)
        resumeOnFocusGain = false
        abandonAudioFocus()
        if (waitingForChapter) {
            finishWaiting(complete = false)
            state = TtsPlaybackState.PAUSED
            emitState()
            return
        }
        pauseEngine()
    }

    fun stop() {
        generation += 1
        stopSpeech()
        upcoming.clear()
        finishWaiting(complete = false)
        paragraphs = emptyList()
        currentIndex = 0
        charStart = 0
        spokenPos = 0
        metadata = null
        sleepTimer.cancel()
        ownerHandler.removeCallbacks(autoPause)
        state = TtsPlaybackState.IDLE
        resumeOnFocusGain = false
        abandonAudioFocus()
        emitState()
        applicationContext?.let { TtsPlaybackService.stop(it) }
    }

    /**
     * The online voice gives no word positions, so estimate where it is from
     * how much of the clip has played, snapped back to that sentence's start.
     */
    private fun trackOnlinePosition() {
        if (state != TtsPlaybackState.PLAYING) return
        val fraction = OnlineVoice.playedFraction() ?: return
        val paragraph = paragraphs.getOrNull(currentIndex) ?: return
        val estimate = charStart + ((utteranceEnd - charStart) * fraction).toInt()
        val sentenceStart = paragraph.breaks
            ?.filter { it.kind == TtsBreakKind.SENTENCE && it.offset.toInt() <= estimate }
            ?.maxOfOrNull { it.offset.toInt() } ?: 0
        spokenPos = sentenceStart.coerceIn(charStart, paragraph.text.length)
    }

    /** Stops the engine and marks playback paused, without touching audio focus. */
    private fun pauseEngine() {
        if (state != TtsPlaybackState.PLAYING) {
            return
        }
        trackOnlinePosition()
        generation += 1
        stopSpeech()
        // Resume from the word being spoken, not the start of the sentence.
        charStart = spokenPos.coerceIn(0, paragraphs.getOrNull(currentIndex)?.text?.length ?: 0)
        state = TtsPlaybackState.PAUSED
        emitState()
    }

    /**
     * Requests playback focus so the system can tell us to pause for a call or other audio
     * that genuinely needs exclusive use of the speaker. Duck-only interruptions (notification
     * sounds, alerts) are left alone - see [handleAudioFocusChange].
     */
    private fun requestAudioFocus(): Boolean {
        if (settings.mixWithOthers == true) {
            abandonAudioFocus()
            return true
        }
        if (hasAudioFocus) return true
        val manager = audioManager ?: return false

        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attributes)
                .setOnAudioFocusChangeListener(audioFocusChangeListener, ownerHandler)
                .build()
            audioFocusRequest = request
            manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
            @Suppress("DEPRECATION")
            manager.requestAudioFocus(
                audioFocusChangeListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN,
            ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
        hasAudioFocus = granted
        return granted
    }

    private fun abandonAudioFocus() {
        if (!hasAudioFocus) return
        val manager = audioManager
        if (manager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
            } else {
                @Suppress("DEPRECATION")
                manager.abandonAudioFocus(audioFocusChangeListener)
            }
        }
        hasAudioFocus = false
    }

    private val audioFocusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        runOnOwner { handleAudioFocusChange(focusChange) }
    }

    private fun handleAudioFocusChange(focusChange: Int) {
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                // Another app now owns audio focus outright (e.g. a call was answered).
                hasAudioFocus = false
                resumeOnFocusGain = false
                if (state == TtsPlaybackState.PLAYING) {
                    errorListeners.emit("Paused: another app started playing audio.")
                }
                pauseEngine()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                // Something needs exclusive use of the speaker for a short while
                // Pause and remember to resume once it's done.
                resumeOnFocusGain = state == TtsPlaybackState.PLAYING
                pauseEngine()
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                hasAudioFocus = true
                if (resumeOnFocusGain) {
                    resumeOnFocusGain = false
                    play()
                }
            }
        }
    }

    fun skipPrevious() {
        check(paragraphs.isNotEmpty()) { "Load a paragraph queue before seeking." }
        noteInteraction()
        trackOnlinePosition()
        val unit = settings.rewindUnit ?: TtsSkipUnit.CLAUSE
        val target = TtsSpeechCursor.previousStart(paragraphs[currentIndex], spokenPos, unit)
        when {
            target != null -> charStart = target
            currentIndex > 0 -> {
                currentIndex -= 1
                charStart = TtsSpeechCursor.lastStart(paragraphs[currentIndex], unit)
            }
            else -> charStart = 0
        }
        speakCurrent()
    }

    fun skipNext() {
        check(paragraphs.isNotEmpty()) { "Load a paragraph queue before seeking." }
        noteInteraction()
        trackOnlinePosition()
        val unit = settings.forwardUnit ?: TtsSkipUnit.SENTENCE
        val target = TtsSpeechCursor.nextStart(paragraphs[currentIndex], spokenPos, unit)
        when {
            target != null -> charStart = target
            currentIndex < paragraphs.lastIndex -> {
                currentIndex += 1
                charStart = 0
            }
            else -> {
                continueToNextChapter()
                return
            }
        }
        speakCurrent()
    }

    fun replayCurrent() {
        check(paragraphs.isNotEmpty()) { "Load a paragraph queue before replaying." }
        noteInteraction()
        charStart = 0
        speakCurrent()
    }

    fun seekTo(index: Int) {
        check(paragraphs.isNotEmpty()) { "Load a paragraph queue before seeking." }
        noteInteraction()
        currentIndex = index.coerceIn(paragraphs.indices)
        charStart = 0
        speakCurrent()
    }

    fun updateSettings(nextSettings: TtsSettings) {
        requireReady()
        val shouldResume = state == TtsPlaybackState.PLAYING
        settings = nextSettings
        noteInteraction()
        if (shouldResume) {
            charStart = spokenPos
            speakCurrent()
        }
    }

    fun setSleepTimer(timer: TtsSleepTimer) {
        val context = checkNotNull(applicationContext)
        noteInteraction()
        sleepTimer.start(context, timer)
    }

    fun cancelSleepTimer() {
        sleepTimer.cancel()
    }

    /** Pauses and tells the UI why (shown in the player). */
    fun pauseFor(reason: String) {
        val wasPlaying = state == TtsPlaybackState.PLAYING || waitingForChapter
        pause()
        if (wasPlaying) errorListeners.emit(reason)
    }

    /** Short sleep-timer text for the notification, or null when off. */
    fun sleepLabel(): String? {
        val s = sleepTimer.state()
        if (!s.active) return null
        return when (s.mode) {
            TtsSleepTimerMode.MINUTES -> "Sleep in ${Math.ceil(s.remainingMs / 60_000.0).toInt()} min"
            TtsSleepTimerMode.ENDOFCHAPTER -> "Sleep at end of chapter"
            TtsSleepTimerMode.CHAPTERS -> "Sleep in ${s.remainingChapters.toInt()} chapters"
        }
    }

    /** Notification button: off → 15 → 30 → 60 min → end of chapter → off. */
    fun cycleSleepTimer() {
        val context = applicationContext ?: return
        val s = sleepTimer.state()
        val minutesLeft = Math.ceil(s.remainingMs / 60_000.0)
        val next: TtsSleepTimer? = when {
            !s.active -> TtsSleepTimer(TtsSleepTimerMode.MINUTES, 15.0, true)
            s.mode == TtsSleepTimerMode.MINUTES && minutesLeft <= 15 ->
                TtsSleepTimer(TtsSleepTimerMode.MINUTES, 30.0, true)
            s.mode == TtsSleepTimerMode.MINUTES && minutesLeft <= 30 ->
                TtsSleepTimer(TtsSleepTimerMode.MINUTES, 60.0, true)
            s.mode == TtsSleepTimerMode.MINUTES ->
                TtsSleepTimer(TtsSleepTimerMode.ENDOFCHAPTER, 1.0, true)
            else -> null
        }
        if (next == null) sleepTimer.cancel() else sleepTimer.start(context, next)
        lastSleepLabel = sleepLabel()
        snapshotListeners.emit(snapshot())
    }

    fun addSleepTimerListener(listener: (TtsSleepTimerState) -> Unit): () -> Unit {
        runOnOwner { listener(sleepTimer.state()) }
        return sleepTimerListeners.add(listener)
    }

    /** Restarts the inactivity countdown; only user commands call this. */
    private fun noteInteraction() {
        ownerHandler.removeCallbacks(autoPause)
        val minutes = settings.autoPauseMinutes ?: 0.0
        if (minutes > 0) {
            ownerHandler.postDelayed(autoPause, (minutes * 60_000.0).toLong())
        }
    }

    fun addStateListener(listener: (TtsPlaybackState) -> Unit): () -> Unit {
        runOnOwner { listener(state) }
        return stateListeners.add(listener)
    }

    fun addProgressListener(listener: (TtsProgress) -> Unit): () -> Unit {
        runOnOwner { currentProgress()?.let(listener) }
        return progressListeners.add(listener)
    }

    fun addErrorListener(listener: (String) -> Unit): () -> Unit {
        return errorListeners.add(listener)
    }

    fun addSnapshotListener(listener: (TtsPlaybackSnapshot) -> Unit): () -> Unit {
        listener(snapshot())
        return snapshotListeners.add(listener)
    }

    fun snapshot(): TtsPlaybackSnapshot {
        return TtsPlaybackSnapshot(state, metadata, currentProgress())
    }

    /** Speaks from [charStart] to the next active break of the current paragraph. */
    private fun speakCurrent() {
        if (engine == null || localEngineName() != boundEngineName) {
            pendingInitialization.add { result ->
                result.fold(
                    onSuccess = { speakCurrent() },
                    onFailure = { fail("The selected text-to-speech engine failed to initialize.") },
                )
            }
            bindEngine(localEngineName())
            return
        }

        if (!requestAudioFocus()) {
            fail("Couldn't get audio focus - another app or call may be using audio.")
            return
        }

        val activeEngine = checkNotNull(engine)
        val paragraph = paragraphs[currentIndex]
        charStart = charStart.coerceIn(0, paragraph.text.length)
        val splitClauses = (settings.pauseCommaMs ?: 0.0) > 0
        val (end, kind) = TtsSpeechCursor.utteranceEnd(paragraph, charStart, splitClauses, splitSentences())
        utteranceEnd = end
        utteranceKind = kind
        spokenPos = charStart
        generation += 1
        val utteranceId = "lnreader-$generation-$currentIndex-$charStart"
        currentUtteranceId = utteranceId

        state = TtsPlaybackState.PLAYING
        resumeOnFocusGain = false
        emitProgress()
        emitState()

        val text = paragraph.text.substring(charStart, end)
        if (text.isBlank()) {
            // Blank paragraph: skipped, or a section break that is pure silence.
            val silence = if (charStart == 0) paragraph.pauseMs?.toLong() ?: 0L else 0L
            val token = generation
            ownerHandler.postDelayed({
                if (generation == token && state == TtsPlaybackState.PLAYING) advance(utteranceId)
            }, silence)
            return
        }

        if (OnlineVoice.isOnline(settings.engineName) && OnlineVoice.usable()) {
            speakOnline(text, utteranceId)
            return
        }

        activeEngine.setSpeechRate(settings.rate.toFloat().coerceIn(0.1f, 4.0f))
        activeEngine.setPitch(settings.pitch.toFloat().coerceIn(0.1f, 2.0f))
        applyVoice(activeEngine)

        val params = Bundle().apply {
            putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, sleepTimer.volume())
        }
        val result = activeEngine.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
        if (result == TextToSpeech.ERROR) {
            fail("The text-to-speech engine rejected the current paragraph.")
        }
    }

    private fun onlineRequest(text: String) = OnlineVoice.Request(
        text = text,
        voice = settings.voiceIdentifier,
        rate = settings.rate,
        pitch = settings.pitch,
        azureKey = settings.azureKey,
        azureRegion = settings.azureRegion,
    )

    /** Speaks via the online neural voice; any failure drops to the device voice. */
    private fun speakOnline(text: String, utteranceId: String) {
        val context = checkNotNull(applicationContext)
        OnlineVoice.speak(
            context,
            onlineRequest(text),
            utteranceId,
            sleepTimer.volume(),
            onStart = { progressListener.onStart(utteranceId) },
            onDone = { advance(utteranceId) },
            onError = { message ->
                if (utteranceId != currentUtteranceId) return@speak
                OnlineVoice.disableFor(ONLINE_RETRY_AFTER_MS)
                errorListeners.emit("$message Using the phone voice for now.")
                // Same position, now spoken by the local engine.
                speakCurrent()
            },
        )
        nextUtteranceText()?.let { OnlineVoice.prefetch(onlineRequest(it)) }
    }

    private fun splitSentences() = (settings.pauseSentenceMs ?: 0.0) > 0

    /** Text of the utterance after the current one, for online prefetching. */
    private fun nextUtteranceText(): String? {
        val splitClauses = (settings.pauseCommaMs ?: 0.0) > 0
        val paragraph = paragraphs.getOrNull(currentIndex) ?: return null
        if (utteranceEnd < paragraph.text.length) {
            val (end, _) = TtsSpeechCursor.utteranceEnd(paragraph, utteranceEnd, splitClauses, splitSentences())
            return paragraph.text.substring(utteranceEnd, end).takeIf { it.isNotBlank() }
        }
        val next = paragraphs.getOrNull(currentIndex + 1)
            ?: upcoming.firstOrNull()?.paragraphs?.firstOrNull()
            ?: return null
        val (end, _) = TtsSpeechCursor.utteranceEnd(next, 0, splitClauses, splitSentences())
        return next.text.substring(0, end).takeIf { it.isNotBlank() }
    }

    /** The device engine to bind: the online voice uses the default one as fallback. */
    private fun localEngineName(): String? =
        settings.engineName.takeUnless { OnlineVoice.isOnline(it) }

    private fun stopSpeech() {
        engine?.stop()
        OnlineVoice.stop()
    }

    private fun applyVoice(activeEngine: TextToSpeech) {
        if (OnlineVoice.isOnline(settings.engineName)) {
            // Fallback from the online voice: default device voice, in English.
            activeEngine.setLanguage(Locale.US)
            return
        }
        val voiceIdentifier = settings.voiceIdentifier
        if (voiceIdentifier.isNullOrBlank()) {
            activeEngine.setLanguage(Locale.getDefault())
            return
        }

        val selectedVoice = activeEngine.voices?.firstOrNull {
            it.name == voiceIdentifier
        }
        if (selectedVoice != null) {
            activeEngine.voice = selectedVoice
        }
    }

    private fun advance(utteranceId: String) {
        if (utteranceId != currentUtteranceId) {
            return
        }
        val paragraph = paragraphs.getOrNull(currentIndex) ?: return
        val pauseMs = when {
            utteranceEnd < paragraph.text.length -> {
                charStart = utteranceEnd
                when (utteranceKind) {
                    BoundaryKind.CLAUSE -> settings.pauseCommaMs
                    BoundaryKind.SENTENCE -> settings.pauseSentenceMs
                    BoundaryKind.PARAGRAPH -> 0.0
                }?.toLong() ?: 0L
            }
            currentIndex < paragraphs.lastIndex -> {
                currentIndex += 1
                charStart = 0
                settings.pauseParagraphMs?.toLong() ?: DEFAULT_PARAGRAPH_PAUSE_MS
            }
            else -> {
                continueToNextChapter()
                return
            }
        }
        spokenPos = charStart
        afterPause(pauseMs) { speakCurrent() }
    }

    /** Runs [action] after [ms] of silence unless playback was paused/seeked meanwhile. */
    private fun afterPause(ms: Long, action: () -> Unit) {
        if (ms <= 0) {
            action()
            return
        }
        generation += 1
        val token = generation
        ownerHandler.postDelayed({
            if (generation == token && state == TtsPlaybackState.PLAYING) action()
        }, ms)
    }

    fun appendChapter(chapter: TtsChapter) {
        if (chapter.paragraphs.none { it.text.isNotBlank() }) return
        upcoming.addLast(chapter)
        if (waitingForChapter) {
            finishWaiting(complete = false)
            startNextChapter(autoPlay = true)
        }
    }

    fun clearUpcoming() {
        upcoming.clear()
    }

    fun addChapterListener(listener: (String) -> Unit): () -> Unit =
        chapterListeners.add(listener)

    private fun continueToNextChapter() {
        val sleepNow = sleepTimer.consumeChapter()
        when {
            upcoming.isNotEmpty() -> startNextChapter(autoPlay = !sleepNow)
            sleepNow -> {
                generation += 1
                state = TtsPlaybackState.PAUSED
                abandonAudioFocus()
                emitState()
            }
            else -> waitForChapter()
        }
    }

    private fun startNextChapter(autoPlay: Boolean) {
        val next = upcoming.removeFirst()
        paragraphs = next.paragraphs.toList()
        currentIndex = 0
        charStart = 0
        spokenPos = 0
        metadata = next.metadata
        chapterListeners.emit(next.chapterId)
        emitProgress()
        if (!autoPlay) {
            // The sleep timer ended here: sit at the start of the next chapter.
            generation += 1
            state = TtsPlaybackState.PAUSED
            abandonAudioFocus()
            emitState()
            return
        }
        state = TtsPlaybackState.PLAYING
        afterPause(settings.pauseChapterMs?.toLong() ?: DEFAULT_CHAPTER_PAUSE_MS) { speakCurrent() }
    }

    private fun waitForChapter() {
        waitingForChapter = true
        state = TtsPlaybackState.LOADING
        emitState()
        acquireWakeLock()
        ownerHandler.postDelayed(giveUpWaiting, WAIT_FOR_CHAPTER_MS)
    }

    private fun finishWaiting(complete: Boolean) {
        if (!waitingForChapter) return
        waitingForChapter = false
        ownerHandler.removeCallbacks(giveUpWaiting)
        releaseWakeLock()
        if (complete) completeQueue()
    }

    // Keeps the CPU awake while JS fetches the next chapter with the screen off.
    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val powerManager =
            applicationContext?.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lnreader:tts-next").apply {
            setReferenceCounted(false)
            acquire(WAIT_FOR_CHAPTER_MS + 5_000L)
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }

    private fun completeQueue() {
        state = TtsPlaybackState.COMPLETED
        emitState()
        applicationContext?.let { TtsPlaybackService.stop(it) }
    }

    private fun fail(message: String) {
        state = TtsPlaybackState.ERROR
        errorListeners.emit(message)
        emitState()
    }

    private fun emitState() {
        // Keep this app the "active player" while reading so media buttons
        // (headphones, watch, Bluetooth) come here and not to a music app.
        // It keeps running for a while after a pause too: if it stopped at the
        // same moment as the voice, Android could count the TTS engine (which
        // has no media session) as the last player and hand the next Play
        // press - e.g. a Bluetooth headset reconnecting - to a music app.
        ownerHandler.removeCallbacks(stopKeepAlive)
        when (state) {
            TtsPlaybackState.PLAYING, TtsPlaybackState.LOADING -> keepAlive.start()
            TtsPlaybackState.PAUSED, TtsPlaybackState.ERROR ->
                ownerHandler.postDelayed(stopKeepAlive, KEEP_ALIVE_AFTER_PAUSE_MS)
            else -> keepAlive.stop()
        }
        stateListeners.emit(state)
        snapshotListeners.emit(snapshot())
    }

    private fun emitProgress() {
        val progress = currentProgress() ?: return
        progressListeners.emit(progress)
        snapshotListeners.emit(snapshot())
    }

    private fun currentProgress(): TtsProgress? {
        val paragraph = paragraphs.getOrNull(currentIndex) ?: return null
        return TtsProgress(
            index = currentIndex.toDouble(),
            total = paragraphs.size.toDouble(),
            paragraphId = paragraph.id,
        )
    }

    private fun completeInitialization(result: Result<Unit>) {
        val callbacks = pendingInitialization.toList()
        pendingInitialization.clear()
        callbacks.forEach { it(result) }
    }

    private fun requireReady() {
        check(isReady) { "The text-to-speech engine is not ready." }
    }

    private fun runOnOwner(operation: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            operation()
        } else {
            ownerHandler.post(operation)
        }
    }

    private val progressListener = object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String) {
            runOnOwner {
                if (utteranceId == currentUtteranceId) {
                    state = TtsPlaybackState.PLAYING
                    emitState()
                }
            }
        }

        override fun onRangeStart(utteranceId: String, start: Int, end: Int, frame: Int) {
            runOnOwner {
                if (utteranceId == currentUtteranceId) {
                    spokenPos = charStart + start
                }
            }
        }

        override fun onDone(utteranceId: String) {
            runOnOwner { advance(utteranceId) }
        }

        @Deprecated("Deprecated by Android")
        override fun onError(utteranceId: String) {
            runOnOwner {
                if (utteranceId == currentUtteranceId) {
                    fail("The text-to-speech engine failed while speaking.")
                }
            }
        }

        override fun onError(utteranceId: String, errorCode: Int) {
            runOnOwner {
                if (utteranceId == currentUtteranceId) {
                    fail("The text-to-speech engine failed with error code $errorCode.")
                }
            }
        }
    }
}
