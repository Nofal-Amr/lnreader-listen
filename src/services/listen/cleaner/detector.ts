import {
  BRAND_TLD,
  CONTEXT_RE_SRC,
  GENERIC_TLD,
  META_RE_SRC,
  NAVIGATION_PATTERNS,
  PARAGRAPH_PATTERNS,
  PIRACY_WORDS,
  PROTECTED_PATTERNS,
  SENSITIVITY_PRESETS,
  SENTENCE_PATTERNS,
  SITE_NAMES,
  SUPPORT_HOSTS,
  type Sensitivity,
} from './patterns';

export type Span = [number, number];
export type ReasonSpan = [number, number, string];

const CONFUSABLES: Record<string, string> = {
  '\u0430': 'a',
  '\u0435': 'e',
  '\u043e': 'o',
  '\u0440': 'p',
  '\u0441': 'c',
  '\u0443': 'y',
  '\u0445': 'x',
  '\u0456': 'i',
  '\u0458': 'j',
  '\u0455': 's',
  '\u04bb': 'h',
  '\u03bf': 'o',
  '\u03bd': 'v',
  '\u03b9': 'i',
  '\u03ba': 'k',
  '\u0391': 'A',
  '\u0392': 'B',
  '\u0395': 'E',
  '\u0399': 'I',
  '\u039a': 'K',
  '\u039c': 'M',
  '\u039d': 'N',
  '\u039f': 'O',
  '\u03a1': 'P',
  '\u03a4': 'T',
  '\u03a7': 'X',
  '\u03a5': 'Y',
  '\u0396': 'Z',
  '\u0410': 'A',
  '\u0412': 'B',
  '\u0415': 'E',
  '\u041a': 'K',
  '\u041c': 'M',
  '\u041d': 'H',
  '\u041e': 'O',
  '\u0420': 'P',
  '\u0421': 'C',
  '\u0422': 'T',
  '\u0425': 'X',
};
// Small capitals and other look-alikes sites use to hide their name from
// cleaners (e.g. "ɴᴏᴠᴇʟɪɢʜᴛ"); NFKC does not fold these.
const EXTRA_LOOKALIKES: [number, string][] = [
  [0x1d00, 'a'],
  [0x0299, 'b'],
  [0x1d04, 'c'],
  [0x1d05, 'd'],
  [0x1d07, 'e'],
  [0x0493, 'f'],
  [0x0262, 'g'],
  [0x029c, 'h'],
  [0x026a, 'i'],
  [0x1d0a, 'j'],
  [0x1d0b, 'k'],
  [0x029f, 'l'],
  [0x1d0d, 'm'],
  [0x0274, 'n'],
  [0x1d0f, 'o'],
  [0x1d18, 'p'],
  [0x0280, 'r'],
  [0xa731, 's'],
  [0x1d1b, 't'],
  [0x1d1c, 'u'],
  [0x1d20, 'v'],
  [0x1d21, 'w'],
  [0x028f, 'y'],
  [0x1d22, 'z'],
  [0x04cf, 'l'],
  [0x04c0, 'l'],
  [0x01c0, 'l'],
  [0x0131, 'i'],
  [0x0269, 'i'],
  [0x0456, 'i'],
  [0x0458, 'j'],
  [0x0501, 'd'],
  [0x051b, 'q'],
  [0x051d, 'w'],
  [0x03f2, 'c'],
  [0x0261, 'g'],
  [0x0251, 'a'],
  [0x00f8, 'o'],
  [0x0275, 'o'],
];
for (const [code, latin] of EXTRA_LOOKALIKES) {
  CONFUSABLES[String.fromCharCode(code)] = latin;
}

// Invisible characters inserted inside names (zero-width space/joiners, BOM,
// soft hyphen, word joiner, Mongolian vowel separator).
export const INVISIBLE_RE = new RegExp(
  '[' +
    [
      0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0x2061, 0x2062, 0x2063,
      0x2064, 0xfeff, 0x00ad, 0x180e,
    ]
      .map(c => String.fromCharCode(c))
      .join('') +
    ']',
  'g',
);

