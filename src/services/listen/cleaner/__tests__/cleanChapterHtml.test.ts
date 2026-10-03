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
});
