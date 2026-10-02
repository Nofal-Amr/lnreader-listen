import type { TtsBreak } from '@modules/nitro-tts';

// Terminal punctuation (incl. ellipsis) then optional closing quotes/brackets,
// then whitespace: the next unit starts after the whitespace.
const BREAK = /([.!?…]+|[,;:—–])["'”’)\]»]*(\s+)/gu;

/**
 * Finds clause and sentence boundaries in a paragraph. Native TTS speaks one
 * sentence per utterance (natural prosody) and uses clause offsets to rewind
 * mid-sentence without splitting speech at every comma.
 */
export const computeBreaks = (text: string): TtsBreak[] => {
  const breaks: TtsBreak[] = [];
  for (const match of text.matchAll(BREAK)) {
    const offset = (match.index ?? 0) + match[0].length;
    if (offset >= text.length) continue;
    const kind = /[.!?…]/u.test(match[1]) ? 'sentence' : 'clause';
    breaks.push({ offset, kind });
  }
  return breaks;
};