const foldCache = new Map<string, string>();

/** Length-preserving normalisation: fullwidth → ASCII, look-alike letters → Latin. */
export const fold = (text: string): string => {
  let out = '';
  for (const ch of text) {
    if (ch < '\u0080') {
      out += ch;
      continue;
    }
    let r = foldCache.get(ch);
    if (r === undefined) {
      const n = ch.normalize('NFKC');
      r = n.length === ch.length ? n : ch;
      r = CONFUSABLES[r] ?? r;
      foldCache.set(ch, r);
    }
    out += r;
  }
  return out;
};

const WORD_RE = /[A-Za-z0-9À-ɏ]+(?:['’][A-Za-z0-9À-ɏ]+)?/g;
export const countWords = (s: string): number => s.match(WORD_RE)?.length ?? 0;

const HAS_WORD = /[A-Za-z0-9À-ɏ]/;
export const hasWord = (s: string): boolean => HAS_WORD.test(s);

const SENT_END = /[.!?…]+["'”’)\]*_]*(?=\s|$)|\n+/g;
export const splitSentences = (text: string): Span[] => {
  const out: Span[] = [];
  let pos = 0;
  for (const m of text.matchAll(SENT_END)) {
    const start = m.index ?? 0;
    let end: number;
    let next: number;
    if (text[start] === '\n') {
      end = start;
      next = start + m[0].length;
    } else {
      end = next = start + m[0].length;
    }
    if (end > pos) out.push([pos, end]);
    pos = next;
  }
  if (pos < text.length) out.push([pos, text.length]);
  return out;
};

const SPACED_RUN =
  /(?<![A-Za-z0-9])(?:[A-Za-z0-9][ \t._\-*·•]{1,2}){3,}[A-Za-z0-9](?![A-Za-z0-9])/g;
export const deobfuscate = (t: string, dropDots: boolean): string => {
  const strip = dropDots ? /[ \t_\-*·•.]/g : /[ \t_\-*·•]/g;
  return t.replace(SPACED_RUN, m => m.replace(strip, ''));
};

export const isDialogue = (t: string): boolean => {
  const s = t.trim().replace(/^[*_~\-–—… ]+/, '');
  return !!s && '"“«„「『‘\''.includes(s[0]);
};

const TITLE_RE =
  /^\W*(?:chapter|ch\.?|episode|ep\.?|part|prologue|epilogue|volume|vol\.?|book|interlude|extra|side\s+story)\b|^\W*\d+\s*[.:)\-]/i;
export const looksLikeTitle = (t: string): boolean => TITLE_RE.test(t);

export const mergeSpans = (spans: Span[]): Span[] => {
  const out: Span[] = [];
  for (const [s, e] of [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
};

/** Grows a deletion span over neighbouring blanks so no double spaces are left. */
export const widen = (text: string, s: number, e: number): Span => {
  const n = text.length;
  let e2 = e;
  while (e2 < n && ' \t\u00a0'.includes(text[e2])) e2 += 1;
  if (e2 > e && (s === 0 || ' \t\u00a0\n'.includes(text[s - 1]))) {
    return [s, e2];
  }
  if (e2 === n) {
    let s2 = s;
    while (s2 > 0 && ' \t\u00a0'.includes(text[s2 - 1])) s2 -= 1;
    return [s2, e2];
  }
  return [s, e];
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const brandPattern = (name: string) =>
  name.split(/\s+/).filter(Boolean).map(escapeRe).join('[\\s._-]?');

const compile = (src: string, flags = 'i'): RegExp | null => {
  try {
    return new RegExp(src, flags);
  } catch {
    return null;
  }
};

const withGlobal = (re: RegExp) =>
  new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);

export type DetectorOptions = {
  sensitivity?: Sensitivity;
  extraSites?: string[];
  stripNavigation?: boolean;
};

/**
 * Regex + heuristic watermark detector, a port of epub_cleaner.py's Detector.
 * Python's case-sensitive TLD groups `(?-i:…)` have no JS equivalent, so brand
 * TLDs are matched case-sensitively with a separate sticky regex instead.
 */
export class Detector {
  private shortWords: number;
  private ctxHits: number;
  private heuristic: boolean;
  private heurHits: number;
  private brandCoreRe: RegExp;
  private brandTailRe: RegExp;
  readonly urlRe: RegExp;
  readonly domainRe: RegExp;
  private bracketRe: RegExp;
  private wrapRe: RegExp;
  private decoRe: RegExp;
  readonly leftoverWrapRe: RegExp;
  private suffixRe: RegExp;
  private prefixRe: RegExp;
  private promoParenRe: RegExp;
  private pairedDecoRe: RegExp | null;
  private sentenceRx: [string, RegExp][] = [];
  private paraRx: [string, RegExp][] = [];
  private protectedRx: RegExp[];
  private anchorRe: RegExp;
  private metaRe: RegExp;
  private contextRe: RegExp;

  constructor(options: DetectorOptions = {}) {
    const preset = SENSITIVITY_PRESETS[options.sensitivity ?? 'normal'];
    this.shortWords = preset.shortWords;
    this.ctxHits = preset.ctxHits;
    this.heuristic = preset.heuristic;
    this.heurHits = preset.heurHits;

    const names = [...SITE_NAMES, ...(options.extraSites ?? [])].filter(n =>
      n.trim(),
    );
    const core = [...new Set(names.map(brandPattern))]
      .sort((a, b) => b.length - a.length)
      .join('|');
    this.brandCoreRe = new RegExp(
      `(?<![A-Za-z0-9])(?:${core})(?![A-Za-z0-9])`,
      'gi',
    );
    this.brandTailRe = new RegExp(
      `\\.${BRAND_TLD}(?:/[^\\s"'<>)\\]]*)?(?![A-Za-z0-9])`,
      'y',
    );
    this.urlRe = /(?:https?:\/\/|www\.)[^\s<>"']*[^\s<>"'.,;:!?)\]]/gi;
    this.domainRe = new RegExp(
      `(?<![\\w@./-])(?:[A-Za-z0-9][A-Za-z0-9-]{1,60}\\.)+${GENERIC_TLD}(?![\\w-])(?:/[^\\s<>"']*)?`,
      'g',
    );
    const genericTok = `(?:(?:https?://|www\\.)[^\\s\\]\\)\\}>]+|(?:[A-Za-z0-9][A-Za-z0-9-]{1,60}\\.)+${GENERIC_TLD}(?![\\w-]))`;
    const open = '[\\[\\(\\{<【《「『（]';
    const close = '[\\]\\)\\}>】》」』）]';
    const notClose = '[^\\]\\)\\}>】》」』）\\n]';
    const tok = `(?:(?<![A-Za-z0-9])(?:${core})(?![A-Za-z0-9])|${genericTok})`;
    this.bracketRe = new RegExp(
      `${open}${notClose}{0,100}?${tok}${notClose}{0,100}?${close}`,
      'gi',
    );
    this.wrapRe = new RegExp(
      `([*_~#]{1,3})\\s*(?:${core})(?:\\.${BRAND_TLD})?\\s*\\1`,
      'gi',
    );
    const sym = '[^\\w\\s.,;:!?\'"‘’“”()\\[\\]{}—–\\-]';
    const o = '\\[\\(\\{<«‹〔【《「『（';
    const c = '\\]\\)\\}>»›〕】》」』）';
    const sy = '[^\\w\\s\\x00.,;:!?\'"‘’“”()\\[\\]{}—–\\-]';
    this.leftoverWrapRe = new RegExp(
      `(?:[${o}]|${sy})+[ \\x00]*\\x00[ \\x00]*(?:[${c}]|${sy})+`,
      'g',
    );
    this.decoRe = new RegExp(
      `${sym}+\\s*(?:${core})(?:\\.${BRAND_TLD})?\\s*${sym}+`,
      'gi',
    );
    const brandFull = `(?<![A-Za-z0-9])(?:${core})(?:\\.${BRAND_TLD})?`;
    this.suffixRe = new RegExp(
      `\\s*[-–—|:•·~/]+\\s*${brandFull}\\s*[.!]?\\s*$`,
      'i',
    );
    this.prefixRe = new RegExp(`^\\s*${brandFull}\\s*[-–—|:•·~/]+\\s*`, 'i');
    // "➤ Novelight ➤", "◆ SiteName ◆": one token wrapped in the same
    // decorative symbol is a watermark whatever the name (normal and high).
    this.pairedDecoRe =
      (options.sensitivity ?? 'normal') === 'low'
        ? null
        : /([➤►▶▸➜➔➣➢→⇒◆◇♦❖■□▪●○•◉★☆✦✧✪⋆✿❀♠♣♥♡⚜※])\s*[^\s]{2,25}\s*\1/g;
    this.promoParenRe =
      /[([]\s*(?:only\s+on\b|read\s+(?:the\s+)?(?:full|more|latest)\b|source\s*:|visit\b|available\s+(?:on|at)\b)[^)\]\n]{0,60}[)\]]/gi;

    for (const [cat, pats] of Object.entries(SENTENCE_PATTERNS)) {
      for (const pat of pats) {
        const rx = compile(pat);
        if (rx) this.sentenceRx.push([cat, rx]);
      }
    }
    for (const [cat, pats] of Object.entries(PARAGRAPH_PATTERNS)) {
      for (const pat of pats) {
        const rx = compile(pat);
        if (rx) this.paraRx.push([cat, rx]);
      }
    }
    if (options.stripNavigation !== false) {
      for (const pat of NAVIGATION_PATTERNS) {
        const rx = compile(pat);
        if (rx) this.paraRx.push(['navigation', rx]);
      }
    }
    this.protectedRx = PROTECTED_PATTERNS.map(p => compile(p)).filter(
      (r): r is RegExp => !!r,
    );
    this.anchorRe = new RegExp(PIRACY_WORDS, 'i');
    this.metaRe = new RegExp(META_RE_SRC, 'i');
    this.contextRe = new RegExp(CONTEXT_RE_SRC, 'gi');
  }

  /** Site names, URLs and bare domains in `text`, merged when overlapping. */
  siteTokens(text: string): ReasonSpan[] {
    const found: ReasonSpan[] = [];
    for (const m of text.matchAll(this.brandCoreRe)) {
      const start = m.index ?? 0;
      let end = start + m[0].length;
      this.brandTailRe.lastIndex = end;
      const tail = this.brandTailRe.exec(text);
      if (tail) end += tail[0].length;
      found.push([start, end, 'brand']);
    }
    for (const m of text.matchAll(this.urlRe)) {
      found.push([m.index ?? 0, (m.index ?? 0) + m[0].length, 'url']);
    }
    for (const m of text.matchAll(this.domainRe)) {
      found.push([m.index ?? 0, (m.index ?? 0) + m[0].length, 'domain']);
    }
    found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged: ReasonSpan[] = [];
    for (const [s, e, k] of found) {
      const last = merged[merged.length - 1];
      if (last && s < last[1]) {
        last[1] = Math.max(last[1], e);
        if (k === 'brand') last[2] = 'brand';
      } else {
        merged.push([s, e, k]);
      }
    }
    return merged;
  }

  isSiteHost(host: string): boolean {
    const h = host.toLowerCase();
    this.brandCoreRe.lastIndex = 0;
    return (
      new RegExp(this.brandCoreRe.source, 'i').test(h) ||
      SUPPORT_HOSTS.some(s => h === s || h.endsWith(`.${s}`))
    );
  }

  private variants(t: string): string[] {
    const v = [t];
    for (const drop of [false, true]) {
      const d = deobfuscate(t, drop);
      if (d !== t && !v.includes(d)) v.push(d);
    }
    return v;
  }

  private contextCount(t: string): number {
    const seen = new Set<string>();
    for (const m of t.matchAll(this.contextRe)) seen.add(m[0].toLowerCase());
    return seen.size;
  }

  /**
   * App addition: what is left of a sentence after cutting a site link reads
   * like promo ("Visit  for the latest chapters.") rather than story.
   */
  isPromoRemainder(text: string): boolean {
    return (
      countWords(text) <= this.shortWords &&
      this.contextCount(text) >= Math.max(2, this.ctxHits)
    );
  }

  classifySentence(sentence: string, heading = false): string | null {
    const t = sentence.trim();
    if (!t || !/\w/.test(t)) return null;
    if (this.protectedRx.some(rx => rx.test(t))) return null;
    const title = heading || looksLikeTitle(t);
    for (const variant of this.variants(t)) {
      const r = this.classifyOne(variant, title);
      if (r) return r;
    }
    return null;
  }

  private classifyOne(t: string, title: boolean): string | null {
    const dialog = isDialogue(t);
    const bracketed = [this.bracketRe, this.wrapRe, this.decoRe].some(rx => {
      rx.lastIndex = 0;
      return rx.test(t);
    });
    const toks = this.siteTokens(t);
    const words = countWords(t);
    for (const [cat, rx] of this.sentenceRx) {
      if (rx.test(t)) {
        if (dialog && !(toks.length || this.anchorRe.test(t))) continue;
        return cat;
      }
    }
    if (toks.length) {
      let rest = t;
      for (const [s, e] of [...toks].sort((a, b) => b[0] - a[0])) {
        rest = `${rest.slice(0, s)} ${rest.slice(e)}`;
      }
      const resid = countWords(rest);
      if (resid === 0) return 'site_only';
      if (!title) {
        const ctx = this.contextCount(t);
        if (toks.some(([, , k]) => k === 'brand')) {
          if (resid <= this.shortWords && !(bracketed && resid > 4)) {
            return 'site_short';
          }
          if (words <= 45 && !dialog && ctx >= this.ctxHits) {
            return 'site_context';
          }
        } else {
          if (resid <= 4) return 'url_short';
          if (words <= 30 && !dialog && ctx >= Math.max(2, this.ctxHits)) {
            return 'url_context';
          }
        }
      }
    }
    if (this.heuristic && !dialog && words <= 45) {
      if (this.anchorRe.test(t) && this.metaRe.test(t)) {
        if (this.contextCount(t) >= this.heurHits) return 'heuristic_piracy';
      }
    }
    return null;
  }

  classifyParagraph(text: string): string | null {
    const t = text.trim();
    if (!t || isDialogue(t) || countWords(t) > 25) return null;
    if (this.protectedRx.some(rx => rx.test(t))) return null;
    for (const [cat, rx] of this.paraRx) {
      if (rx.test(t)) return cat;
    }
    return null;
  }

  /** Watermark fragments embedded inside an otherwise legitimate sentence. */
  inlineSpans(sentence: string): ReasonSpan[] {
    const out: ReasonSpan[] = [];
    const push = (re: RegExp, why: string) => {
      for (const m of sentence.matchAll(withGlobal(re))) {
        out.push([m.index ?? 0, (m.index ?? 0) + m[0].length, why]);
      }
    };
    push(this.promoParenRe, 'promo_paren');
    if (this.pairedDecoRe) push(this.pairedDecoRe, 'bracketed_site');
    push(this.bracketRe, 'bracketed_site');
    push(this.wrapRe, 'bracketed_site');
    push(this.decoRe, 'bracketed_site');
    for (const m of sentence.matchAll(SPACED_RUN)) {
      const d = deobfuscate(m[0], true);
      const full = new RegExp(`^(?:${this.brandCoreRe.source})$`, 'i');
      if (full.test(d)) {
        out.push([
          m.index ?? 0,
          (m.index ?? 0) + m[0].length,
          'obfuscated_site',
        ]);
      }
    }
    for (const [s, e, kind] of this.siteTokens(sentence)) {
      const tok = sentence.slice(s, e);
      if (
        kind === 'url' ||
        (kind === 'brand' && /\.[A-Za-z]{2,}|\//.test(tok))
      ) {
        out.push([s, e, 'site_url']);
      }
    }
    for (const rx of [this.suffixRe, this.prefixRe]) {
      const m = rx.exec(sentence);
      if (m) out.push([m.index, m.index + m[0].length, 'site_tag']);
    }
    return out;
  }
}
