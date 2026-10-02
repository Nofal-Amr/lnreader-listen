import type { TtsSettings, TtsSkipUnit } from '@modules/nitro-tts';
import type { ChapterReaderSettings } from '@hooks/persisted/useSettings';

type ReaderTts = ChapterReaderSettings['tts'];

export const TTS_DEFAULTS = {
  pauseCommaMs: 0,
  pauseSentenceMs: 0,
  pauseParagraphMs: 250,
  pauseChapterMs: 800,
  rewindUnit: 'clause' as TtsSkipUnit,
  forwardUnit: 'sentence' as TtsSkipUnit,
  mixWithOthers: false,
  autoPauseMinutes: 0,
};

/** Maps persisted reader TTS settings to what the native player understands. */
export const toNativeTtsSettings = (settings: ReaderTts): TtsSettings => ({
  engineName: settings?.engine?.name,
  voiceIdentifier: settings?.voice?.identifier,
  rate: settings?.rate ?? 1,
  pitch: settings?.pitch ?? 1,
  pauseCommaMs: settings?.pauseCommaMs ?? TTS_DEFAULTS.pauseCommaMs,
  pauseSentenceMs: settings?.pauseSentenceMs ?? TTS_DEFAULTS.pauseSentenceMs,
  pauseParagraphMs: settings?.pauseParagraphMs ?? TTS_DEFAULTS.pauseParagraphMs,
  pauseChapterMs: settings?.pauseChapterMs ?? TTS_DEFAULTS.pauseChapterMs,
  rewindUnit: settings?.rewindUnit ?? TTS_DEFAULTS.rewindUnit,
  forwardUnit: settings?.forwardUnit ?? TTS_DEFAULTS.forwardUnit,
  mixWithOthers: settings?.mixWithOthers ?? TTS_DEFAULTS.mixWithOthers,
  autoPauseMinutes: settings?.autoPauseMinutes ?? TTS_DEFAULTS.autoPauseMinutes,
});

/** True when two persisted TTS settings would behave identically. */
export const areTtsSettingsEqual = (a: ReaderTts, b: ReaderTts): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.autoPageAdvance === b.autoPageAdvance &&
    a.scrollToTop === b.scrollToTop &&
    JSON.stringify(toNativeTtsSettings(a)) ===
      JSON.stringify(toNativeTtsSettings(b))
  );
};
