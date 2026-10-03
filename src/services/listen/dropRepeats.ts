import { fixTitle } from './cleaner/fixTitle';

const key = (text: string) =>
  fixTitle(text, true)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// The chapter title can only repeat among the opening lines.
const TITLE_ZONE = 4;
const TITLE_MAX_CHARS = 140;

/**
 * Blanks lines that would be read twice: a chapter title repeated in the
 * opening lines (sites often include it again, sometimes hidden, which the
 * voice still reads) and any line repeated back to back. Blank entries keep
 * their index so the reader highlight stays aligned.
 */
export const dropRepeats = (texts: string[]): string[] => {
  const out = [...texts];
  let previousKey = '';
  const openingKeys: string[] = [];
  let seen = 0;
  for (let i = 0; i < out.length; i++) {
    const text = out[i];
    if (!text.trim()) continue;
    const k = key(text);
    if (!k) continue;
    if (k === previousKey) {
      out[i] = '';
      continue;
    }
    if (seen < TITLE_ZONE && text.length <= TITLE_MAX_CHARS) {
      const repeat = openingKeys.some(
        prev =>
          prev === k ||
          (k.length >= 6 && (prev.includes(k) || k.includes(prev))),
      );
      if (repeat) {
        out[i] = '';
        continue;
      }
      openingKeys.push(k);
    }
    previousKey = k;
    seen += 1;
  }
  return out;
};
