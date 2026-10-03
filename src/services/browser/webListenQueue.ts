import type { TtsParagraph, TtsSession } from '@modules/nitro-tts';
import { claimPlayback } from '@services/listen/sharedSession';
import {
  getCleanerOptions,
  toTtsParagraphs,
} from '@services/listen/textPipeline';
import { fixTitle } from '@services/listen/cleaner/fixTitle';

import { extractWebPage, type WebPage } from './extractWebPage';

type Session = Pick<
  TtsSession,
  'appendChapter' | 'clearUpcoming' | 'addOnChapterChangedListener'
>;

export type WebQueueDeps = {
  fetchHtml: (url: string, userAgent?: string) => Promise<string>;
  extract: (html: string, url: string) => WebPage;
  toTtsParagraphs: (texts: string[]) => TtsParagraph[];
  claim?: (release: () => void) => void;
};

export type WebQueueEvent =
  | { type: 'page'; page: WebPage }
  | { type: 'blocked'; url: string; reason: string };

// Cloudflare / bot checks: the page has to be opened on screen once.
const CHALLENGE =
  /<title>\s*(?:just a moment|attention required|checking your browser)|cf-chl-|challenges\.cloudflare\.com/i;

export const hostOf = (url: string) =>
  /^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.replace(/^www\./, '') ?? url;

/**
 * Keeps the next web page queued in the native player while a page from the
 * Browser tab is being read, so listening continues page after page with the
 * screen off. Pages are fetched with the browser's cookies and user agent.
 */
export const createWebListenQueue = (deps: WebQueueDeps) => {
  let session: Session | undefined;
  let current: WebPage | undefined;
  let userAgent: string | undefined;
  let run = 0;
  let subscription: { remove(): void } | undefined;
  const pages = new Map<string, WebPage>();
  const listeners = new Set<(event: WebQueueEvent) => void>();
  const emit = (event: WebQueueEvent) => listeners.forEach(cb => cb(event));

  const queueAfter = async (page: WebPage, myRun: number) => {
    const url = page.nextUrl;
    if (!url || !session || pages.has(url)) return;
    let html: string;
    try {
      html = await deps.fetchHtml(url, userAgent);
    } catch {
      if (myRun === run) {
        emit({
          type: 'blocked',
          url,
          reason: 'The next page could not be loaded.',
        });
      }
      return;
    }
    if (myRun !== run || !session) return;
    if (CHALLENGE.test(html)) {
      emit({
        type: 'blocked',
        url,
        reason:
          'This site asks for a browser check. Open the next page on screen once.',
      });
      return;
    }
    const next = deps.extract(html, url);
    const paragraphs = deps.toTtsParagraphs(next.paragraphs);
    if (!paragraphs.some(p => p.text.trim())) return;
    pages.set(url, next);
    while (pages.size > 6) pages.delete(pages.keys().next().value as string);
    await session.appendChapter({
      chapterId: url,
      paragraphs,
      metadata: {
        novelName: hostOf(url),
        chapterName: fixTitle(next.title),
        chapterId: url,
      },
    });
  };

  const stopQueue = () => {
    run += 1;
    subscription?.remove();
    subscription = undefined;
    session?.clearUpcoming().catch(() => undefined);
    session = undefined;
    current = undefined;
    pages.clear();
  };

  return {
    start(nextSession: Session, page: WebPage, agent?: string) {
      deps.claim?.(stopQueue);
      run += 1;
      const myRun = run;
      subscription?.remove();
      session = nextSession;
      current = page;
      userAgent = agent ?? userAgent;
      pages.clear();
      pages.set(page.url, page);
      subscription = nextSession.addOnChapterChangedListener(url => {
        const page = pages.get(url);
        if (myRun !== run || !page) return;
        current = page;
        emit({ type: 'page', page });
        queueAfter(page, myRun).catch(() => undefined);
      });
      queueAfter(page, myRun).catch(() => undefined);
    },
    stop: stopQueue,
    current: () => current,
    isActive: () => session !== undefined,
    subscribe(cb: (event: WebQueueEvent) => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
};

export const fetchPageHtml = async (url: string, userAgent?: string) => {
  // RN's fetch shares the WebView's cookie store on Android, so a Cloudflare
  // clearance earned on screen also covers these background requests.
  const res = await fetch(url, {
    headers: userAgent ? { 'User-Agent': userAgent } : undefined,
  });
  if (!res.ok && res.status !== 403 && res.status !== 503) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
};

export const webListenQueue = createWebListenQueue({
  fetchHtml: fetchPageHtml,
  extract: (html, url) => extractWebPage(html, url, getCleanerOptions()),
  toTtsParagraphs,
  claim: claimPlayback,
});
