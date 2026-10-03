import { create } from 'zustand';

import type {
  TtsPlaybackState,
  TtsProgress,
  TtsSleepTimerState,
} from '@modules/nitro-tts';
import {
  getNextChapter,
  getPrevChapter,
} from '@database/queries/ChapterQueries';
import {
  CHAPTER_READER_SETTINGS,
  type ChapterReaderSettings,
} from '@hooks/persisted/useSettings';
import { getMMKVObject } from '@utils/mmkv/mmkv';

import { fixTitle } from './cleaner/fixTitle';
import { extractTtsParagraphs } from './extractTtsParagraphs';
import {
  listenQueue,
  type ListenChapter,
  type ListenNovel,
} from './ListenQueue';
import { loadChapterHtml } from './loadChapterHtml';
import { getSharedSession, onSharedSession } from './sharedSession';
import { hasSpeech, toTtsParagraphs } from './textPipeline';
import { toNativeTtsSettings } from './ttsSettings';

export type PlayerCommand =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'replay'
  | 'stop';

type PlayerState = {
  state: TtsPlaybackState;
  progress: TtsProgress;
  sleep: TtsSleepTimerState;
  error: string | null;
  novel?: ListenNovel;
  chapter?: ListenChapter;
  /** Text of the current chapter, indexed like the native queue. */
  paragraphs: string[];
  loadingChapter: boolean;
};

const initial: PlayerState = {
  state: 'idle',
  progress: { index: 0, total: 0, paragraphId: '' },
  sleep: {
    active: false,
    mode: 'minutes',
    remainingMs: 0,
    remainingChapters: 0,
  },
  error: null,
  paragraphs: [],
  loadingChapter: false,
};

export const usePlayerStore = create<PlayerState>(() => initial);

onSharedSession(session => {
  session.addOnStateChangedListener(state =>
    usePlayerStore.setState({ state }),
  );
  session.addOnProgressChangedListener(progress =>
    usePlayerStore.setState({ progress }),
  );
  session.addOnErrorListener(error => usePlayerStore.setState({ error }));
  session.addOnSleepTimerChangedListener(sleep =>
    usePlayerStore.setState({ sleep }),
  );
});

listenQueue.onChapterChanged(id => {
  const chapter = listenQueue.currentChapter();
  usePlayerStore.setState(prev => ({
    chapter: chapter?.id === id ? chapter : prev.chapter,
    paragraphs: listenQueue.queuedParagraphs(id) ?? prev.paragraphs,
  }));
});

export { getSharedSession };

/** Records what is playing (called by the reader when it starts TTS). */
export const setNowPlaying = (
  novel: ListenNovel,
  chapter: ListenChapter,
  paragraphs: string[],
) => usePlayerStore.setState({ novel, chapter, paragraphs, error: null });

const readerTts = () =>
  getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS)?.tts;

/**
 * Loads `chapter` straight into the native player (no reader needed) and keeps
 * the following chapter queued, exactly like an auto-advance.
 */
export const playChapter = async (
  novel: ListenNovel,
  chapter: ListenChapter,
  startIndex = 0,
) => {
  usePlayerStore.setState({ loadingChapter: true, error: null });
  try {
    const session = await getSharedSession();
    const texts = extractTtsParagraphs(await loadChapterHtml(novel, chapter));
    const paragraphs = toTtsParagraphs(texts);
    if (!hasSpeech(paragraphs)) {
      throw new Error('This chapter has no readable text.');
    }
    await session.load(
      paragraphs,
      startIndex,
      {
        novelName: novel.name,
        chapterName: fixTitle(chapter.name),
        chapterId: String(chapter.id),
        coverUri: novel.cover || undefined,
      },
      toNativeTtsSettings(readerTts()),
    );
    await session.play();
    setNowPlaying(novel, chapter, texts);
    listenQueue.start(session, novel, chapter);
    listenQueue.announce(chapter.id);
  } catch (cause) {
    usePlayerStore.setState({
      error: cause instanceof Error ? cause.message : String(cause),
    });
  } finally {
    usePlayerStore.setState({ loadingChapter: false });
  }
};

/** Previous / next chapter from the player, independent of the reader. */
export const playAdjacentChapter = async (direction: 'next' | 'prev') => {
  const { novel, chapter } = usePlayerStore.getState();
  if (!novel || !chapter) return;
  const query = direction === 'next' ? getNextChapter : getPrevChapter;
  const target = await query(
    chapter.novelId,
    chapter.position ?? 0,
    chapter.page ?? '',
  );
  if (!target) {
    usePlayerStore.setState({
      error: direction === 'next' ? 'No next chapter.' : 'No previous chapter.',
    });
    return;
  }
  await playChapter(novel, target);
};

export const runPlayerCommand = async (command: PlayerCommand) => {
  const session = await getSharedSession();
  switch (command) {
    case 'play':
      return session.play();
    case 'pause':
      return session.pause();
    case 'next':
      return session.skipNext();
    case 'previous':
      return session.skipPrevious();
    case 'replay':
      return session.replayCurrent();
    case 'stop':
      listenQueue.stop();
      usePlayerStore.setState({
        novel: undefined,
        chapter: undefined,
        paragraphs: [],
      });
      return session.stop();
  }
};

export const seekPlayer = async (index: number) =>
  (await getSharedSession()).seekTo(index);

/** Pushes changed TTS settings (speed, voice…) into the live player. */
export const applyPlayerSettings = async (tts: ChapterReaderSettings['tts']) =>
  (await getSharedSession()).updateSettings(toNativeTtsSettings(tts));

export const isActiveState = (state: TtsPlaybackState) =>
  state === 'playing' || state === 'paused' || state === 'loading';
