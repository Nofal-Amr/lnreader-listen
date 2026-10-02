# Stage 2 — Screen-off Auto-Next Chapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TTS keeps reading chapter after chapter with the screen off or the app in the background, and the reader catches up to the current chapter when it comes back to the foreground.

**Architecture:** Today the native queue holds one chapter. At its end, `completeQueue()` stops the foreground service and hands control to the reader WebView, and Samsung freezes the WebView when the screen is off. The fix has three parts:
1. The native store gets a queue of **upcoming chapters**. At chapter end it switches to the next queued chapter itself and emits `chapterChanged`. If none is queued it waits up to 30 s, holding a partial wakelock and keeping the service alive, before completing.
2. A JS `ListenQueue` service (no React, no timers, only event-driven: native events, promises and fetch, which all run in the background) keeps one chapter queued ahead. It loads the next chapter's HTML (downloaded file, else the plugin), extracts the paragraphs **with the same algorithm as the WebView** (`getAllReadableElements` + `normalizeText`, ported to `htmlparser2`) so indices match for highlighting, and marks finished chapters read.
3. `WebViewReader` registers with `ListenQueue`. When native changes chapter, the reader navigates to it without stopping TTS and highlights by index.

**Spec refinement (recorded here):** spec §4.1 says native reads SQLite directly. This plan feeds chapters from JS instead, ahead of time. That reuses LNReader's plugin and DB code with no duplicate Kotlin DB layer, and native always has the next chapter buffered, so a slow JS wake-up never causes a gap. Prefetching 2–3 chapters through the download service comes in Stage 6.

**Tech Stack:** Kotlin (nitro-tts module), Nitro Modules + nitrogen codegen, TypeScript, htmlparser2 12 / domhandler, Jest.

**Spec:** `docs/superpowers/specs/2026-10-02-lnreader-listen-design.md` (§2, §4.1)

## Global Constraints

- `pnpm run check` and `pnpm test` pass before each commit.
- No `console.*` in `src` (eslint `no-console`).
- Use path aliases (`@services/*`, `@database/*`, `@modules/nitro-tts`, …).
- Never call `setTimeout`/`setInterval` in code that must run with the screen off (the RN timer queue is driven by the UI frame callback and stalls in the background). Native timers (Kotlin `Handler`) are fine.
- Generated nitrogen files are committed. Regenerate with `pnpm --dir modules/nitro-tts specs` after any spec change.

---

### Task 1: Paragraph extraction identical to the WebView

**Files:**
- Create: `src/services/listen/extractTtsParagraphs.ts`
- Test: `src/services/listen/__tests__/extractTtsParagraphs.test.ts`

**Interfaces:**
- Produces: `extractTtsParagraphs(html: string): string[]`. The same order and filtering as `window.tts.start()` in `assets/reader/js/core.js:310-327`.

- [ ] **Step 1: Write the failing test**

```ts
import { extractTtsParagraphs } from '../extractTtsParagraphs';

describe('extractTtsParagraphs', () => {
  it('returns one entry per readable block, in document order', () => {
    const html =
      '<h1>Chapter 1: Start</h1><p>First <b>bold</b> line.</p><div><p>Nested one.</p><p>Nested two.</p></div>';
    expect(extractTtsParagraphs(html)).toEqual([
      'Chapter 1: Start',
      'First bold line.',
      'Nested one.',
      'Nested two.',
    ]);
  });

  it('drops dash-only separators and empty blocks', () => {
    expect(extractTtsParagraphs('<p>———</p><p> </p><p>Text.</p>')).toEqual([
      'Text.',
    ]);
  });

  it('normalizes whitespace, edge quotes and punctuation spacing', () => {
    expect(extractTtsParagraphs('<p>  “Hello ,  world  !”  </p>')).toEqual([
      'Hello, world!',
    ]);
  });

  it('treats a block with a non-inline child as a container', () => {
    expect(
      extractTtsParagraphs('<div>Intro<p>Inside.</p></div>'),
    ).toEqual(['Inside.']);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm jest src/services/listen/__tests__/extractTtsParagraphs.test.ts`
