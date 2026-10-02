# LNReader Listen — Design Spec

Date: 2026-10-02
Status: Draft for review
Base: fork of LNReader (MIT) at `ae8d055`, repo `Nofal-Amr/lnreader-listen`

## 1. Goal

A separate Android app, "LNReader Listen", that keeps everything LNReader does
and adds a T2S-style listening experience that never stops: screen off, app
closed, chapter after chapter. It also adds a full-screen Browser tab with
read-aloud, auto-next-chapter and ad blocking, downloads that survive Samsung's
background killing, and loading that never hangs.

Non-goals for v1: copy-to-speak, floating window over other apps, "type speak",
iOS. T2S (`hesoft.T2S`) is closed source; nothing is copied from it — only its
feature ideas are re-implemented.

## 2. Root causes in current LNReader (verified in code)

| Problem | Cause |
|---|---|
| TTS stops at chapter end with screen off | `modules/nitro-tts` native queue holds one chapter's paragraphs. On `completed`, `WebViewReader.tsx` injects `window.tts.complete()` and the **WebView/JS** navigates to the next chapter. Android/Samsung freeze the WebView and JS when the screen is off, so nothing loads the next chapter. |
| Downloads die when locked / app left | `DOWNLOAD_CHAPTER` runs through `backgroundTasks` (headless JS + WorkManager, `modules/native-background-tasks`). Samsung kills these even with "unrestricted" battery. |

## 3. Identity and distribution

- App name "LNReader Listen", package `com.nofalamr.lnreaderlisten` — installs
  next to official LNReader. Library moves via LNReader Backup → Restore.
- Built by GitHub Actions in the fork (adapt existing `build.yml`); every push to
  `main` publishes a signed APK to GitHub Releases.
- Signing key stored as repo secrets so updates install over the previous build.

## 4. Components

### 4.1 Listening engine (native, Kotlin) — extends `modules/nitro-tts`

One foreground `mediaPlayback` service owns playback end to end. No WebView or
JS on the hot path.

- **Chapter queue**: the service is given `(novelId, chapterId, sentenceIndex)`.
  It reads the chapter list from the SQLite DB directly (read-only), loads text
  from the downloaded chapter file, or asks the JS chapter fetcher (4.4) when not
  downloaded. At chapter end it advances itself.
- **Prefetch**: while chapter N plays, chapters N+1..N+3 are downloaded (via the
  download service, 4.4) and N+1 is pre-segmented and cleaned.
- **Segmentation**: clause / sentence / paragraph segments. "Optimized mode"
  batches short segments to reduce gaps (as in T2S).
- **Text pipeline** (4.3) runs before segmentation.
- **Pauses**: configurable silence (ms) after comma, sentence, paragraph,
  chapter; implemented with `TextToSpeech.playSilentUtterance`.
- **Read chapter title** on/off.
- **Position persistence**: chapter + segment saved every 5 s and on pause;
  written to LNReader's progress fields so the reader opens on the same line.
- **Watchdog**: if no utterance progress for 5 s while "playing", rebind engine
  and resume same segment; after 2 failures switch to fallback voice.
- **Audio focus**: "Play alongside other media" toggle (no focus request when on).
  When off: pause on calls, duck/pause for navigation, resume after.
  `ACTION_AUDIO_BECOMING_NOISY` (headphones unplugged / BT disconnect) pauses.
- **Sleep timer**: minutes / end of chapter / after N chapters; 10 s fade-out;
  shake to extend +10 min (toggle).
- **Auto-pause on inactivity** (T2S "Auto sleep"): pause after X min with no
  user interaction.

### 4.2 Voices

- **Engine/voice picker**: every installed TTS engine and each of its voices
  (existing `listEngines`/`listVoices`), language filter, preview button,
  "Manage voice data" shortcut to the engine's settings.
- **Favourites**: pinned voices (e.g. Samsung "United States - 8"
  `en-us-x-iom-local`, Google US 5, Google US 1), one-tap switch in the player.
- **Edge Steffan (online)**: `en-US-SteffanNeural` (and other Edge neural voices)
  through the Edge Read Aloud websocket. Unofficial; isolated behind a
  `VoiceProvider` interface so it can be fixed/removed without touching the rest.
  Audio is synthesized ahead (current + next 3 segments) and played with
  `MediaPlayer`/ExoPlayer.
- **Azure (optional)**: same voices with user's key + region (official API).
- **Fallback chain**: chosen voice → next favourite → system default. Online
  voices fall back to local when offline/timeout (5 s).
- Speed and pitch apply to all providers.

### 4.3 Text processing ("Speaking text process")

Applied to reader display (optional) and always to speech, for library chapters,
EPUB imports, and Browser pages.

- **Pre-made toggles**: don't read web links; don't read punctuation names;
  don't read `[1]`-style references; skip separator lines (`***`, `———`, `◇◇◇`)
  or turn them into a paragraph pause.
- **Watermark cleaner**: port of `epub_cleaner.py` watermark detection
  (low / normal / high) and chapter-title fixer (dedupe
  "Chapter 95 - 94: X" / "Chapter 95: Chapter 94: X" → "Chapter 94: X",
  strip problem quote/symbol chars). Ported to Kotlin with the Python test
  cases carried over as unit tests.
- **Custom rules**: Remove "X" / Replace "X" → "Y"; options: match case, whole
  word, regex. Ordered list, enable/disable each, import/export as JSON or
  plain lines.

### 4.4 Background work: downloads and chapter fetching

