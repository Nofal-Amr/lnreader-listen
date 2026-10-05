import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import type { ChapterReaderSettings } from '@hooks/persisted/useSettings';

import SpeechRulesSection from './SpeechRulesSection';
import { useChapterContext } from '../../ChapterContext';
import {
  describeCleanReport,
  getCleanReport,
} from '@services/listen/cleanReports';
import StoredChaptersSection from './StoredChaptersSection';

/** Watermark cleaning and custom rules for the page text (not only TTS). */
const CleanTab: React.FC = () => {
  const theme = useTheme();
  const { tts, setChapterReaderSettings } = useChapterReaderSettings();
  const { chapter, refetch } = useChapterContext();
  // Re-load the open chapter so cleaning changes show at once (the reader
  // otherwise keeps the already-cleaned text in memory).
  const setTts = (next: ChapterReaderSettings['tts']) => {
    setChapterReaderSettings({ tts: next });
    refetch?.();
  };
  const report = describeCleanReport(
    chapter ? getCleanReport(chapter.id) : undefined,
  );
  return (
    <BottomSheetScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.report, { color: theme.primary }]}>{report}</Text>
      <SpeechRulesSection
        part="cleanup"
        tts={tts}
        setTts={setTts}
        theme={theme}
      />
      <StoredChaptersSection tts={tts} setTts={setTts} theme={theme} />
      <SpeechRulesSection
        part="rules"
        tts={tts}
        setTts={setTts}
        theme={theme}
      />
    </BottomSheetScrollView>
  );
};

export default React.memo(CleanTab);

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
  report: { paddingHorizontal: 16, paddingTop: 12, fontSize: 14 },
});
