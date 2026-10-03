import { useState } from 'react';

import { List } from '@components';
import { getNovelDownloadedChapters } from '@database/queries/ChapterQueries';
import type { ChapterReaderSettings } from '@hooks/persisted/useSettings';
import type { ThemeColors } from '@theme/types';
import {
  cleanStoredChapters,
  restoreStoredChapters,
} from '@services/listen/cleanStoredChapters';
import { DEFAULT_CLEANER_OPTIONS } from '@services/listen/textPipeline';
import { showToast } from '@utils/showToast';

import { useChapterContext } from '../../ChapterContext';
import ReaderSheetPreferenceItem from './ReaderSheetPreferenceItem';

type Props = {
  tts: ChapterReaderSettings['tts'];
  setTts: (tts: ChapterReaderSettings['tts']) => void;
  theme: ThemeColors;
};

/**
 * Permanently cleans the stored files of downloaded / imported chapters
 * (any source), like epub_cleaner.py does to an EPUB, with an undo.
 */
const StoredChaptersSection = ({ tts, setTts, theme }: Props) => {
  const { novel } = useChapterContext();
  const [status, setStatus] = useState<string | null>(null);
  const cleaner = { ...DEFAULT_CLEANER_OPTIONS, ...tts?.cleaner };
  const busy = status !== null;

  const run = async (restore: boolean) => {
    if (busy || !novel) return;
    setStatus('Preparing…');
    try {
      const chapters = await getNovelDownloadedChapters(novel.id);
      if (!chapters.length) {
        showToast(
          'Download some chapters first: only stored chapters can be rewritten.',
        );
        return;
      }
      const progress = (done: number, total: number) =>
        setStatus(`${restore ? 'Restoring' : 'Cleaning'} ${done}/${total}…`);
      if (restore) {
        const restored = await restoreStoredChapters(
          novel.pluginId,
          chapters,
          progress,
        );
        showToast(`Restored the original text of ${restored} chapter(s).`);
      } else {
        const result = await cleanStoredChapters(
          novel.pluginId,
          chapters,
          progress,
        );
        showToast(
          `Cleaned ${result.changed} of ${result.total} downloaded chapters` +
            (result.failed ? ` (${result.failed} missing).` : '.'),
        );
      }
    } finally {
      setStatus(null);
    }
  };

  return (
    <>
      <List.SubHeader theme={theme}>Downloaded chapters</List.SubHeader>
      <ReaderSheetPreferenceItem
        label="Clean chapters when downloading or importing"
        description="Stores chapters already cleaned, for any source and EPUB imports."
        value={cleaner.cleanOnSave === true}
        onPress={() =>
          setTts({
            ...tts,
            cleaner: {
              ...cleaner,
              cleanOnSave: !(cleaner.cleanOnSave === true),
            },
          })
        }
        theme={theme}
      />
      <List.Item
        title={status ?? 'Clean this novel’s downloaded chapters now'}
        description="Rewrites the saved text with the settings above. The original is kept."
        right="auto-fix"
        onPress={busy ? undefined : () => void run(false)}
        theme={theme}
      />
      <List.Item
        title="Restore original text"
        description="Undo the permanent cleaning for this novel."
        right="restore"
        onPress={busy ? undefined : () => void run(true)}
        theme={theme}
      />
    </>
  );
};

export default StoredChaptersSection;
