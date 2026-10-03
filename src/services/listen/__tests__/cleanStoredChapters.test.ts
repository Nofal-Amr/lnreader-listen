import {
  cleanStoredChapters,
  restoreStoredChapters,
} from '../cleanStoredChapters';

jest.mock('@modules/native-file', () => ({ __esModule: true, default: {} }));
jest.mock('@utils/Storages', () => ({ NOVEL_STORAGE: '/novels' }));
jest.mock('../textPipeline', () => ({ getCleanerOptions: () => ({}) }));

const makeFs = (files: Record<string, string>) => ({
  files,
  readFile: jest.fn(async (p: string) => {
    if (!(p in files)) throw new Error('ENOENT');
    return files[p];
  }),
  writeFile: jest.fn(async (p: string, c: string) => {
    files[p] = c;
  }),
  exists: jest.fn(async (p: string) => p in files),
  unlink: jest.fn(async (p: string) => {
    delete files[p];
  }),
  clean: (html: string) => html.replace(' Visit novelfull.com', ''),
});

const chapters = [
  { id: 1, novelId: 9 },
  { id: 2, novelId: 9 },
  { id: 3, novelId: 9 },
];

describe('cleanStoredChapters', () => {
  it('rewrites changed chapters and keeps the original once', async () => {
    const fs = makeFs({
      '/novels/p/9/1/index.html': '<p>Story. Visit novelfull.com</p>',
      '/novels/p/9/2/index.html': '<p>Clean story.</p>',
    });
    const progress: number[] = [];
    const result = await cleanStoredChapters(
      'p',
      chapters,
      d => progress.push(d),
      fs,
    );

    expect(result).toEqual({ changed: 1, total: 3, failed: 1 });
    expect(fs.files['/novels/p/9/1/index.html']).toBe('<p>Story.</p>');
    expect(fs.files['/novels/p/9/1/index.original.html']).toBe(
      '<p>Story. Visit novelfull.com</p>',
    );
    expect(fs.files['/novels/p/9/2/index.original.html']).toBeUndefined();
    expect(progress).toEqual([1, 2, 3]);

    // Cleaning again must not overwrite the saved original.
    fs.files['/novels/p/9/1/index.html'] = '<p>Story. Visit novelfull.com</p>';
    await cleanStoredChapters('p', chapters, undefined, fs);
    expect(fs.files['/novels/p/9/1/index.original.html']).toBe(
      '<p>Story. Visit novelfull.com</p>',
    );
  });

  it('restores the original text and removes the backup', async () => {
    const fs = makeFs({
      '/novels/p/9/1/index.html': '<p>Story.</p>',
      '/novels/p/9/1/index.original.html': '<p>Story. Visit novelfull.com</p>',
    });
    expect(await restoreStoredChapters('p', chapters, undefined, fs)).toBe(1);
    expect(fs.files['/novels/p/9/1/index.html']).toBe(
      '<p>Story. Visit novelfull.com</p>',
    );
    expect(fs.files['/novels/p/9/1/index.original.html']).toBeUndefined();
  });
});
