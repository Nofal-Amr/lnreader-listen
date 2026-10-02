import NativeFile from '@modules/native-file';
import { fetchChapter } from '@services/plugin/fetch';
import { sanitizeChapterText } from '@screens/reader/utils/sanitizeChapterText';
import { NOVEL_STORAGE } from '@utils/Storages';

/**
 * Reads the chapter from local storage, falling back to the plugin when it
 * is not downloaded. A single `readFile` doubles as the existence check to
 * save a native round trip on the critical path of a downloaded chapter.
 */
export const loadRawChapterHtml = async (
  pluginId: string,
  chapter: { id: number; novelId: number; path: string },
): Promise<string> => {
  const filePath = `${NOVEL_STORAGE}/${pluginId}/${chapter.novelId}/${chapter.id}/index.html`;
  try {
    return await NativeFile.readFile(filePath);
  } catch {
    return await fetchChapter(pluginId, chapter.path);
  }
};

export const loadChapterHtml = async (
  novel: { pluginId: string; name: string },
  chapter: { id: number; novelId: number; path: string; name: string },
): Promise<string> =>
  sanitizeChapterText(
    novel.pluginId,
    novel.name,
    chapter.name,
    await loadRawChapterHtml(novel.pluginId, chapter),
  );
