import React from 'react';
import { StyleSheet } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import type { ChapterReaderSettings } from '@hooks/persisted/useSettings';

import SpeechRulesSection from './SpeechRulesSection';
import StoredChaptersSection from './StoredChaptersSection';

/** Watermark cleaning and custom rules for the page text (not only TTS). */
const CleanTab: React.FC = () => {
  const theme = useTheme();
  const { tts, setChapterReaderSettings } = useChapterReaderSettings();
  const setTts = (next: ChapterReaderSettings['tts']) =>
    setChapterReaderSettings({ tts: next });
  return (
    <BottomSheetScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
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
});
