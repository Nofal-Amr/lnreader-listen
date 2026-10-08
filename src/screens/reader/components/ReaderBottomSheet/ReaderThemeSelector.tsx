import { StyleSheet, Text, TextStyle, View } from 'react-native';
import React from 'react';
import { ToggleColorButton } from '@components/Common/ToggleButton';
import { getString } from '@i18n/translations';
import { presetReaderThemes } from '@utils/constants/readerConstants';
import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import { FlatList } from 'react-native-gesture-handler';
import { ReaderTheme } from '@hooks/persisted/useSettings';
import { Chip, Portal } from 'react-native-paper';
import { useBoolean } from '@hooks';
import ColorPickerModal from '@components/ColorPickerModal/ColorPickerModal';

interface ReaderThemeSelectorProps {
  label?: string;
  labelStyle?: TextStyle | TextStyle[];
  /** Show "pick your own colour" buttons (off where the screen has its own). */
  showCustom?: boolean;
}

const ReaderThemeSelector: React.FC<ReaderThemeSelectorProps> = ({
  label,
  labelStyle,
  showCustom = true,
}) => {
  const theme = useTheme();
  const backgroundModal = useBoolean();
  const textModal = useBoolean();

  const {
    theme: backgroundColor,
    textColor,
    customThemes,
    setChapterReaderSettings,
    saveCustomReaderTheme,
  } = useChapterReaderSettings();
  const known = [...customThemes, ...presetReaderThemes].some(
    item =>
      item.backgroundColor === backgroundColor && item.textColor === textColor,
  );

  return (
    <View style={styles.container}>
      <Text
        style={[{ color: theme.onSurfaceVariant }, styles.title, labelStyle]}
      >
        {label || getString('readerScreen.bottomSheet.color')}
      </Text>
      <FlatList
        data={[...customThemes, ...presetReaderThemes] as ReaderTheme[]}
        renderItem={({ item, index }) => (
          <ToggleColorButton
            key={index}
            selected={
              backgroundColor === item.backgroundColor &&
              textColor === item.textColor
            }
            backgroundColor={item.backgroundColor}
            textColor={item.textColor}
            theme={theme}
            onPress={() =>
              setChapterReaderSettings({
                theme: item.backgroundColor,
                textColor: item.textColor,
              })
            }
          />
        )}
        keyExtractor={(item, index) => item.textColor + '_' + index}
        horizontal={true}
        showsHorizontalScrollIndicator={false}
      />
      {showCustom ? (
        <View style={styles.customRow}>
          <Chip
            icon="format-color-fill"
            compact
            onPress={backgroundModal.setTrue}
          >
            Background
          </Chip>
          <Chip icon="format-color-text" compact onPress={textModal.setTrue}>
            Text colour
          </Chip>
          {!known ? (
            <Chip
              icon="content-save-outline"
              compact
              onPress={() =>
                saveCustomReaderTheme({ backgroundColor, textColor })
              }
            >
              Save
            </Chip>
          ) : null}
        </View>
      ) : null}
      {showCustom ? (
        <Portal>
          <ColorPickerModal
            title="Background colour"
            visible={backgroundModal.value}
            color={backgroundColor}
            closeModal={backgroundModal.setFalse}
            theme={theme}
            onSubmit={color => setChapterReaderSettings({ theme: color })}
          />
          <ColorPickerModal
            title="Text colour"
            visible={textModal.value}
            color={textColor}
            closeModal={textModal.setFalse}
            theme={theme}
            onSubmit={color => setChapterReaderSettings({ textColor: color })}
          />
        </Portal>
      ) : null}
    </View>
  );
};

export default ReaderThemeSelector;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: {
    marginBottom: 8,
  },
  customRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
});
