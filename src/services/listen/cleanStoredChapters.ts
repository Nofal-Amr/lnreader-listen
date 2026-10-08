import NativeFile from '@modules/native-file';
import { NOVEL_STORAGE } from '@utils/Storages';

import { cleanChapterHtml } from './cleaner/cleanChapterHtml';
import { splitBrParagraphs } from './cleaner/splitBrParagraphs';
import { getCleanerOptions } from './textPipeline';

type StoredChapter = { id: number; novelId: number };
type Deps = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  unlink: (path: string) => Promise<void>;
  clean: (html: string) => string;
};

const defaultDeps: Deps = {
  readFile: p => NativeFile.readFile(p),
  writeFile: (p, c) => NativeFile.writeFile(p, c),
  exists: p => NativeFile.exists(p),
  unlink: p => NativeFile.unlink(p),
  clean: html => cleanChapterHtml(html, getCleanerOptions()),
};

const chapterDir = (pluginId: string, chapter: StoredChapter) =>
  `${NOVEL_STORAGE}/${pluginId}/${chapter.novelId}/${chapter.id}`;

export type CleanProgress = (done: number, total: number) => void;

/**
 * Rewrites downloaded / imported chapter files with the watermark cleaner,
 * title fixer and page rules applied, like epub_cleaner.py does to a book.
 * The first time a chapter is changed its original is kept as
 * index.original.html so it can be restored.
 */
export const cleanStoredChapters = async (
  pluginId: string,
  chapters: StoredChapter[],
  onProgress?: CleanProgress,
  deps: Deps = defaultDeps,
): Promise<{ changed: number; total: number; failed: number }> => {
  let changed = 0;
  let failed = 0;
  for (let i = 0; i < chapters.length; i++) {
    const dir = chapterDir(pluginId, chapters[i]);
    try {
      const raw = await deps.readFile(`${dir}/index.html`);
      const cleaned = deps.clean(raw);
      if (cleaned !== raw) {
        const original = `${dir}/index.original.html`;
        if (!(await deps.exists(original))) {
          await deps.writeFile(original, raw);
        }
        await deps.writeFile(`${dir}/index.html`, cleaned);
        changed += 1;
      }
    } catch {
      failed += 1;
    }
    onProgress?.(i + 1, chapters.length);
  }
  return { changed, total: chapters.length, failed };
};

/** Puts back the original text saved by cleanStoredChapters. */
export const restoreStoredChapters = async (
  pluginId: string,
  chapters: StoredChapter[],
  onProgress?: CleanProgress,
  deps: Deps = defaultDeps,
): Promise<number> => {
  let restored = 0;
  for (let i = 0; i < chapters.length; i++) {
    const dir = chapterDir(pluginId, chapters[i]);
    const original = `${dir}/index.original.html`;
    try {
      if (await deps.exists(original)) {
        await deps.writeFile(
          `${dir}/index.html`,
          await deps.readFile(original),
        );
        await deps.unlink(original);
        restored += 1;
      }
    } catch {
      // Skip chapters whose files are missing.
    }
    onProgress?.(i + 1, chapters.length);
  }
  return restored;
};

/** Cleans chapter HTML before it is first saved, when that option is on. */
export const cleanForStorage = (html: string): string => {
  const options = getCleanerOptions();
  // Real paragraphs are always saved, even with permanent cleaning off, so a
  // <br>-only chapter (fan-fiction exports) never reaches the reader as one block.
  return options.cleanOnSave
    ? cleanChapterHtml(html, options)
    : splitBrParagraphs(html);
};
