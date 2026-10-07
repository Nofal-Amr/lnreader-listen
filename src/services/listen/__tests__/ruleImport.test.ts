import { exportRules, parseRules } from '../ruleImport';

const strip = (rules: ReturnType<typeof parseRules>) =>
  rules.map(({ id: _id, ...rest }) => rest);

describe('parseRules', () => {
  it('reads T2S-style lines', () => {
    const input = [
      'Remove "Continue your adventure with .Côm"',
      'Replace " God " to "King"',
      'Remove “Your adventure continues at .Côm”',
      'Some bare phrase',
    ].join('\n');
    expect(strip(parseRules(input))).toEqual([
      { find: 'Continue your adventure with .Côm', replace: '' },
      { find: ' God ', replace: 'King' },
      { find: 'Your adventure continues at .Côm', replace: '' },
      { find: 'Some bare phrase', replace: '' },
    ]);
  });

  it('round-trips the JSON export', () => {
    const rules = [
      {
        id: 'x',
        find: 'a',
        replace: 'b',
        regex: true,
        matchCase: false,
        wholeWord: true,
        enabled: false,
        onPage: true,
      },
    ];
    expect(strip(parseRules(exportRules(rules)))).toEqual([
      {
        find: 'a',
        replace: 'b',
        regex: true,
        matchCase: false,
        wholeWord: true,
        enabled: false,
        onPage: true,
      },
    ]);
  });

  it('ignores empty input', () => {
    expect(parseRules('  \n ')).toEqual([]);
  });
});
