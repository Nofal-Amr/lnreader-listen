import type { WebPage } from '@services/browser/extractWebPage';

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Clean, ad-free page for Reader mode; keeps prev/next links working. */
export const readerModeHtml = (page: WebPage, dark: boolean) => {
  const bg = dark ? '#000000' : '#fafafa';
  const fg = dark ? '#d6d6d6' : '#1d1d1d';
  const link = dark ? '#8ab4f8' : '#1a56c4';
  const nav = [
    page.prevUrl
      ? `<a rel="prev" href="${escapeHtml(page.prevUrl)}">‹ Previous</a>`
      : '<span></span>',
    page.nextUrl
      ? `<a rel="next" href="${escapeHtml(page.nextUrl)}">Next ›</a>`
      : '<span></span>',
  ].join('');
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
<style>
  body { background:${bg}; color:${fg}; font-family: Roboto, sans-serif;
    font-size: 19px; line-height: 1.6; margin: 0; padding: 24px 18px 96px; }
  p { margin: 0 0 1em; }
  nav { display:flex; justify-content:space-between; margin: 28px 0; }
  a { color:${link}; font-size: 18px; text-decoration:none; padding: 10px 4px; }
</style></head><body>
${page.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n')}
<nav>${nav}</nav>
</body></html>`;
};
