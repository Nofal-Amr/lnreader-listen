import {
  compileSpeechRules,
  DEFAULT_SPEECH_RULE_SETTINGS,
  SECTION_BREAK_PAUSE_MS,
  type SpeechRuleSettings,
} from '../speechRules';

const spoken = (text: string, patch: Partial<SpeechRuleSettings> = {}) =>
  compileSpeechRules({ ...DEFAULT_SPEECH_RULE_SETTINGS, ...patch })(text);
const run = (text: string, patch: Partial<SpeechRuleSettings> = {}) =>
  spoken(text, patch).text;

const smile = String.fromCodePoint(0x1f600);
const heart = String.fromCodePoint(0x2764, 0xfe0f);
const family = [0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467]
  .map(c => String.fromCodePoint(c))
  .join('');

describe('speech rules', () => {
  it('removes the phrases carried over from T2S', () => {
    expect(run('He left. Continue your adventure with .Côm')).toBe('He left.');
    expect(run('Your adventure continues at .côm needed text')).toBe(
      'needed text',
    );
  });

  it('skips links, references and symbols engines spell out', () => {
    expect(run('See https://example.com/x now')).toBe('See now');
    expect(run('Visit novelfull.com today')).toBe('Visit today');
    expect(run('Water boils[1] at 100 degrees.')).toBe(
      'Water boils at 100 degrees.',
    );
    expect(run('Wait~ what*')).toBe('Wait what');
    expect(run('So…')).toBe('So...');
  });

  it('drops quotation marks but keeps apostrophes inside words', () => {
    expect(run('“Don’t go,” she said. "It\'s late."')).toBe(
      "Don’t go, she said. It's late.",
    );
    expect(run('"Hi"', { skipQuoteMarks: false })).toBe('"Hi"');
  });

  describe('section breaks', () => {
    const lines = ['* * *', '◇◇◇', '___________', '=========', '"..', '. . .'];

    it('pause by default', () => {
      for (const line of lines) {
        expect(spoken(line)).toEqual({
          text: '',
          pauseMs: SECTION_BREAK_PAUSE_MS,
        });
      }
    });

    it('can be skipped or announced', () => {
      expect(spoken('=====', { sectionBreak: 'skip' })).toEqual({ text: '' });
      expect(spoken('=====', { sectionBreak: 'say' })).toEqual({
        text: 'Section break.',
      });
    });

    it('treats an empty line as nothing, not a break', () => {
      expect(spoken('   ')).toEqual({ text: '' });
    });
  });

  describe('emoji', () => {
    const line = `Great ${smile} job ${heart} team ${family}!`;

    it('removes them by default, including joined sequences', () => {
      expect(run(line)).toBe('Great job team!');
    });

    it('can keep them for the voice to read', () => {
      expect(run(line, { emojiMode: 'keep' })).toBe(line);
    });

    it('can replace them with a word', () => {
      expect(
        run(`Nice ${smile}`, {
          emojiMode: 'replace',
          emojiReplacement: 'smile',
        }),
      ).toBe('Nice smile');
    });

    it('turns an emoji-only line into a section break when removed', () => {
      expect(spoken(`${smile}${smile}`).pauseMs).toBe(SECTION_BREAK_PAUSE_MS);
      expect(spoken(`${smile}`, { emojiMode: 'keep' }).text).toBe(smile);
    });
  });

  it('applies replace rules with whole-word and case options', () => {
    const rules = [
      {
        id: 'a',
        find: 'God',
        replace: 'King',
        wholeWord: true,
        matchCase: true,
      },
    ];
    expect(run('God said; godly gods.', { rules })).toBe(
      'King said; godly gods.',
    );
  });

  it('supports regex rules and ignores invalid ones', () => {
    const rules = [
      { id: 'a', find: '\\(TL: [^)]*\\)', replace: '', regex: true },
      { id: 'b', find: '([', replace: '', regex: true },
    ];
    expect(run('He nodded (TL: meaning yes).', { rules })).toBe('He nodded.');
  });

  it('skips disabled rules', () => {
    const rules = [{ id: 'a', find: 'cat', replace: 'dog', enabled: false }];
    expect(run('a cat', { rules })).toBe('a cat');
  });
});
