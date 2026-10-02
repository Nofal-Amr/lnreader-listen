# Stage 3 — Voices, Pauses, Skip Units, Sleep Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** T2S-grade listening controls: voice favourites and preview, pause lengths after commas, sentences, paragraphs and chapters, clause/sentence/paragraph rewind and forward, a sleep timer (minutes, end of chapter, N chapters, fade-out, shake to extend), auto-pause after inactivity, and "play alongside other media".

**Architecture:**

- **Breaks are computed in TS** (`computeBreaks(text)`, jest-tested) and sent with each paragraph (`TtsParagraph.breaks`), so both the WebView path and ListenQueue use one implementation.
- **Native speaks one sentence at a time** (comma pieces too, only when the comma pause is above 0), so prosody stays natural. It tracks the spoken character offset with `UtteranceProgressListener.onRangeStart`. Rewind and forward compute a target character offset from the breaks and resume speaking from there. That's how clause skips work without splitting speech at every comma.
- A pause is a timed gap on the owner `Handler` after an utterance finishes, with a length chosen by the boundary kind (clause / sentence / paragraph / chapter).
- `TtsSleepTimer.kt` holds the timer, fade (per-utterance `KEY_PARAM_VOLUME`), shake detection (accelerometer, active only while a timer runs) and auto-pause on inactivity. All timers are native `Handler` callbacks, so they work with the screen off.
- `TtsVoicePreview.kt`: a throwaway `TextToSpeech` instance speaks a sample with a given engine and voice, then shuts down.
- UI: new sections in `ReaderBottomSheet/TTSTab.tsx`: Favourites, Pauses, Skip ranges, Sleep timer, Auto-pause, Play with other media. Settings persist in the existing `ChapterReaderSettings.tts` object.

**Spec:** §4.1, §4.2 (local voices, favourites; Edge/Azure come in Stage 8)

## Global Constraints

- New `TtsSettings` fields are optional, so older stored settings keep working.
- Defaults: comma 0 ms, sentence 0 ms, paragraph 250 ms, chapter 800 ms, rewind = clause, forward = sentence, mix with others = off, auto-pause off.
- Do not split speech at commas unless `pauseCommaMs > 0`.

## Tasks

1. `src/services/listen/computeBreaks.ts` + tests: clause breaks after `, ; : — –` followed by a space, sentence breaks after `. ! ? …` (plus closing quotes/brackets) followed by a space. Offsets are the start of the next unit.
2. Nitro spec: `TtsBreak {offset:number; kind: TtsBreakKind}`, `TtsParagraph.breaks?`, `TtsSkipUnit`, extended `TtsSettings` (pause\*, rewindUnit, forwardUnit, mixWithOthers, autoPauseMinutes), `TtsSleepTimer`/`TtsSleepTimerState`, session `setSleepTimer`/`cancelSleepTimer`/`addOnSleepTimerChangedListener`, factory `previewVoice`. Regenerate nitrogen. Update the jest mock.
3. Kotlin: `TtsSpeechCursor.kt` (segment math), store integration (utterance = text from cursor to the next active break; onRangeStart tracking; pause gaps; unit-aware `skipPrevious`/`skipNext`; chapter pause from settings; mixWithOthers skips focus).
4. Kotlin: `TtsSleepTimer.kt` + store hooks (chapter-end counting, fade volume, shake, inactivity reset on every user command).
5. Kotlin: `TtsVoicePreview.kt` + factory.
6. JS: send breaks (useTtsSession + ListenQueue), map settings (`toNativeTtsSettings`), `useSleepTimer` hook.
7. UI: TTSTab sections + favourites store (MMKV `listen.favourites`).
8. Build, then emulator verification (pauses audible in logcat utterance timing, rewind by clause, sleep timer stops playback).
