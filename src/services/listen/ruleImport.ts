import type { SpeechRule } from './speechRules';

let counter = 0;
const newId = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

const QUOTE = '["“”]';
const REMOVE_RE = new RegExp(
  `^remove\\s+${QUOTE}([\\s\\S]*)${QUOTE}\\s*$`,
  'i',
);
const REPLACE_RE = new RegExp(
  `^replace\\s+${QUOTE}([\\s\\S]*?)${QUOTE}\\s+(?:to|with|by)\\s+${QUOTE}([\\s\\S]*)${QUOTE}\\s*$`,
  'i',
);

/**
 * Reads rules pasted by the user: a JSON export from this app, or one rule per
 * line written like T2S shows them (`Remove "…"`, `Replace "…" to "…"`), or a
 * bare phrase (removed).
 */
export const parseRules = (input: string): SpeechRule[] => {
  const text = input.trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as Partial<SpeechRule>[];
      return parsed
        .filter(r => typeof r.find === 'string' && r.find.length > 0)
        .map(r => ({
          id: newId(),
          find: r.find as string,
          replace: typeof r.replace === 'string' ? r.replace : '',
          regex: !!r.regex,
          matchCase: !!r.matchCase,
          wholeWord: !!r.wholeWord,
          enabled: r.enabled !== false,
        }));
    } catch {
      // Not JSON after all: fall through to line parsing.
    }
  }
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const replace = REPLACE_RE.exec(line);
      if (replace) {
        return { id: newId(), find: replace[1], replace: replace[2] };
      }
      const remove = REMOVE_RE.exec(line);
      return { id: newId(), find: remove ? remove[1] : line, replace: '' };
    });
};

/** JSON for sharing or backing up rules. */
export const exportRules = (rules: SpeechRule[]): string =>
  JSON.stringify(
    rules.map(({ id: _id, ...rest }) => rest),
    null,
    2,
  );
