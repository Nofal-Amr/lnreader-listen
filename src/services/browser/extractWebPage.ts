import { load, type AnyNode, type Element, type CheerioAPI } from 'cheerio';

import {
  cleanChapterHtml,
  type CleanerOptions,
} from '@services/listen/cleaner/cleanChapterHtml';
import { extractTtsParagraphs } from '@services/listen/extractTtsParagraphs';

export interface WebPage {
  url: string;
  title: string;
  /** Readable paragraphs of the main text, in order. */
  paragraphs: string[];
  /** Absolute URL of the next chapter, when one was found. */
  nextUrl?: string;
  /** Absolute URL of the previous chapter, when one was found. */
  prevUrl?: string;
}

const JUNK =
  'script, style, noscript, template, iframe, form, button, select, input, nav, aside, header, footer, svg, canvas';
const JUNK_HINT =
  /comment|sidebar|footer|header|menu|nav|share|social|related|recommend|ads?\b|advert|banner|popup|modal|cookie/i;
const NEXT_TEXT =
  /^\s*(?:next(?:\s+chapter|\s+chap\.?|\s+ch\.?|\s+page|\s+part)?|chapter\s+suivant|siguiente)\s*[›»>→]*\s*$|^\s*[›»→]\s*$|^\s*>>?\s*$/i;
const PREV_TEXT =
  /^s*[‹«<←]*s*(?:prev(?:ious)?(?:s+chapter|s+chap.?|s+ch.?|s+page|s+part)?)s*$|^s*[‹«←]s*$|^s*<<?s*$/i;
const PREV_HINT =
  /(?:^|[-_s])prev(?:ious)?(?:[-_s]?(?:chap(?:ter)?|ch|page|btn|link))?(?:$|[-_s])/i;
const NEXT_HINT =
  /(?:^|[-_\s])next(?:[-_\s]?(?:chap(?:ter)?|ch|page|btn|link))?(?:$|[-_\s])/i;

/** Resolves `href` against `base` without relying on a full URL polyfill. */
export const resolveUrl = (href: string, base: string): string | undefined => {
  const h = href.trim();
  if (!h || h.startsWith('#') || /^(?:javascript|mailto|tel):/i.test(h)) {
    return undefined;
  }
  if (/^https?:\/\//i.test(h)) return h;
  const match = /^(https?:)\/\/([^/?#]+)([^?#]*)/i.exec(base);
  if (!match) return undefined;
  const [, protocol, host, path] = match;
  if (h.startsWith('//')) return `${protocol}${h}`;
  if (h.startsWith('?')) return `${protocol}//${host}${path}${h}`;
  if (h.startsWith('/')) return `${protocol}//${host}${h}`;
  const dir = path.endsWith('/') ? path : path.replace(/[^/]*$/, '');
  const segments = `${dir}${h}`.split('/');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '..') out.pop();
    else if (seg !== '.') out.push(seg);
  }
  const joined = out.join('/');
  return `${protocol}//${host}${joined.startsWith('/') ? '' : '/'}${joined}`;
};

const isElement = (node: AnyNode): node is Element => node.type === 'tag';

const textLength = ($: CheerioAPI, el: Element) =>
  $(el).text().replace(/\s+/g, ' ').trim().length;

/** Readability-style: the element whose paragraphs hold the most text. */
const findMainContent = ($: CheerioAPI): Element | null => {
  const scores = new Map<Element, number>();
  $('p, div, td, li')
    .toArray()
    .forEach(el => {
      // Only count blocks that hold text directly, not wrappers.
      const ownText = el.children
        .filter(c => c.type === 'text')
        .map(c => (c as unknown as { data: string }).data)
        .join('');
      const len =
        el.name === 'p'
          ? textLength($, el)
          : ownText.replace(/\s+/g, ' ').trim().length;
      if (len < 25) return;
      const parent = el.parent;
      if (parent && isElement(parent)) {
        scores.set(parent, (scores.get(parent) ?? 0) + len);
        const grand = parent.parent;
        if (grand && isElement(grand)) {
          scores.set(grand, (scores.get(grand) ?? 0) + len / 2);
        }
      }
      if (el.name !== 'p') scores.set(el, (scores.get(el) ?? 0) + len);
    });
  let best: Element | null = null;
  let bestScore = 0;
  for (const [el, score] of scores) {
    if (score > bestScore) {
      best = el;
      bestScore = score;
    }
  }
  return best;
};

const findLink = (
  $: CheerioAPI,
  base: string,
  rel: string,
  textRe: RegExp,
  hintRe: RegExp,
): string | undefined => {
  const relHref = $(`link[rel~="${rel}"], a[rel~="${rel}"]`)
    .first()
    .attr('href');
  if (relHref) return resolveUrl(relHref, base);
  return findByLabel($, base, textRe, hintRe);
};

const findByLabel = (
  $: CheerioAPI,
  base: string,
  textRe: RegExp,
  hintRe: RegExp,
): string | undefined => {
  const anchors = $('a[href]').toArray();
  for (const a of anchors) {
    const $a = $(a);
    const label = ($a.text() || $a.attr('title') || $a.attr('aria-label') || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (textRe.test(label)) {
      const url = resolveUrl($a.attr('href') ?? '', base);
      if (url) return url;
    }
  }
  for (const a of anchors) {
    const $a = $(a);
    const hint = `${$a.attr('id') ?? ''} ${$a.attr('class') ?? ''}`;
    if (hintRe.test(hint)) {
      const url = resolveUrl($a.attr('href') ?? '', base);
      if (url) return url;
    }
  }
  return undefined;
};

/**
 * Pulls the readable chapter text and the next-chapter link out of any web
 * page. Used both for the page on screen (its HTML is posted from the
 * WebView) and for pages fetched in the background while listening, so the
 * two always split paragraphs the same way.
 */
export const extractWebPage = (
  html: string,
  url: string,
  cleaner: CleanerOptions,
): WebPage => {
  const $ = load(html);
  const nextUrl = findLink($, url, 'next', NEXT_TEXT, NEXT_HINT);
  const prevUrl = findLink($, url, 'prev', PREV_TEXT, PREV_HINT);
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    url;

  $(JUNK).remove();
  $('[id], [class]')
    .toArray()
    .forEach(el => {
      const $el = $(el);
      const hint = `${$el.attr('id') ?? ''} ${$el.attr('class') ?? ''}`;
      if (JUNK_HINT.test(hint) && textLength($, el) < 400) $el.remove();
    });

  const main = findMainContent($);
  const containerHtml = main ? $.html(main) : $('body').html() ?? '';
  const paragraphs = extractTtsParagraphs(
    cleanChapterHtml(containerHtml, cleaner),
  );
  return { url, title, paragraphs, nextUrl, prevUrl };
};
