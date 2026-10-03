import { parseCosmeticRules, parseNetworkHosts } from '../adblock';

jest.mock('@modules/native-file', () => ({
  __esModule: true,
  default: { DocumentDirectoryPath: '/data' },
}));

describe('parseNetworkHosts', () => {
  it('keeps whole-host rules and plain host lines only', () => {
    const list = [
      '! comment',
      '||ads.example.com^',
      '||track.example.net^$third-party',
      '||cdn.example.org/ads/*',
      '||site.com^$domain=other.com',
      '@@||good.com^',
      'plainhost.com',
      '/banner/*',
    ].join('\n');
    expect(parseNetworkHosts(list).sort()).toEqual([
      'ads.example.com',
      'plainhost.com',
      'track.example.net',
    ]);
  });
});

describe('parseCosmeticRules', () => {
  it('splits generic and per-site selectors and skips extended syntax', () => {
    const list = [
      '##.ad-box',
      'freewebnovel.com##.ads-holder',
      'a.com,b.com,~c.com##div[id^="banner"]',
      'x.com#@#.allowed',
      'y.com##div:has-text(Sponsored)',
    ].join('\n');
    expect(parseCosmeticRules(list)).toEqual({
      generic: ['.ad-box'],
      bySite: {
        'freewebnovel.com': ['.ads-holder'],
        'a.com': ['div[id^="banner"]'],
        'b.com': ['div[id^="banner"]'],
      },
    });
  });
});
