import { pageRules } from '../textPipeline';

describe('pageRules', () => {
  const rule = (id: string, extra = {}) => ({
    id,
    find: id,
    replace: '',
    ...extra,
  });

  it('keeps only rules switched on for the page (default: read aloud only)', () => {
    const rules = [
      rule('default'),
      rule('page', { onPage: true }),
      rule('off', { onPage: true, enabled: false }),
    ];
    expect(pageRules(rules).map(r => r.id)).toEqual(['page']);
  });
});
