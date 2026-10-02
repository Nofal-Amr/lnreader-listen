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
}

export interface SpeechRuleSettings {
  skipLinks: boolean;
  skipPunctuationNames: boolean;
  skipReferences: boolean;
  skipSeparators: boolean;
  rules: SpeechRule[];
}

/** Phrases carried over from the user's T2S rules. */
export const DEFAULT_SPEECH_RULES: SpeechRule[] = [
  { id: 't2s-1', find: 'Continue your adventure with .Côm', replace: '' },
  { id: 't2s-2', find: 'Source: .com, updated by novlove.com', replace: '' },
  { id: 't2s-3', find: 'Your adventure continues at .Côm', replace: '' },
  {
    id: 't2s-4',
    find: 'Ad Blocker Detected Please disable your ad blocker to support our website and continue enjoying free content.',
    replace: '',
  },
];

export const DEFAULT_SPEECH_RULE_SETTINGS: SpeechRuleSettings = {
  skipLinks: true,
  skipPunctuationNames: true,
  skipReferences: true,
  skipSeparators: true,
  rules: DEFAULT_SPEECH_RULES,
};

const LINK_RE =
  /(?:https?:\/\/|www\.)\S+|(?<![\w@./-])(?:[A-Za-z0-9][A-Za-z0-9-]{1,60}\.)+(?:com|net|org|co|io|me|site|xyz|live|info|club|top|cc|ws|pub|blog|online|vip|app|tv)(?![\w-])(?:\/\S*)?/g;
// Symbols engines spell out ("tilde", "asterisk", "bullet"…).
const SPOKEN_SYMBOLS_RE = /[~*#_|•◆◇♦■□●○★☆※^=+<>]+/g;
const ELLIPSIS_RE = /…|\.{4,}/g;
const REFERENCE_RE = /\[(?:\d+|citation needed|note \d+)\]/gi;
const WORD_RE = /[A-Za-z0-9À-ɏЀ-ӿ؀-ۿ一-鿿]/;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const IS_WORD = /[A-Za-z0-9_]/;

const ruleRegex = (rule: SpeechRule): RegExp | null => {
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

/** Compiles the settings once into a text → text function for TTS. */
export const compileSpeechRules = (
  settings: SpeechRuleSettings,
): ((text: string) => string) => {
  const custom = settings.rules
    .filter(rule => rule.enabled !== false)
    .map(rule => [ruleRegex(rule), rule.replace] as const)
    .filter((pair): pair is [RegExp, string] => pair[0] !== null);

  return (input: string) => {
    let text = input;
    for (const [re, replacement] of custom) {
      text = text.replace(re, replacement);
    }
    if (settings.skipLinks) text = text.replace(LINK_RE, ' ');
    if (settings.skipReferences) text = text.replace(REFERENCE_RE, '');
    if (settings.skipPunctuationNames) {
      text = text.replace(ELLIPSIS_RE, '...').replace(SPOKEN_SYMBOLS_RE, ' ');
    }
    text = text
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .trim();
    if (settings.skipSeparators && !WORD_RE.test(text)) return '';
    return text;
  };
};
