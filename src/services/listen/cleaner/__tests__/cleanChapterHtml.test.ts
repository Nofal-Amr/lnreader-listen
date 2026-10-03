import { cleanChapterHtml } from '../cleanChapterHtml';
import { extractTtsParagraphs } from '../../extractTtsParagraphs';

const normal = { sensitivity: 'normal' as const, fixTitles: true };

describe('cleanChapterHtml', () => {
  it('removes watermark paragraphs and keeps the story', () => {
    const html = [
      '<p>Chapter 95: Chapter 94: Eighth Realm</p>',
      '<p>[Glass Cicada]</p>',
      '<p>Source: .com, updated by novlove.com</p>',
      '<p>He drew his sword [NovelFull.com] and charged.</p>',
      '<p>Thanks for reading!</p>',
    ].join('');
    expect(extractTtsParagraphs(cleanChapterHtml(html, normal))).toEqual([
      'Chapter 94: Eighth Realm',
      '[Glass Cicada]',
      'He drew his sword and charged.',
    ]);
  });

  it('drops a duplicated title line', () => {
    const html =
      '<h3>Chapter 143 - 141 — Sneak</h3><p>Chapter 143: Chapter 141 — Sneak</p><p>Story.</p>';
    expect(extractTtsParagraphs(cleanChapterHtml(html, normal))).toEqual([
      'Chapter 141: Sneak',
      'Story.',
    ]);
  });

  it('removes short paragraphs that link to a support site', () => {
    const html =
      '<p>Support me on <a href="https://www.patreon.com/x">Patreon</a></p><p>Story.</p>';
    expect(extractTtsParagraphs(cleanChapterHtml(html, normal))).toEqual([
      'Story.',
    ]);
  });

  it('changes nothing when switched off', () => {
    const html = '<p>Visit novelfull.com</p>';
    expect(
      cleanChapterHtml(html, { sensitivity: 'off', fixTitles: false }),
    ).toBe(html);
  });

  it('preserves inline formatting in untouched paragraphs', () => {
    const html = '<p>A <b>bold</b> move.</p>';
    expect(cleanChapterHtml(html, normal)).toBe(html);
  });

  it('applies custom rules to the page text when given', () => {
    const html =
      '<p>He left. Continue your adventure with .Côm</p><p>Your adventure continues at .Côm</p><p>The God spoke.</p>';
    const rules = [
      { id: 'a', find: 'Continue your adventure with .Côm', replace: '' },
      { id: 'b', find: 'Your adventure continues at .Côm', replace: '' },
      { id: 'c', find: 'God', replace: 'King', wholeWord: true },
    ];
    expect(
      extractTtsParagraphs(cleanChapterHtml(html, { ...normal, rules })),
    ).toEqual(['He left.', 'The King spoke.']);
  });

  describe('disguised watermarks like "➤ Novelight ➤"', () => {
    const ch = (...codes: number[]) => String.fromCharCode(...codes);
    const smallCaps = ch(
      0x274,
      0x1d0f,
      0x1d20,
      0x1d07,
      0x29f,
      0x26a,
      0x262,
      0x29c,
      0x1d1b,
    );
    const variants = {
      plain: 'Novelight',
      'small capitals': smallCaps,
      'Cyrillic l': 'Nove' + ch(0x4cf) + 'ight',
      'zero-width space': 'Novel' + ch(0x200b) + 'ight',
      'unknown site name': 'Wuxiabox',
    };
    for (const [name, mark] of Object.entries(variants)) {
      it(`removes it when written with ${name}`, () => {
        const html = `<p>“Anyway! ➤ ${mark} ➤ This is a matter between girls, so don’t butt in.”</p>`;
        expect(extractTtsParagraphs(cleanChapterHtml(html, normal))).toEqual([
          'Anyway! This is a matter between girls, so don’t butt in.',
        ]);
      });
    }

    it('keeps ordinary symbols in story text', () => {
      const html =
        '<p>The score was 3 ★ to 2, and ➤ marked the path.</p><p>*Thud* He fell. *sigh*</p>';
      expect(extractTtsParagraphs(cleanChapterHtml(html, normal))).toEqual([
        'The score was 3 ★ to 2, and ➤ marked the path.',
        '*Thud* He fell. *sigh*',
      ]);
    });
  });
});
