import NativeFile from '@modules/native-file';
import { fetchChapter } from '@services/plugin/fetch';

import { loadChapterHtml } from '../loadChapterHtml';

jest.mock('@modules/native-file', () => ({
  __esModule: true,
  default: { readFile: jest.fn() },
}));
jest.mock('@services/plugin/fetch', () => ({ fetchChapter: jest.fn() }));
jest.mock('@screens/reader/utils/sanitizeChapterText', () => ({
  sanitizeChapterText: (_p: string, _n: string, _c: string, t: string) =>
    `S(${t})`,
}));

const novel = { pluginId: 'p', name: 'N' };
const chapter = { id: 3, novelId: 2, path: '/c3', name: 'C3' };

describe('loadChapterHtml', () => {
  it('reads the downloaded file when present', async () => {
    (NativeFile.readFile as jest.Mock).mockResolvedValue('<p>a</p>');
    await expect(loadChapterHtml(novel, chapter)).resolves.toBe('S(<p>a</p>)');
    expect(NativeFile.readFile).toHaveBeenCalledWith(
      expect.stringMatching(/\/p\/2\/3\/index\.html$/),
    );
    expect(fetchChapter).not.toHaveBeenCalled();
  });

  it('falls back to the plugin when the file is missing', async () => {
    (NativeFile.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
    (fetchChapter as jest.Mock).mockResolvedValue('<p>b</p>');
    await expect(loadChapterHtml(novel, chapter)).resolves.toBe('S(<p>b</p>)');
    expect(fetchChapter).toHaveBeenCalledWith('p', '/c3');
  });
});
