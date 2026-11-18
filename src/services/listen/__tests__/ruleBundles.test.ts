import {
  combineSimilarRules,
  compileSpeechRules,
  DEFAULT_SPEECH_RULE_SETTINGS,
  ruleRegex,
  type SpeechRule,
} from '../speechRules';

const speak = (rules: SpeechRule[], text: string) =>
  compileSpeechRules({ ...DEFAULT_SPEECH_RULE_SETTINGS, rules })(text).text;

describe('rules with several phrases', () => {
  it('applies every line of a rule', () => {
    const rule = { id: 'a', find: 'Read at foo\n\n  Visit bar  ', replace: '' };
    expect(speak([rule], 'One. Read at foo two. Visit bar three.')).toBe(
      'One. two. three.',
    );
  });

  it('keeps whole-word matching per phrase', () => {
    const rule = { id: 'a', find: 'cat\ndog', replace: 'pet', wholeWord: true };
    expect(speak([rule], 'cat dog catalog')).toBe('pet pet catalog');
  });

  it('joins regex lines and keeps groups for a single regex', () => {
    const many = ruleRegex({
      id: 'a',
      find: 'a+\nb+',
      replace: '',
      regex: true,
    });
    expect('xaabbx'.replace(many!, '')).toBe('xx');
    const one = ruleRegex({
      id: 'b',
      find: '([0-9]+)',
      replace: '',
      regex: true,
    });
    expect('n 42'.replace(one!, '#$1')).toBe('n #42');
  });

  it('ignores a rule with only blank lines', () => {
    expect(ruleRegex({ id: 'a', find: ' \n ', replace: '' })).toBeNull();
  });
});

describe('combineSimilarRules', () => {
  it('bundles rules with the same replacement and switches', () => {
    const rules: SpeechRule[] = [
      { id: '1', find: 'foo', replace: '' },
      { id: '2', find: 'Mr', replace: 'Mister' },
      { id: '3', find: 'bar\nfoo', replace: '' },
      { id: '4', find: 'baz', replace: '', onPage: true },
    ];
    expect(combineSimilarRules(rules)).toEqual([
      { id: '1', find: 'foo\nbar', replace: '' },
      { id: '2', find: 'Mr', replace: 'Mister' },
      { id: '4', find: 'baz', replace: '', onPage: true },
    ]);
  });
});
