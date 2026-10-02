import {
  CHAPTER_READER_SETTINGS,
  type ChapterReaderSettings,
} from '@hooks/persisted/useSettings';
import { getMMKVObject } from '@utils/mmkv/mmkv';

import type { CleanerOptions } from './cleaner/cleanChapterHtml';
import {
  compileSpeechRules,
  DEFAULT_SPEECH_RULE_SETTINGS,
  type SpeechRuleSettings,
} from './speechRules';

export const DEFAULT_CLEANER_OPTIONS: CleanerOptions = {
  sensitivity: 'normal',
  fixTitles: true,
};

const readTts = () =>
  getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS)?.tts;

/** Watermark/title cleaning options, read fresh so settings apply at once. */
export const getCleanerOptions = (): CleanerOptions => ({
  ...DEFAULT_CLEANER_OPTIONS,
  ...readTts()?.cleaner,
});

export const getSpeechRuleSettings = (): SpeechRuleSettings => ({
  ...DEFAULT_SPEECH_RULE_SETTINGS,
  ...readTts()?.speech,
});

let cachedKey = '';
let cachedTransform: (text: string) => string = text => text;

/** The current text → spoken-text transform, recompiled only when rules change. */
export const getSpeechTransform = (): ((text: string) => string) => {
  const settings = getSpeechRuleSettings();
  const key = JSON.stringify(settings);
  if (key !== cachedKey) {
    cachedKey = key;
    cachedTransform = compileSpeechRules(settings);
  }
  return cachedTransform;
};
