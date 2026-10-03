import { createWebListenQueue, hostOf } from '../webListenQueue';
import type { WebPage } from '../extractWebPage';

jest.mock('@services/listen/textPipeline', () => ({}));
jest.mock('@services/listen/sharedSession', () => ({}));

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

const page = (n: number, next = true): WebPage => ({
  url: `https://site.com/c${n}`,
  title: `Chapter ${n}`,
  paragraphs: [`Text ${n}.`],
  nextUrl: next ? `https://site.com/c${n + 1}` : undefined,
});

const makeSession = () => {
  let cb: ((id: string) => void) | undefined;
  return {
    appendChapter: jest.fn().mockResolvedValue(undefined),
    clearUpcoming: jest.fn().mockResolvedValue(undefined),
    addOnChapterChangedListener: jest.fn((listener: (id: string) => void) => {
      cb = listener;
      return { remove: jest.fn() };
    }),
    fire: (id: string) => cb?.(id),
  };
};

const makeDeps = () => ({
  fetchHtml: jest.fn(async (url: string) => `<html>${url}</html>`),
  extract: jest.fn((_html: string, url: string) =>
    page(Number(/c(\d+)$/.exec(url)?.[1])),
  ),
  toTtsParagraphs: (texts: string[]) =>
    texts.map((text, i) => ({ id: String(i), text, breaks: [] })),
});

describe('webListenQueue', () => {
  it('fetches the next page with the browser user agent and queues it', async () => {
    const deps = makeDeps();
    const queue = createWebListenQueue(deps);
    const session = makeSession();
    queue.start(session, page(1), 'UA/1');
    await flush();
    expect(deps.fetchHtml).toHaveBeenCalledWith('https://site.com/c2', 'UA/1');
    expect(session.appendChapter).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterId: 'https://site.com/c2',
        metadata: expect.objectContaining({ novelName: 'site.com' }),
      }),
    );
  });

  it('moves on when the player reaches the queued page', async () => {
    const deps = makeDeps();
    const queue = createWebListenQueue(deps);
    const session = makeSession();
    const events: string[] = [];
    queue.subscribe(e => events.push(e.type === 'page' ? e.page.url : e.type));
    queue.start(session, page(1));
    await flush();
    session.fire('https://site.com/c2');
    await flush();
    expect(events).toEqual(['https://site.com/c2']);
    expect(queue.current()?.url).toBe('https://site.com/c2');
    expect(session.appendChapter).toHaveBeenLastCalledWith(
      expect.objectContaining({ chapterId: 'https://site.com/c3' }),
    );
  });

  it('reports a Cloudflare check instead of queuing it', async () => {
    const deps = makeDeps();
    deps.fetchHtml.mockResolvedValue('<title>Just a moment...</title>');
    const queue = createWebListenQueue(deps);
    const session = makeSession();
    const events: string[] = [];
    queue.subscribe(e => events.push(e.type));
    queue.start(session, page(1));
    await flush();
    expect(session.appendChapter).not.toHaveBeenCalled();
    expect(events).toEqual(['blocked']);
  });

  it('stops at the last page', async () => {
    const deps = makeDeps();
    const queue = createWebListenQueue(deps);
    const session = makeSession();
    queue.start(session, page(1, false));
    await flush();
    expect(deps.fetchHtml).not.toHaveBeenCalled();
  });

  it('gets the site name from a URL', () => {
    expect(hostOf('https://www.royalroad.com/fiction/1')).toBe('royalroad.com');
  });
});
