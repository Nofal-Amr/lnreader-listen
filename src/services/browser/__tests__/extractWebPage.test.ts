import { extractWebPage, resolveUrl } from '../extractWebPage';

const cleaner = { sensitivity: 'normal' as const, fixTitles: true };

const page = `
<html><head><title>Stealing Immortal - Chapter 95</title></head>
<body>
  <header><nav><a href="/">Home</a> <a href="/novel/x">Index</a></nav></header>
  <div class="ads">Looking for ads... Fresh content is on the way</div>
  <div class="chapter-nav">
    <a href="/novel/x/chapter-94" id="prev_chap">Prev</a>
    <a href="/novel/x/chapter-96" id="next_chap">Next</a>
  </div>
  <div id="article">
    <h4>Chapter 95: Chapter 94: Eighth Realm</h4>
    <p>Lin Feng opened his eyes and looked at the sky above the mountain.</p>
    <p>The wind carried the scent of rain across the valley below him.</p>
    <p>Source: .com, updated by novlove.com</p>
    <p>He drew his sword and stepped forward into the light of dawn.</p>
  </div>
  <div class="comments"><p>Great chapter thanks!</p></div>
  <footer>Copyright</footer>
</body></html>`;

describe('extractWebPage', () => {
  it('finds the chapter text, cleans it and finds the next link', () => {
    const result = extractWebPage(
      page,
      'https://freewebnovel.com/novel/x/chapter-95',
      cleaner,
    );
    expect(result.paragraphs).toEqual([
      'Chapter 94: Eighth Realm',
      'Lin Feng opened his eyes and looked at the sky above the mountain.',
      'The wind carried the scent of rain across the valley below him.',
      'He drew his sword and stepped forward into the light of dawn.',
    ]);
    expect(result.nextUrl).toBe('https://freewebnovel.com/novel/x/chapter-96');
    expect(result.prevUrl).toBe('https://freewebnovel.com/novel/x/chapter-94');
    expect(result.title).toBe('Stealing Immortal - Chapter 95');
  });

  it('prefers rel=next and arrow-only links', () => {
    expect(
      extractWebPage(
        '<link rel="next" href="?p=2"><p>Some long enough paragraph of story text here.</p>',
        'https://a.com/read/1',
        cleaner,
      ).nextUrl,
    ).toBe('https://a.com/read/1?p=2');
    expect(
      extractWebPage(
        '<a href="c2.html">›</a><p>Some long enough paragraph of story text here.</p>',
        'https://a.com/b/c1.html',
        cleaner,
      ).nextUrl,
    ).toBe('https://a.com/b/c2.html');
  });

  it('has no next link when there is none', () => {
    expect(
      extractWebPage(
        '<p>Only text on this page, nothing else.</p>',
        'https://a.com/',
        cleaner,
      ).nextUrl,
    ).toBeUndefined();
  });
});

describe('resolveUrl', () => {
  it('resolves absolute, protocol-relative, root and relative paths', () => {
    const base = 'https://site.com/novel/a/ch-1.html';
    expect(resolveUrl('https://x.com/y', base)).toBe('https://x.com/y');
    expect(resolveUrl('//cdn.site.com/z', base)).toBe('https://cdn.site.com/z');
    expect(resolveUrl('/novel/a/ch-2.html', base)).toBe(
      'https://site.com/novel/a/ch-2.html',
    );
    expect(resolveUrl('ch-2.html', base)).toBe(
      'https://site.com/novel/a/ch-2.html',
    );
    expect(resolveUrl('../b/ch-1.html', base)).toBe(
      'https://site.com/novel/b/ch-1.html',
    );
  });

  it('ignores anchors and javascript links', () => {
    expect(resolveUrl('#top', 'https://a.com')).toBeUndefined();
    expect(resolveUrl('javascript:void(0)', 'https://a.com')).toBeUndefined();
  });
});
