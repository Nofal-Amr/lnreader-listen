/** One "Remove …" / "Replace … with …" rule, like T2S's Speaking text process. */
export interface SpeechRule {
  id: string;
  find: string;
  /** Empty string removes the match. */
  replace: string;
  regex?: boolean;
  matchCase?: boolean;
  wholeWord?: boolean;
  enabled?: boolean;
  /** Also change the text shown on the page (default: only what is read aloud). */
  onPage?: boolean;
}

/** What to do with emoji: drop them, let the voice read their names, or say a word. */
export type EmojiMode = 'remove' | 'keep' | 'replace';

/** Lines like "_____", "=====", "* * *" or "..": skip, pause, or say "Section break". */
export type SectionBreakMode = 'skip' | 'pause' | 'say';

export interface SpeechRuleSettings {
  skipLinks: boolean;
  skipPunctuationNames: boolean;
  skipReferences: boolean;
  /** Stops engines saying "quote" for quotation marks. */
  skipQuoteMarks: boolean;
  emojiMode: EmojiMode;
  emojiReplacement: string;
  sectionBreak: SectionBreakMode;
  /** Silence for a section break when `sectionBreak` is "pause". */
  sectionBreakPauseMs?: number;
  /** @deprecated Each rule now has its own `onPage` switch. */
  rulesOnPage?: boolean;
  rules: SpeechRule[];
}

/** A paragraph as it will be spoken; `pauseMs` replaces speech for breaks. */
export interface SpokenParagraph {
  text: string;
  pauseMs?: number;
}

export const SECTION_BREAK_PAUSE_MS = 900;
const SECTION_BREAK_WORDS = 'Section break.';

/** Phrases carried over from the user's T2S rules. */
export const DEFAULT_SPEECH_RULES: SpeechRule[] = [
  {
    id: 't2s-1',
    onPage: true,
    find: 'Continue your adventure with .Côm',
    replace: '',
  },
  {
    id: 't2s-2',
    onPage: true,
    find: 'Source: .com, updated by novlove.com',
    replace: '',
  },
  {
    id: 't2s-3',
    onPage: true,
    find: 'Your adventure continues at .Côm',
    replace: '',
  },
  {
    id: 't2s-4',
    find: 'Ad Blocker Detected Please disable your ad blocker to support our website and continue enjoying free content.',
    replace: '',
    onPage: true,
  },
];

export const DEFAULT_SPEECH_RULE_SETTINGS: SpeechRuleSettings = {
  skipLinks: true,
  skipPunctuationNames: true,
  skipReferences: true,
  skipQuoteMarks: true,
  emojiMode: 'remove',
  emojiReplacement: '',
  sectionBreak: 'pause',
  rules: DEFAULT_SPEECH_RULES,
};

const LINK_RE =
  /(?:https?:\/\/|www\.)\S+|(?<![\w@./-])(?:[A-Za-z0-9][A-Za-z0-9-]{1,60}\.)+(?:com|net|org|co|io|me|site|xyz|live|info|club|top|cc|ws|pub|blog|online|vip|app|tv)(?![\w-])(?:\/\S*)?/g;
// Symbols engines spell out ("tilde", "asterisk", "bullet"…).
const SPOKEN_SYMBOLS_RE = /[~*#_|•◆◇♦■□●○★☆※^=+<>]+/g;
const ELLIPSIS_RE = /…|\.{4,}/g;
const REFERENCE_RE = /\[(?:\d+|citation needed|note \d+)\]/gi;
const WORD_RE = /[A-Za-z0-9À-ɏЀ-ӿ؀-ۿ一-鿿]/;
// Double quotes always; single curly/straight quotes only when not an
// apostrophe inside a word (don't, it's).
const QUOTE_RE = /["“”„‟«»]|(?<![A-Za-z])['‘’]|['‘’](?![A-Za-z])/g;

// Built from code points: pictographs, symbols, dingbats, arrows/technical,
// followed by any variation selector (FE0F), zero-width joiner (200D) or
// keycap (20E3) so multi-part emoji collapse into one match.
const cp = (n: number) => String.fromCodePoint(n);
const range = (a: number, b: number) => `${cp(a)}-${cp(b)}`;
const EMOJI_RE = new RegExp(
  `(?:[${range(0x1f000, 0x1faff)}${range(0x2600, 0x27bf)}${range(
    0x2b00,
    0x2bff,
  )}${range(0x2300, 0x23ff)}][${cp(0xfe0f)}${cp(0x200d)}${cp(0x20e3)}]*)+`,
  'gu',
);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const IS_WORD = /[A-Za-z0-9_]/;

export const ruleRegex = (rule: SpeechRule): RegExp | null => {
  const flags = rule.matchCase ? 'g' : 'gi';
  try {
    if (rule.regex) return new RegExp(rule.find, flags);
    const find = rule.find.trim();
    if (!find) return null;
    let src = find.split(/\s+/).map(escapeRe).join('\\s+');
    if (rule.wholeWord) {
      if (IS_WORD.test(find[0])) src = `(?<![A-Za-z0-9_])${src}`;
      if (IS_WORD.test(find[find.length - 1])) src = `${src}(?![A-Za-z0-9_])`;
    }
    return new RegExp(src, flags);
  } catch {
    return null;
  }
};

/** Compiles the settings once into a paragraph → spoken-paragraph function. */
export const compileSpeechRules = (
  settings: SpeechRuleSettings,
): ((text: string) => SpokenParagraph) => {
  const custom = settings.rules
    .filter(rule => rule.enabled !== false)
    .map(rule => [ruleRegex(rule), rule.replace] as const)
    .filter((pair): pair is [RegExp, string] => pair[0] !== null);
  const emojiWord = settings.emojiReplacement.trim();

  return (input: string) => {
    let text = input;
    for (const [re, replacement] of custom) {
      text = text.replace(re, replacement);
    }
    if (settings.emojiMode === 'remove') {
      text = text.replace(EMOJI_RE, ' ');
    } else if (settings.emojiMode === 'replace') {
      text = text.replace(EMOJI_RE, emojiWord ? ` ${emojiWord} ` : ' ');
    }
    if (settings.skipLinks) text = text.replace(LINK_RE, ' ');
    if (settings.skipReferences) text = text.replace(REFERENCE_RE, '');
    if (settings.skipQuoteMarks) text = text.replace(QUOTE_RE, '');
    if (settings.skipPunctuationNames) {
      text = text.replace(ELLIPSIS_RE, '...').replace(SPOKEN_SYMBOLS_RE, ' ');
    }
    text = text
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .trim();
    // Nothing speakable left but the line had content: a section break.
    const keptEmoji = settings.emojiMode === 'keep' && EMOJI_RE.test(text);
    EMOJI_RE.lastIndex = 0;
    if (!WORD_RE.test(text) && !keptEmoji) {
      if (!input.trim()) return { text: '' };
      switch (settings.sectionBreak) {
        case 'say':
          return { text: SECTION_BREAK_WORDS };
        case 'pause':
          return {
            text: '',
            pauseMs: settings.sectionBreakPauseMs ?? SECTION_BREAK_PAUSE_MS,
          };
        default:
          return { text: '' };
      }
    }
    return { text };
  };
};