Expected: FAIL, "Cannot find module '../extractTtsParagraphs'".

- [ ] **Step 3: Implement**

```ts
import { parseDocument } from 'htmlparser2';
import type { AnyNode, Element } from 'domhandler';
import { isTag, isText } from 'domhandler';
import { textContent } from 'domutils';

// Mirrors `readableNodeNames` in assets/reader/js/core.js. Keep in sync so
// native paragraph indices match the WebView's highlight indices.
const READABLE_NODE_NAMES = new Set([
  '#text',
  'B',
  'I',
  'SPAN',
  'EM',
  'BR',
  'STRONG',
  'A',
  'MARK',
]);

const nodeName = (node: AnyNode): string =>
  isText(node) ? '#text' : isTag(node) ? node.name.toUpperCase() : '#other';

const isReadable = (el: Element): boolean => {
  const name = nodeName(el);
  if (name !== 'SPAN' && READABLE_NODE_NAMES.has(name)) {
    return false;
  }
  if (el.children.length === 0) {
    return false;
  }
  return el.children.every(child => READABLE_NODE_NAMES.has(nodeName(child)));
};

const DASH_ONLY = /^[\-‐‑‒–—―−⁓⸺⸻﹘﹣－]+$/u;

export const normalizeTtsText = (text: string): string => {
  if (!text) return '';
  const normalized = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s*([.,!?;:])\s*/g, '$1 ')
    .trim();
  const compact = normalized.replace(/\s/g, '');
  if (compact.length >= 3 && DASH_ONLY.test(compact)) {
    return '';
  }
  return normalized;
};

const innerText = (el: Element): string =>
  el.children
    .map(child =>
      isTag(child) && child.name.toLowerCase() === 'br'
        ? ' '
        : textContent(child),
    )
    .join('');

export const extractTtsParagraphs = (html: string): string[] => {
  const doc = parseDocument(html);
  const out: string[] = [];
  const traverse = (node: AnyNode) => {
    if (!isTag(node)) return;
    if (isReadable(node)) {
      const text = normalizeTtsText(innerText(node));
      if (text) out.push(text);
      return;
    }
    node.children.forEach(traverse);
  };
  doc.children.forEach(traverse);
  return out;
};
```

`domhandler` and `domutils` are dependencies of `htmlparser2`. If `pnpm` strictness rejects the import, add them to `package.json` dependencies with the versions already resolved in `pnpm-lock.yaml`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm jest src/services/listen/__tests__/extractTtsParagraphs.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/listen package.json pnpm-lock.yaml
git commit -m "feat(listen): extract TTS paragraphs from chapter HTML like the reader WebView"
```

### Task 2: Shared chapter-HTML loader

**Files:**
- Create: `src/services/listen/loadChapterHtml.ts`
- Modify: `src/screens/reader/hooks/useChapter.ts:168-178` (`loadChapterText` delegates to it)
- Test: `src/services/listen/__tests__/loadChapterHtml.test.ts`

**Interfaces:**
- Produces: `loadChapterHtml(novel: { pluginId: string; name: string }, chapter: { id: number; novelId: number; path: string; name: string }): Promise<string>` returns the **sanitized** HTML (downloaded file first, else `fetchChapter`, then `sanitizeChapterText`).

- [ ] **Step 1: Write the failing test**

```ts
import { loadChapterHtml } from '../loadChapterHtml';
import NativeFile from '@specs/NativeFile';
import { fetchChapter } from '@services/plugin/fetch';

jest.mock('@specs/NativeFile', () => ({
  __esModule: true,
  default: { readFile: jest.fn() },
}));
jest.mock('@services/plugin/fetch', () => ({ fetchChapter: jest.fn() }));
jest.mock('@screens/reader/utils/sanitizeChapterText', () => ({
  sanitizeChapterText: (_p: string, _n: string, _c: string, t: string) =>
    `S(${t})`,
}));

