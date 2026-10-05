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
import { showToast } from '@utils/showToast';

import { fixTitle } from './cleaner/fixTitle';
import { extractTtsParagraphs } from './extractTtsParagraphs';
import {
  listenQueue,
  type ListenChapter,
  type ListenNovel,
} from './ListenQueue';
import { loadChapterHtml } from './loadChapterHtml';
import { getSharedSession, onSharedSession } from './sharedSession';
import { extractWebPage, type WebPage } from '@services/browser/extractWebPage';
import {
  fetchPageHtml,
  hostOf,
  webListenQueue,
} from '@services/browser/webListenQueue';
import { getCleanerOptions, hasSpeech, toTtsParagraphs } from './textPipeline';
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
  /** Where the current audio comes from: the library or a Browser page. */
  source: 'library' | 'web';
  webPage?: WebPage;
  userAgent?: string;
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
  source: 'library',
};

export const usePlayerStore = create<PlayerState>(() => initial);

onSharedSession(session => {
  session.addOnStateChangedListener(state =>
    // A pause reason only stays until playback resumes.
    usePlayerStore.setState(
      state === 'playing' ? { state, error: null } : { state },
    ),
  );
  session.addOnProgressChangedListener(progress =>
    usePlayerStore.setState({ progress }),
  );
  session.addOnErrorListener(error => {
    usePlayerStore.setState({ error });
    // Pause reasons ("headphones disconnected", "another app started
    // playing audio"…) also show as a toast so unexplained pauses are visible.
    showToast(error);
  });
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
) =>
  usePlayerStore.setState({
    novel,
    chapter,
    paragraphs,
    error: null,
    source: 'library',
    webPage: undefined,
  });

const webNowPlaying = (page: WebPage) => ({
  novel: { id: -1, pluginId: 'browser', name: hostOf(page.url), cover: null },
  chapter: {
    id: -1,
    novelId: -1,
    path: page.url,
    name: page.title,
    position: 0,
    page: '1',
  },
  paragraphs: page.paragraphs,
  webPage: page,
  source: 'web' as const,
});

webListenQueue.subscribe(event => {
  if (event.type === 'page') {
    usePlayerStore.setState(webNowPlaying(event.page));
  } else {
    usePlayerStore.setState({ error: event.reason });
  }
});

/** Reads a Browser page aloud from `startIndex`, then follows its next links. */
export const playWebPage = async (
  page: WebPage,
  startIndex = 0,
  userAgent?: string,
) => {
  usePlayerStore.setState({ loadingChapter: true, error: null });
  try {
    const session = await getSharedSession();
    const paragraphs = toTtsParagraphs(page.paragraphs);
    if (!hasSpeech(paragraphs)) {
      throw new Error('No readable text was found on this page.');
    }
    await session.load(
      paragraphs,
      startIndex,
      {
        novelName: hostOf(page.url),
        chapterName: fixTitle(page.title),
        chapterId: page.url,
      },
      toNativeTtsSettings(readerTts()),
    );
    await session.play();
    const agent = userAgent ?? usePlayerStore.getState().userAgent;
    usePlayerStore.setState({ ...webNowPlaying(page), userAgent: agent });
    webListenQueue.start(session, page, agent);
  } catch (cause) {
    usePlayerStore.setState({
      error: cause instanceof Error ? cause.message : String(cause),
    });
  } finally {
    usePlayerStore.setState({ loadingChapter: false });
  }
};

const playWebUrl = async (url: string) => {
  const { userAgent } = usePlayerStore.getState();
  usePlayerStore.setState({ loadingChapter: true });
  try {
    const html = await fetchPageHtml(url, userAgent);
    await playWebPage(extractWebPage(html, url, getCleanerOptions()));
  } catch {
    usePlayerStore.setState({
      loadingChapter: false,
      error: 'That page could not be loaded.',
    });
  }
};

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
  const { novel, chapter, source, webPage } = usePlayerStore.getState();
  if (source === 'web') {
    const url = direction === 'next' ? webPage?.nextUrl : webPage?.prevUrl;
    if (url) {
      await playWebUrl(url);
    } else {
      usePlayerStore.setState({
        error:
          direction === 'next'
            ? 'No next page link was found.'
            : 'No previous page link was found.',
      });
    }
    return;
  }
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
      webListenQueue.stop();
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