- **Download foreground service** (`dataSync` type) replaces the WorkManager path
  for `DOWNLOAD_CHAPTER`. Holds a partial wakelock + Wi-Fi lock while active.
  Notification shows a progress bar "Novel — 12/80" with Pause / Cancel.
- Plugin scraping is JS, so the service hosts a headless JS runtime
  (existing `LNReaderHeadlessTaskService`) *inside the foreground service's
  lifetime* — the service, not WorkManager, keeps the process alive.
- Per-chapter timeout 15 s, 2 retries with backoff, then marked failed with
  Retry in the UI. Queue persisted; resumes after reboot / network return.
- First-run prompt: request ignore-battery-optimizations (one tap) and explain
  Samsung "Never sleeping apps".

### 4.5 Player UI (React Native)

- **Mini player** above the bottom nav on every screen while a session exists.
- **Full player**: cover, big round play/pause, ⏮ prev chapter, ⏪ rewind
  (clause/sentence/paragraph), ⏩ forward (clause/sentence/paragraph),
  ⏭ next chapter, draggable chapter progress bar, quick buttons: speed, voice,
  sleep timer, pauses. Follow-along text with tap-to-seek.
- **Reader**: highlights the segment being spoken; bottom bar ⏪ ▶ ⏩ ⚙ with large
  round play.
- **Media session** (existing, extended): lock screen, notification, Bluetooth /
  wired headset buttons (1× play/pause, 2× forward, 3× rewind — remappable),
  Wear OS / Galaxy Watch media controls, Android Auto/car.
- "Lock & listen" button: turns screen off, keeps playing.

### 4.6 Browser tab

- New bottom-nav tab. `react-native-webview` with tabs (count badge),
  bookmarks, history, address bar.
- **Read aloud**: double-tap a paragraph to start there. Page text extracted by
  an injected script → text pipeline → same native player/session.
- **Reader mode**: Readability-style extraction of the main text.
- **Auto next chapter**: detect next link (`link[rel=next]`, `a[rel=next]`,
  text "Next", "Next chapter", "›", "→"). Per-site learned selector: user taps
  the site's next button once while "teach" is on; stored per domain.
  Next pages are fetched natively (OkHttp + same cookies) and extracted in a
  headless step so auto-next works with the screen off.
- **Ad blocking**: request interception (`shouldInterceptRequest`) with
  EasyList + uBlock filters (network rules), cosmetic rules injected as CSS,
  updated weekly; per-site toggle; blocked counter on a shield icon.
- **Add to library**: if the URL matches an installed LNReader plugin's site.

### 4.7 Full screen and OLED protection

- Reader and Browser: immersive sticky mode — status bar, navigation bar and
  address bar hidden. Tap centre to show controls; auto-hide after 3 s.
  Address bar also hides on scroll down.
- Any persistent indicator shifts a few px every 60 s.
- True-black chrome; optional forced dark mode for web pages
  (`WebSettings` algorithmic darkening / injected CSS fallback).

### 4.8 EPUB open

- Intent filters: VIEW and SEND/SEND_MULTIPLE for `application/epub+zip`
  ("Open with" / Share). Uses LNReader's existing EPUB import
  (`useImport`), optionally running the text pipeline's cleaner on import.

### 4.9 Loading and progress (never stuck)

- Every long operation exposes a determinate progress bar with %, item counts
  and Cancel: EPUB import ("Opening book — 41% (340/828)"), downloads (in app +
  notification), chapter/page loads (thin top bar).
- Playback starts once the first segments are ready; the rest loads in the
  background.
- Every network step: 15 s timeout, 2 retries, then a visible error with
  Retry / Skip chapter / Use downloaded copy. Stalled loads turn the bar orange.
- Browser: after 10 s show "Still loading… Reader mode / Retry".

## 5. Data

- New MMKV keys: `listen.voice`, `listen.favourites`, `listen.pauses`,
  `listen.rules`, `listen.sleep`, `listen.segmentation`, `browser.*`.
- New SQLite tables: `browser_bookmarks`, `browser_history`,
  `site_next_selectors`. Drizzle migration.
- Listening position reuses chapter progress columns plus `listen_segment`.

## 6. Error handling summary

Engine dies → watchdog rebind → fallback voice. Online voice fails → local
voice. Chapter fetch fails → retry ×2 → skip/notify, keep playing next if
available. No next chapter → stop with "End of available chapters" notification.

## 7. Testing

- Kotlin unit tests: text pipeline (port of epub_cleaner test cases), rule
  engine, segmentation, next-link detection, filter matching.
- Jest tests: settings screens, player state hooks, browser store.
- Manual device checklist (Samsung): 3 chapter auto-advance with screen off;
  80-chapter download with app swiped away; headset 1×/2×/3×; Galaxy Watch
  controls; sleep timer + shake; Browser auto-next on freewebnovel with screen
  off; ad counter; immersive mode in reader and browser; 828-chapter EPUB open
  with progress bar.
- CI: existing `pnpm run check` + jest + Gradle unit tests, then APK build.

## 8. Delivery phases (each ends in an installable APK)

1. Rename/package + CI release pipeline.
2. Native chapter queue + auto-next with screen off + position persistence.
3. Voice picker, favourites, pauses, segmentation, sleep timer, auto-pause,
   audio focus options.
4. Text pipeline: pre-made rules, custom rules, watermark/title cleaner.
5. Player UI: mini player, full player, reader highlight bar, headset mapping.
6. Download foreground service + progress bars + never-stuck loading.
7. Browser tab: tabs, read-aloud, reader mode, auto-next, ad blocking.
8. Full screen / OLED protection; EPUB "Open with"; Edge Steffan + Azure.
