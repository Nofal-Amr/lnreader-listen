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

// Abbreviations whose full stop the engine needs ("Mr." is read "Mister").
const ABBREVIATION =
  /(?:^|[\s("'“‘])(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Gen|Capt|Lt|Col|Sgt|vs|etc|No|Vol|Ch|e\.g|i\.e)$/i;

/**
 * Engines pause after every full stop on their own, even with the sentence
 * pause at 0 s. A semicolon gets a shorter stop with a similar falling tone,
 * so mid-paragraph full stops are swapped for one ("?" and "!" are kept).
 */
export const shortenFullStops = (text: string): string =>
  text.replace(
    /(?<![.\d])\.(?![.\d])(?=["'”’)\]]*\s+\S)/g,
    (stop, offset: number, all: string) =>
      ABBREVIATION.test(all.slice(Math.max(0, offset - 6), offset))
        ? stop
        : ';',
  );

/**
 * Reader paragraphs → native TTS paragraphs: speaking rules applied, clause
 * breaks computed. Indices are preserved (blank entries stay) so the reader
 * highlight matches the native queue.
 */
export const toTtsParagraphs = (texts: string[]): TtsParagraph[] => {
  const speak = getSpeechTransform();
  const shortStops = readTts()?.shortFullStops === true;
  return dropRepeats(texts).map((raw, index) => {
    const { text, pauseMs } = speak(raw);
    return {
      id: String(index),
      // Same length, so the breaks (found on the real text) still line up.
      text: shortStops ? shortenFullStops(text) : text,
      breaks: computeBreaks(text),
      ...(pauseMs ? { pauseMs } : {}),
    };
  });
};

/** True when at least one paragraph will actually be spoken. */
export const hasSpeech = (paragraphs: TtsParagraph[]) =>
  paragraphs.some(p => p.text.trim().length > 0);
