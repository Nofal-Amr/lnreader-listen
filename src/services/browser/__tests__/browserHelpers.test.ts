import { findParagraphIndex, paragraphKey } from '../pageScript';
import { toUrl } from '../browserStore';

describe('paragraph matching between page and player', () => {
  const paragraphs = [
    'Chapter 94: Eighth Realm',
    'Lin Feng opened his eyes and looked at the sky.',
    '“Good morning, brother!” an annoyingly cheerful voice said.',
  ];

  it('ignores case, punctuation and quote differences', () => {
    expect(
      findParagraphIndex(
        paragraphs,
        '"Good morning, brother!"  an annoyingly cheerful voice said.',
      ),
    ).toBe(2);
    expect(findParagraphIndex(paragraphs, 'lin feng opened his eyes')).toBe(1);
  });

  it('finds a selection made in the middle of a paragraph', () => {
    expect(findParagraphIndex(paragraphs, 'looked at the sky')).toBe(1);
  });

  it('returns -1 for unknown or empty text', () => {
    expect(findParagraphIndex(paragraphs, 'Comments (12)')).toBe(-1);
    expect(findParagraphIndex(paragraphs, '  ')).toBe(-1);
  });

  it('builds the same key the page script does', () => {
    expect(paragraphKey('Hello, World! 42')).toBe('helloworld42');
  });
});

describe('toUrl', () => {
  it('keeps URLs, adds https to domains, searches anything else', () => {
    expect(toUrl('https://a.com/x')).toBe('https://a.com/x');
    expect(toUrl('freewebnovel.com/novel/x')).toBe(
      'https://freewebnovel.com/novel/x',
    );
    expect(toUrl('stealing immortal')).toBe(
      'https://www.google.com/search?q=stealing%20immortal',
    );
  });
});