const novel = { pluginId: 'p', name: 'N' };
const chapter = { id: 3, novelId: 2, path: '/c3', name: 'C3' };

it('reads the downloaded file when present', async () => {
  (NativeFile.readFile as jest.Mock).mockResolvedValue('<p>a</p>');
  await expect(loadChapterHtml(novel, chapter)).resolves.toBe('S(<p>a</p>)');
  expect(fetchChapter).not.toHaveBeenCalled();
});

it('falls back to the plugin when the file is missing', async () => {
  (NativeFile.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
  (fetchChapter as jest.Mock).mockResolvedValue('<p>b</p>');
  await expect(loadChapterHtml(novel, chapter)).resolves.toBe('S(<p>b</p>)');
  expect(fetchChapter).toHaveBeenCalledWith('p', '/c3');
});
```

Before writing it, check the real import path of `NativeFile` in `useChapter.ts` and use the same one in the test and the implementation.

- [ ] **Step 2: Run it and confirm it fails** — `pnpm jest src/services/listen/__tests__/loadChapterHtml.test.ts`. Expected: module not found.

- [ ] **Step 3: Implement**

```ts
import NativeFile from '@specs/NativeFile';
import { fetchChapter } from '@services/plugin/fetch';
import { sanitizeChapterText } from '@screens/reader/utils/sanitizeChapterText';
import { NOVEL_STORAGE } from '@utils/Storages';

export const loadRawChapterHtml = async (
  pluginId: string,
  chapter: { id: number; novelId: number; path: string },
): Promise<string> => {
  const filePath = `${NOVEL_STORAGE}/${pluginId}/${chapter.novelId}/${chapter.id}/index.html`;
  try {
    return await NativeFile.readFile(filePath);
  } catch {
    return await fetchChapter(pluginId, chapter.path);
  }
};

export const loadChapterHtml = async (
  novel: { pluginId: string; name: string },
  chapter: { id: number; novelId: number; path: string; name: string },
): Promise<string> =>
  sanitizeChapterText(
    novel.pluginId,
    novel.name,
    chapter.name,
    await loadRawChapterHtml(novel.pluginId, chapter),
  );
```

- [ ] **Step 4: Point `useChapter.loadChapterText` at it**

```ts
  const loadChapterText = useCallback(
    (chap: ChapterInfo) => loadRawChapterHtml(novel.pluginId, chap),
    [novel.pluginId],
  );
```
Remove the now-unused imports (`NativeFile`, `fetchChapter` if no longer used, `NOVEL_STORAGE`) from `useChapter.ts`.

- [ ] **Step 5: Run** `pnpm jest src/services/listen src/screens/reader && pnpm run check`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/listen src/screens/reader/hooks/useChapter.ts
git commit -m "refactor(reader): share chapter HTML loading with the listen service"
```

### Task 3: Native multi-chapter queue

**Files:**
- Create: `modules/nitro-tts/src/types/TtsChapter.ts`
- Modify: `modules/nitro-tts/src/types/TtsMetadata.ts` (add `chapterId?: string`)
- Modify: `modules/nitro-tts/src/specs/TtsSession.nitro.ts`
- Modify: `modules/nitro-tts/src/index.ts` (export `TtsChapter`)
- Regenerate: `modules/nitro-tts/nitrogen/**`
- Modify: `modules/nitro-tts/android/src/main/java/com/margelo/nitro/nitrotts/TtsPlaybackStore.kt`
- Modify: `modules/nitro-tts/android/src/main/java/com/margelo/nitro/nitrotts/HybridTtsSession.kt`
- Modify: `modules/nitro-tts/android/src/main/AndroidManifest.xml`
- Modify: `modules/nitro-tts/ios/HybridTtsSession.swift` (stubs only, so codegen compiles; iOS isn't shipped)

**Interfaces:**
- Produces (TS):
  ```ts
  export interface TtsChapter {
    chapterId: string;
    paragraphs: TtsParagraph[];
    metadata: TtsMetadata;
  }
  // TtsSession additions
  appendChapter(chapter: TtsChapter): Promise<void>;
  clearUpcoming(): Promise<void>;
  addOnChapterChangedListener(listener: (chapterId: string) => void): ListenerSubscription;
  ```
- Behaviour: at the end of the current chapter, if a chapter is queued it becomes current (index 0), `chapterChanged(chapterId)` fires, and speech continues after a 600 ms silence. If none is queued, state becomes `loading` and the store waits 30 s for `appendChapter` (holding a partial wakelock), then completes as before.

- [ ] **Step 1: TS types and spec**

`TtsChapter.ts`:
```ts
import type { TtsMetadata } from './TtsMetadata';
import type { TtsParagraph } from './TtsParagraph';

/** A whole chapter queued to play after the current one. */
export interface TtsChapter {
  chapterId: string;
  paragraphs: TtsParagraph[];
  metadata: TtsMetadata;
}
```
In `TtsMetadata.ts` add:
```ts
  /** Database id of the chapter, echoed back by `addOnChapterChangedListener`. */
  chapterId?: string;
```
In `TtsSession.nitro.ts` import `TtsChapter` and add after `updateSettings`:
```ts
  /** Queues a chapter to play automatically after the current queue ends. */
  appendChapter(chapter: TtsChapter): Promise<void>;

  /** Drops chapters queued with `appendChapter`. */
  clearUpcoming(): Promise<void>;

  /** Fires with the new chapter id when playback advances into a queued chapter. */
  addOnChapterChangedListener(
    listener: (chapterId: string) => void,
  ): ListenerSubscription;
```
Export `TtsChapter` from `src/index.ts`.

- [ ] **Step 2: Regenerate bindings**

Run: `pnpm --dir modules/nitro-tts specs`
Expected: new `TtsChapter.kt` and updated `HybridTtsSessionSpec.kt` (abstract `appendChapter`, `clearUpcoming`, `addOnChapterChangedListener`) under `nitrogen/generated/android/kotlin/...`, plus matching C++/Swift files.

- [ ] **Step 3: Store changes** in `TtsPlaybackStore.kt`

Add fields:
```kotlin
    private val chapterListeners = TtsListenerRegistry<String>()
    private val upcoming = ArrayDeque<TtsChapter>()
    private var waitingForChapter = false
    private var wakeLock: android.os.PowerManager.WakeLock? = null
    private val giveUpWaiting = Runnable { if (waitingForChapter) finishWaiting(complete = true) }

    private const val CHAPTER_GAP_MS = 600L
    private const val WAIT_FOR_CHAPTER_MS = 30_000L
```
(`const val` must live in a `companion`/top level. Since `TtsPlaybackStore` is an `object`, plain `private const val` inside it is valid.)

In `load(...)` and `stop()`, after `generation += 1`, add `upcoming.clear(); finishWaiting(complete = false)`.

New functions:
```kotlin
    fun appendChapter(chapter: TtsChapter) {
        val readable = chapter.paragraphs.filter { it.text.isNotBlank() }
        if (readable.isEmpty()) return
        upcoming.addLast(TtsChapter(chapter.chapterId, readable.toTypedArray(), chapter.metadata))
        if (waitingForChapter) {
            finishWaiting(complete = false)
            startNextChapter()
        }
    }

    fun clearUpcoming() {
        upcoming.clear()
    }

    fun addChapterListener(listener: (String) -> Unit): () -> Unit =
        chapterListeners.add(listener)

    private fun startNextChapter() {
        val next = upcoming.removeFirst()
        paragraphs = next.paragraphs.toList()
        currentIndex = 0
        metadata = next.metadata
        chapterListeners.emit(next.chapterId)
        emitProgress()
        generation += 1
        engine?.playSilentUtterance(CHAPTER_GAP_MS, TextToSpeech.QUEUE_FLUSH, "lnreader-gap-$generation")
        ownerHandler.postDelayed({ if (state != TtsPlaybackState.PAUSED) speakCurrent() }, CHAPTER_GAP_MS)
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

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = applicationContext?.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager ?: return
        wakeLock = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "lnreader:tts-next").apply {
            setReferenceCounted(false)
            acquire(WAIT_FOR_CHAPTER_MS + 5_000L)
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }
```

Change the end-of-queue branch in **both** `advance()` and `skipNext()` from `completeQueue()` to:
```kotlin
            if (upcoming.isNotEmpty()) startNextChapter() else waitForChapter()
            return
```
Leave `completeQueue()` itself unchanged (it still stops the service, but now only after the 30 s wait).

- [ ] **Step 4: Bridge** in `HybridTtsSession.kt`:
```kotlin
    override fun appendChapter(chapter: TtsChapter): Promise<Unit> =
        MainThreadPromise.run { TtsPlaybackStore.appendChapter(chapter) }

    override fun clearUpcoming(): Promise<Unit> =
        MainThreadPromise.run(TtsPlaybackStore::clearUpcoming)

    override fun addOnChapterChangedListener(
        listener: (chapterId: String) -> Unit,
    ): ListenerSubscription =
        ListenerSubscription(TtsPlaybackStore.addChapterListener(listener))
```

- [ ] **Step 5: Permission** — add `<uses-permission android:name="android.permission.WAKE_LOCK" />` to the module `AndroidManifest.xml`.

- [ ] **Step 6: iOS stubs** — in `HybridTtsSession.swift`, implement the three members so codegen compiles: `appendChapter`/`clearUpcoming` return a resolved `Promise<Void>`, and `addOnChapterChangedListener` returns a `ListenerSubscription` whose remove is a no-op. Copy the existing style in that file.

- [ ] **Step 7: Verify** — `pnpm run type-check`. Native compilation is verified by CI in Task 5. Expected: type-check passes.

- [ ] **Step 8: Commit**

```bash
git add modules/nitro-tts
git commit -m "feat(tts): native multi-chapter queue that advances without the WebView"
```

### Task 4: ListenQueue service

**Files:**
- Create: `src/services/listen/ListenQueue.ts`
- Test: `src/services/listen/__tests__/ListenQueue.test.ts`

**Interfaces:**
- Consumes: `extractTtsParagraphs` (Task 1), `loadChapterHtml` (Task 2), `TtsSession.appendChapter` / `addOnChapterChangedListener` (Task 3), `getNextChapter(novelId, position, page)`, `getChapter(id)`, `markChapterRead(id)`, `updateChapterProgress(id, progress)` from `@database/queries/ChapterQueries`.
- Produces:
  ```ts
  type ListenNovel = { id: number; pluginId: string; name: string; cover?: string | null };
  type ListenChapter = { id: number; novelId: number; path: string; name: string; position: number; page: string };
  export const listenQueue: {
    start(session: TtsSession, novel: ListenNovel, chapter: ListenChapter): void;
    stop(): void;
    currentChapterId(): number | undefined;
    onChapterChanged(cb: (chapterId: number) => void): () => void;
  };
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { createListenQueue } from '../ListenQueue';

const flush = () => new Promise(r => setImmediate(r));

const makeSession = () => {
  let chapterCb: ((id: string) => void) | undefined;
  return {
    appendChapter: jest.fn().mockResolvedValue(undefined),
    clearUpcoming: jest.fn().mockResolvedValue(undefined),
    addOnChapterChangedListener: jest.fn(cb => {
      chapterCb = cb;
      return { remove: jest.fn() };
    }),
    fire: (id: string) => chapterCb?.(id),
  };
};

const novel = { id: 1, pluginId: 'p', name: 'N', cover: null };
const ch = (id: number) => ({ id, novelId: 1, path: `/c${id}`, name: `C${id}`, position: id, page: '1' });

const deps = () => ({
  getNextChapter: jest.fn(async (_n: number, pos: number) => (pos < 3 ? ch(pos + 1) : undefined)),
  getChapter: jest.fn(async (id: number) => ch(id)),
  loadChapterHtml: jest.fn(async (_n: unknown, c: { id: number }) => `<p>Text ${c.id}.</p>`),
  markChapterRead: jest.fn(async () => undefined),
  updateChapterProgress: jest.fn(async () => undefined),
});

it('queues the following chapter as soon as listening starts', async () => {
  const d = deps();
  const q = createListenQueue(d);
  const s = makeSession();
  q.start(s as never, novel, ch(1));
  await flush();
  expect(s.appendChapter).toHaveBeenCalledWith({
    chapterId: '2',
    paragraphs: [{ id: '0', text: 'Text 2.' }],
    metadata: { novelName: 'N', chapterName: 'C2', chapterId: '2', coverUri: undefined },
  });
});

it('on chapter change: marks previous read, notifies, queues the next', async () => {
  const d = deps();
  const q = createListenQueue(d);
  const s = makeSession();
  const seen: number[] = [];
  q.onChapterChanged(id => seen.push(id));
  q.start(s as never, novel, ch(1));
  await flush();
  s.fire('2');
  await flush();
  expect(d.markChapterRead).toHaveBeenCalledWith(1);
  expect(d.updateChapterProgress).toHaveBeenCalledWith(1, 100);
  expect(seen).toEqual([2]);
  expect(q.currentChapterId()).toBe(2);
  expect(s.appendChapter).toHaveBeenLastCalledWith(expect.objectContaining({ chapterId: '3' }));
});

it('skips a chapter whose text is empty and queues the one after', async () => {
  const d = deps();
  d.loadChapterHtml.mockImplementation(async (_n: unknown, c: { id: number }) =>
    c.id === 2 ? '<p> </p>' : `<p>Text ${c.id}.</p>`,
  );
  const q = createListenQueue(d);
  const s = makeSession();
  q.start(s as never, novel, ch(1));
  await flush();
  await flush();
  expect(s.appendChapter).toHaveBeenCalledWith(expect.objectContaining({ chapterId: '3' }));
});

it('does nothing after stop()', async () => {
  const d = deps();
  const q = createListenQueue(d);
  const s = makeSession();
  q.start(s as never, novel, ch(1));
  q.stop();
  await flush();
  expect(s.appendChapter).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it and confirm it fails** — `pnpm jest src/services/listen/__tests__/ListenQueue.test.ts`. Expected: module not found.

- [ ] **Step 3: Implement**

```ts
import type { TtsSession } from '@modules/nitro-tts';
import {
  getChapter,
  getNextChapter,
  markChapterRead,
  updateChapterProgress,
} from '@database/queries/ChapterQueries';
import { extractTtsParagraphs } from './extractTtsParagraphs';
import { loadChapterHtml } from './loadChapterHtml';

export type ListenNovel = { id: number; pluginId: string; name: string; cover?: string | null };
export type ListenChapter = {
  id: number;
  novelId: number;
  path: string;
  name: string;
  position: number;
  page: string;
};

type Deps = {
  getNextChapter: (novelId: number, position: number, page: string) => Promise<ListenChapter | undefined>;
  getChapter: (id: number) => Promise<ListenChapter | undefined>;
  loadChapterHtml: (novel: ListenNovel, chapter: ListenChapter) => Promise<string>;
  markChapterRead: (id: number) => Promise<void>;
  updateChapterProgress: (id: number, progress: number) => Promise<void>;
};

// A run of empty chapters (image-only, failed fetch) must not loop forever.
const MAX_SKIPPED = 5;

export const createListenQueue = (deps: Deps) => {
  let session: TtsSession | undefined;
  let novel: ListenNovel | undefined;
  let current: ListenChapter | undefined;
  let lastQueued: ListenChapter | undefined;
  let run = 0;
  let subscription: { remove(): void } | undefined;
  const listeners = new Set<(chapterId: number) => void>();

  const queueAfter = async (from: ListenChapter, myRun: number) => {
    let cursor: ListenChapter | undefined = from;
    for (let skipped = 0; skipped <= MAX_SKIPPED; skipped++) {
      cursor = await deps.getNextChapter(cursor.novelId, cursor.position, cursor.page);
      if (!cursor || myRun !== run || !session || !novel) return;
      let paragraphs: string[] = [];
      try {
        paragraphs = extractTtsParagraphs(await deps.loadChapterHtml(novel, cursor));
      } catch {
        paragraphs = [];
      }
      if (myRun !== run) return;
      if (paragraphs.length === 0) continue;
      lastQueued = cursor;
      await session.appendChapter({
        chapterId: String(cursor.id),
        paragraphs: paragraphs.map((text, index) => ({ id: String(index), text })),
        metadata: {
          novelName: novel.name,
          chapterName: cursor.name,
          chapterId: String(cursor.id),
          coverUri: novel.cover || undefined,
        },
      });
      return;
    }
  };

  const handleChapterChanged = (rawId: string) => {
    const myRun = run;
    const id = Number(rawId);
    const finished = current;
    void (async () => {
      if (finished) {
        await deps.updateChapterProgress(finished.id, 100);
        await deps.markChapterRead(finished.id);
      }
      const next = lastQueued?.id === id ? lastQueued : await deps.getChapter(id);
      if (myRun !== run || !next) return;
      current = next;
      listeners.forEach(cb => cb(id));
      await queueAfter(next, myRun);
    })();
  };

  return {
    start(nextSession: TtsSession, nextNovel: ListenNovel, chapter: ListenChapter) {
      run += 1;
      subscription?.remove();
      session = nextSession;
      novel = nextNovel;
      current = chapter;
      lastQueued = undefined;
      subscription = nextSession.addOnChapterChangedListener(handleChapterChanged);
      void queueAfter(chapter, run);
    },
    stop() {
      run += 1;
      subscription?.remove();
      subscription = undefined;
      void session?.clearUpcoming();
      session = undefined;
      current = undefined;
      lastQueued = undefined;
    },
    currentChapterId: () => current?.id,
    onChapterChanged(cb: (chapterId: number) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
};

export const listenQueue = createListenQueue({
  getNextChapter: (n, p, pg) => getNextChapter(n, p, pg) as Promise<ListenChapter | undefined>,
  getChapter: id => getChapter(id) as Promise<ListenChapter | undefined>,
  loadChapterHtml,
  markChapterRead,
  updateChapterProgress,
});
```
If `getChapter`/`getNextChapter` return a different row type, adapt the two wrappers at the bottom only. The core stays typed to `ListenChapter`.

- [ ] **Step 4: Run the tests and confirm they pass** — `pnpm jest src/services/listen`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/listen
git commit -m "feat(listen): ListenQueue keeps the next chapter queued in native TTS"
```

### Task 5: Wire the reader to ListenQueue

**Files:**
- Modify: `src/screens/reader/hooks/useTtsSession.ts` (expose the session; don't stop on unmount while the app is backgrounded)
- Modify: `src/screens/reader/components/WebViewReader.tsx` (lines ~208-233 and the `tts-queue` / `tts-command stop` handlers)
- Test: `src/screens/reader/hooks/__tests__/useTtsSession.test.ts` (extend)

**Interfaces:**
- Consumes: `listenQueue` (Task 4), `chapterId` in `TtsMetadata` (Task 3), `getChapter(navChapter)` from `useChapterContext()`.

- [ ] **Step 1: `useTtsSession` exposes `getSession`.** Add to the returned object:
```ts
    getSession: ensureSession,
```
Extend the existing test to assert `result.current.getSession` resolves to the mocked session.

- [ ] **Step 2: Start the queue when TTS starts.** In `WebViewReader.tsx`, in the `tts-queue` case, pass `chapterId: String(chapter.id)` in the metadata and, after `loadAndPlay(...)`, add:
```ts
              void getSession().then(session =>
                listenQueue.start(session, novel, chapter),
              );
```
(Destructure `getSession` from `useTtsSession()` next to `loadAndPlay`. Import `listenQueue` from `@services/listen/ListenQueue`.)

- [ ] **Step 3: Stop the queue on explicit stop.** In the `tts-command` case where `command === 'stop'`, call `listenQueue.stop()` before `runTtsCommand('stop')`.

- [ ] **Step 4: Follow native chapter changes.** Replace the effect that stops TTS on `chapter.id` change (currently `if (activeChapterIdRef.current !== chapter.id) { …; runTtsCommand('stop'); }`) with:
```ts
  useEffect(() => {
    if (activeChapterIdRef.current !== chapter.id) {
      activeChapterIdRef.current = chapter.id;
      // A change driven by ListenQueue is the audio moving on by itself;
      // only a user navigation should stop playback.
      if (listenQueue.currentChapterId() !== chapter.id) {
        listenQueue.stop();
        runTtsCommand('stop');
      }
    }
  }, [chapter.id, runTtsCommand]);

  useEffect(
    () =>
      listenQueue.onChapterChanged(id => {
        const [next] = adjacentChapterRef.current;
        if (next?.id === id) {
          getChapter(next);
        }
      }),
    [adjacentChapterRef, getChapter],
  );
```
`adjacentChapterRef` and `getChapter` come from `useChapterContext()`. If `adjacentChapterRef` isn't exposed there, expose it from `useChapter.ts`'s returned context value (it already exists at line ~113).

- [ ] **Step 5: Highlight on the new chapter without restarting.** After the reader loads a chapter that `listenQueue` reports as current, the WebView must show the TTS state without calling `tts.start()`. In the `onLoadEnd` handler, add after the search-text block:
```ts
          if (listenQueue.currentChapterId() === chapter.id && ttsProgress.total > 0) {
            webViewRef.current?.injectJavaScript(`
              window.tts?.setPlaybackState?.(${JSON.stringify(ttsState)});
              window.tts?.setActiveIndex?.(${ttsProgress.index});
              true;
            `);
          }
```
If `window.tts.setActiveIndex` requires `tts.allReadableElements` to be populated, add a `window.tts.attach()` to `core.js` that fills `allReadableElements`/`textQueue` (same code as the top of `start`) **without** posting `tts-queue`, and call `tts.attach()` before `setActiveIndex` in that injected script.

- [ ] **Step 6: Verify** — `pnpm run check && pnpm test`. Expected: PASS.

- [ ] **Step 7: Commit and push** (this triggers the Stage 1 release workflow)

```bash
git add src assets
git commit -m "feat(reader): keep TTS running across chapters with the screen off"
git push origin master
```
Then watch the run as in Stage 1 Task 2 Step 4. Expected: green, and a new release `LNReader Listen rN`.

- [ ] **Step 8: Device checklist (user, Samsung)**
1. Open a novel chapter, start TTS, lock the screen. **Expected:** it reads into the next 3 chapters by itself.
2. Unlock and open the app. **Expected:** the reader shows the chapter being read, with the current paragraph highlighted.
3. Tap stop, then navigate to another chapter manually. **Expected:** nothing plays.
4. Start TTS on the **last** available chapter and lock. **Expected:** it stops about 30 s after the end, and the notification disappears.
5. Chapters read by audio show as read in the chapter list.
