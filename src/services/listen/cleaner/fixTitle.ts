import { Detector, fold, mergeSpans, type Span } from './detector';

const TITLE_JUNK_RE =
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f"\u201c\u201d\u201e\u201f\u00ab\u00bb<>|*\\^`~\u200b-\u200f\u2060\ufeff\u00ad]/g;
const DOUBLE_NUM_RE =
  /^(?:chapter|ch\.?)\s*(\d+)\s*(?:[:\-–—.]\s*)+(?:chapter|ch\.?)?\s*(\d+(?:\.\d+)?)(?:\s*[:\-–—.]+\s*(.*))?$/i;
const NUM_DASH_RE = /^((?:chapter|ch\.?)\s*\d+(?:\.\d+)?)\s*[–—-]\s+/i;

/**
 * Cleans a chapter title for TTS, a port of epub_cleaner.fix_title:
 * strips watermarks and characters engines read aloud, and collapses the
 * double numbering scrapers add ("Chapter 95: Chapter 94: Eighth Realm" →
 * "Chapter 94: Eighth Realm").
 */
export const fixTitle = (
  title: string,
  collapse = true,
  det?: Detector,
): string => {
  let t = title ?? '';
  if (det) {
    const folded = fold(t);
    const spans = mergeSpans(
      det.inlineSpans(folded).map(([a, b]) => [a, b] as Span),
    );
    for (const [a, b] of [...spans].reverse()) {
      t = `${t.slice(0, a)} ${t.slice(b)}`;
    }
  }
  t = t.replace(TITLE_JUNK_RE, '');
  t = t.replace(/\s*&\s*/g, ' and ');
  t = t
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[ \-–—:.,]+|[ \-–—:.,]+$/g, '');
  if (collapse) {
    const m = DOUBLE_NUM_RE.exec(t);
    if (m) {
      const rest = m[3]?.trim();
      t = rest ? `Chapter ${m[2]}: ${rest}` : `Chapter ${m[2]}`;
    }
  }
  t = t.replace(NUM_DASH_RE, (_, head: string) => `${head}: `);
  return t.trim();
};
