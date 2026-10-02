import {
  compileSpeechRules,
  DEFAULT_SPEECH_RULE_SETTINGS,
  type SpeechRuleSettings,
} from '../speechRules';

const run = (text: string, patch: Partial<SpeechRuleSettings> = {}) =>
  compileSpeechRules({ ...DEFAULT_SPEECH_RULE_SETTINGS, ...patch })(text);

describe('speech rules', () => {
  it('removes the phrases carried over from T2S', () => {
    expect(run('He left. Continue your adventure with .Côm')).toBe('He left.');
    expect(run('Your adventure continues at .côm')).toBe('');
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

  it('drops separator-only paragraphs', () => {
    expect(run('* * *')).toBe('');
    expect(run('◇◇◇')).toBe('');
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
