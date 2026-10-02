import {
  Detector,
  countWords,
  fold,
  hasWord,
  mergeSpans,
  splitSentences,
  widen,
  type ReasonSpan,
  type Span,
} from './detector';

export type ParagraphVerdict =
  | { action: 'keep' }
  | { action: 'remove'; reason: string }
  | { action: 'edit'; spans: Span[]; reasons: string[] };

/**
 * Decides what to do with one leaf paragraph: keep it, remove it, or cut
 * watermark spans out of it. Port of DocCleaner._process_leaf (minus links,
 * which only exist in HTML and are handled by the HTML cleaner).
 */
export const judgeParagraph = (
  det: Detector,
  raw: string,
  heading = false,
): ParagraphVerdict => {
  if (!raw.trim()) return { action: 'keep' };
  const text = fold(raw);

  const reason = det.classifyParagraph(text);
  if (reason) return { action: 'remove', reason };

  const dels: ReasonSpan[] = [];
  for (const [s, e] of splitSentences(text)) {
    const sent = text.slice(s, e);
    const inl = det.inlineSpans(sent);
    if (inl.length) {
      // Cut embedded watermarks first, then judge what is left, so real story
      // text that merely contains a watermark is never thrown away.
      let rest = sent;
      for (const [a, b] of inl) {
        rest = rest.slice(0, a) + '\x00'.repeat(b - a) + rest.slice(b);
      }
      for (const m of rest.matchAll(det.leftoverWrapRe)) {
        const a = m.index ?? 0;
        const b = a + m[0].length;
        inl.push([a, b, 'empty_wrapper']);
        rest = rest.slice(0, a) + '\x00'.repeat(b - a) + rest.slice(b);
      }
      const cleaned = rest.replace(/\x00/g, ' ');
      // App addition: "Source: .com, updated by <site>" leaves a few orphaned
      // words once the site is cut; a sentence that was mostly a site link goes.
      const cutSite = inl.some(([, , why]) => why === 'site_url');
      if (
        !hasWord(cleaned) ||
        (cutSite && (countWords(cleaned) <= 4 || det.isPromoRemainder(cleaned)))
      ) {
        dels.push([s, e, inl[0][2]]);
        continue;
      }
      const r = det.classifySentence(cleaned, heading);
      if (r) {
        dels.push([s, e, r]);
      } else {
        for (const [a, b, why] of inl) dels.push([s + a, s + b, why]);
      }
      continue;
    }
    const r = det.classifySentence(sent, heading);
    if (r) dels.push([s, e, r]);
  }
  if (!dels.length) return { action: 'keep' };

  const merged = mergeSpans(dels.map(([s, e]) => [s, e] as Span));
  let left = '';
  let pos = 0;
  for (const [s, e] of merged) {
    left += text.slice(pos, s);
    pos = e;
  }
  left = (left + text.slice(pos)).trim();
  const reasons = dels.map(([, , why]) => why);
  const orphanLabel =
    reasons.some(w => w === 'site_url' || w === 'bracketed_site') &&
    /^\W*(?:\w+\s?){1,4}:\W*$/.test(left);
  if (!hasWord(left) || orphanLabel) {
    return { action: 'remove', reason: reasons[0] };
  }
  return {
    action: 'edit',
    spans: mergeSpans(merged.map(([s, e]) => widen(text, s, e))),
    reasons,
  };
};

/** Applies a verdict to plain text: '' when removed. */
export const applyVerdict = (
  raw: string,
  verdict: ParagraphVerdict,
): string => {
  if (verdict.action === 'keep') return raw;
  if (verdict.action === 'remove') return '';
  let out = '';
  let pos = 0;
  for (const [s, e] of verdict.spans) {
    out += raw.slice(pos, s);
    pos = e;
  }
  return (out + raw.slice(pos)).replace(/[ \t]{2,}/g, ' ').trim();
};

/** Convenience: clean one paragraph of plain text. */
export const cleanParagraphText = (
  det: Detector,
  raw: string,
  heading = false,
): string => applyVerdict(raw, judgeParagraph(det, raw, heading));
