import type { TtsSession } from '@modules/nitro-tts';
import {
  getChapter,
  getNextChapter,
  markChapterRead,
  updateChapterProgress,
} from '@database/queries/ChapterQueries';
import type { ChapterInfo } from '@database/types';

import { computeBreaks } from './computeBreaks';
import { extractTtsParagraphs } from './extractTtsParagraphs';
import { loadChapterHtml } from './loadChapterHtml';

export type ListenNovel = {
  id: number;
  pluginId: string;
  name: string;
  cover?: string | null;
};

export type ListenChapter = Pick<
  ChapterInfo,
  'id' | 'novelId' | 'path' | 'name' | 'position' | 'page'
>;

export type ListenQueueDeps = {
  getNextChapter: (
    chapter: ListenChapter,
    excludedScanlators?: string[],
  ) => Promise<ListenChapter | undefined>;
  getChapter: (id: number) => Promise<ListenChapter | undefined>;
  loadChapterHtml: (
    novel: ListenNovel,
    chapter: ListenChapter,
  ) => Promise<string>;
  markChapterRead: (id: number) => Promise<void>;
  updateChapterProgress: (id: number, progress: number) => Promise<void>;
};

type Session = Pick<
  TtsSession,
  'appendChapter' | 'clearUpcoming' | 'addOnChapterChangedListener'
>;

// A run of empty chapters (image-only, failed fetch) must not loop forever.
const MAX_SKIPPED = 5;

/**
 * Keeps one chapter queued ahead in the native TTS session, so playback moves
 * on by itself with the screen off. Purely event-driven (native events,
 * promises, fetch): RN timers stall in the background and must not be used.
 */
export const createListenQueue = (deps: ListenQueueDeps) => {
  let session: Session | undefined;
  let novel: ListenNovel | undefined;
  let scanlators: string[] | undefined;
  let current: ListenChapter | undefined;
  let lastQueued: ListenChapter | undefined;
  let run = 0;
  let subscription: { remove(): void } | undefined;
  const listeners = new Set<(chapterId: number) => void>();

  const queueAfter = async (from: ListenChapter, myRun: number) => {
    let cursor: ListenChapter | undefined = from;
    for (let skipped = 0; skipped <= MAX_SKIPPED; skipped++) {
      cursor = await deps.getNextChapter(cursor, scanlators);
      if (!cursor || myRun !== run || !session || !novel) return;
      let paragraphs: string[];
      try {
        paragraphs = extractTtsParagraphs(
          await deps.loadChapterHtml(novel, cursor),
        );
      } catch {
        paragraphs = [];
      }
      if (myRun !== run) return;
      if (paragraphs.length === 0) continue;
      lastQueued = cursor;
      await session.appendChapter({
        chapterId: String(cursor.id),
        paragraphs: paragraphs.map((text, index) => ({
          id: String(index),
          text,
          breaks: computeBreaks(text),
        })),
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
      const next =
        lastQueued?.id === id ? lastQueued : await deps.getChapter(id);
      if (myRun !== run || !next) return;
      current = next;
      listeners.forEach(cb => cb(id));
      await queueAfter(next, myRun);
    })().catch(() => undefined);
  };

  return {
    start(
      nextSession: Session,
      nextNovel: ListenNovel,
      chapter: ListenChapter,
      excludedScanlators?: string[],
    ) {
      run += 1;
      subscription?.remove();
      session = nextSession;
      novel = nextNovel;
      scanlators = excludedScanlators;
      current = chapter;
      lastQueued = undefined;
      subscription =
        nextSession.addOnChapterChangedListener(handleChapterChanged);
      queueAfter(chapter, run).catch(() => undefined);
    },
    stop() {
      run += 1;
      subscription?.remove();
      subscription = undefined;
      session?.clearUpcoming().catch(() => undefined);
      session = undefined;
      current = undefined;
      lastQueued = undefined;
    },
    currentChapterId: (): number | undefined => current?.id,
    onChapterChanged(cb: (chapterId: number) => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
};

export const listenQueue = createListenQueue({
  getNextChapter: (chapter, excludedScanlators) =>
    getNextChapter(
      chapter.novelId,
      chapter.position ?? 0,
      chapter.page ?? '',
      excludedScanlators,
    ),
  getChapter,
  loadChapterHtml: (novel, chapter) => loadChapterHtml(novel, chapter),
  markChapterRead,
  updateChapterProgress,
});
