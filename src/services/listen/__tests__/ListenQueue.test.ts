import { createListenQueue, ListenChapter } from '../ListenQueue';

jest.mock('@database/queries/ChapterQueries', () => ({}));
jest.mock('../loadChapterHtml', () => ({ loadChapterHtml: jest.fn() }));

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

const makeSession = () => {
  let chapterCb: ((id: string) => void) | undefined;
  return {
    appendChapter: jest.fn().mockResolvedValue(undefined),
    clearUpcoming: jest.fn().mockResolvedValue(undefined),
    addOnChapterChangedListener: jest.fn((cb: (id: string) => void) => {
      chapterCb = cb;
      return { remove: jest.fn() };
    }),
    fire: (id: string) => chapterCb?.(id),
  };
};

const novel = { id: 1, pluginId: 'p', name: 'N', cover: null };
const ch = (id: number): ListenChapter => ({
  id,
  novelId: 1,
  path: `/c${id}`,
  name: `C${id}`,
  position: id,
  page: '1',
});

const makeDeps = () => ({
  getNextChapter: jest.fn(async (c: ListenChapter) =>
    (c.position ?? 0) < 3 ? ch((c.position ?? 0) + 1) : undefined,
  ),
  getChapter: jest.fn(async (id: number) => ch(id)),
  loadChapterHtml: jest.fn(
    async (_n: unknown, c: ListenChapter) => `<p>Text ${c.id}.</p>`,
  ),
  markChapterRead: jest.fn(async () => undefined),
  updateChapterProgress: jest.fn(async () => undefined),
});

describe('ListenQueue', () => {
  it('queues the following chapter as soon as listening starts', async () => {
    const deps = makeDeps();
    const queue = createListenQueue(deps);
    const session = makeSession();
    queue.start(session, novel, ch(1));
    await flush();
    expect(session.appendChapter).toHaveBeenCalledWith({
      chapterId: '2',
      paragraphs: [{ id: '0', text: 'Text 2.', breaks: [] }],
      metadata: {
        novelName: 'N',
        chapterName: 'C2',
        chapterId: '2',
        coverUri: undefined,
      },
    });
  });

  it('on chapter change marks the previous read, notifies and queues the next', async () => {
    const deps = makeDeps();
    const queue = createListenQueue(deps);
    const session = makeSession();
    const seen: number[] = [];
    queue.onChapterChanged(id => seen.push(id));
    queue.start(session, novel, ch(1));
    await flush();
    session.fire('2');
    await flush();
    expect(deps.updateChapterProgress).toHaveBeenCalledWith(1, 100);
    expect(deps.markChapterRead).toHaveBeenCalledWith(1);
    expect(seen).toEqual([2]);
    expect(queue.currentChapterId()).toBe(2);
    expect(session.appendChapter).toHaveBeenLastCalledWith(
      expect.objectContaining({ chapterId: '3' }),
    );
  });

  it('skips a chapter with no readable text', async () => {
    const deps = makeDeps();
    deps.loadChapterHtml.mockImplementation(async (_n, c) =>
      c.id === 2 ? '<p> </p>' : `<p>Text ${c.id}.</p>`,
    );
    const queue = createListenQueue(deps);
    const session = makeSession();
    queue.start(session, novel, ch(1));
    await flush();
    expect(session.appendChapter).toHaveBeenCalledTimes(1);
    expect(session.appendChapter).toHaveBeenCalledWith(
      expect.objectContaining({ chapterId: '3' }),
    );
  });

  it('skips a chapter that fails to load', async () => {
    const deps = makeDeps();
    deps.loadChapterHtml.mockImplementation(async (_n, c) => {
      if (c.id === 2) throw new Error('network');
      return `<p>Text ${c.id}.</p>`;
    });
    const queue = createListenQueue(deps);
    const session = makeSession();
    queue.start(session, novel, ch(1));
    await flush();
    expect(session.appendChapter).toHaveBeenCalledWith(
      expect.objectContaining({ chapterId: '3' }),
    );
  });

  it('queues nothing after stop()', async () => {
    const deps = makeDeps();
    const queue = createListenQueue(deps);
    const session = makeSession();
    queue.start(session, novel, ch(1));
    queue.stop();
    await flush();
    expect(session.appendChapter).not.toHaveBeenCalled();
    expect(session.clearUpcoming).toHaveBeenCalled();
    expect(queue.currentChapterId()).toBeUndefined();
  });
});
