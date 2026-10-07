import {
  CHAPTER_READER_SETTINGS,
  type ChapterReaderSettings,
} from '@hooks/persisted/useSettings';
import { getMMKVObject } from '@utils/mmkv/mmkv';

import type { CleanerOptions } from './cleaner/cleanChapterHtml';
import {
  compileSpeechRules,
  DEFAULT_SPEECH_RULE_SETTINGS,
  type SpeechRule,
  type SpeechRuleSettings,
  type SpokenParagraph,
} from './speechRules';
import { computeBreaks } from './computeBreaks';
import { dropRepeats } from './dropRepeats';
import type { TtsParagraph } from '@modules/nitro-tts';

export const DEFAULT_CLEANER_OPTIONS: CleanerOptions = {
  sensitivity: 'normal',
  fixTitles: true,
};

const readTts = () =>
  getMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS)?.tts;

/** Rules switched on for the page text; the rest only change what is read aloud. */
export const pageRules = (rules: SpeechRule[]) =>
  rules.filter(rule => rule.onPage === true && rule.enabled !== false);

/** Watermark/title cleaning options, read fresh so settings apply at once. */
export const getCleanerOptions = (): CleanerOptions => {
  const speech = getSpeechRuleSettings();
  return {
    ...DEFAULT_CLEANER_OPTIONS,
    ...readTts()?.cleaner,
    rules: pageRules(speech.rules),
  };
};

export const getSpeechRuleSettings = (): SpeechRuleSettings => ({
  ...DEFAULT_SPEECH_RULE_SETTINGS,
  ...readTts()?.speech,
});

let cachedKey = '';
let cachedTransform: (text: string) => SpokenParagraph = text => ({ text });

/** The current paragraph → spoken transform, recompiled only when rules change. */
export const getSpeechTransform = (): ((text: string) => SpokenParagraph) => {
  const settings = getSpeechRuleSettings();
  const key = JSON.stringify(settings);
  if (key !== cachedKey) {
    cachedKey = key;
    cachedTransform = compileSpeechRules(settings);
  }
  return cachedTransform;
};

/**
 * Reader paragraphs → native TTS paragraphs: speaking rules applied, clause
 * breaks computed. Indices are preserved (blank entries stay) so the reader
 * highlight matches the native queue.
 */
export const toTtsParagraphs = (texts: string[]): TtsParagraph[] => {
  const speak = getSpeechTransform();
  return dropRepeats(texts).map((raw, index) => {
    const { text, pauseMs } = speak(raw);
    return {
      id: String(index),
      text,
      breaks: computeBreaks(text),
      ...(pauseMs ? { pauseMs } : {}),
    };
  });
};

/** True when at least one paragraph will actually be spoken. */
export const hasSpeech = (paragraphs: TtsParagraph[]) =>
  paragraphs.some(p => p.text.trim().length > 0);
