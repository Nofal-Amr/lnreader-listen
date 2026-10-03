import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip, TextInput } from 'react-native-paper';

import { List, Slider } from '@components';
import { Tts, type TtsSkipUnit } from '@modules/nitro-tts';
import type {
  ChapterReaderSettings,
  TtsFavourite,
} from '@hooks/persisted/useSettings';
import type { ThemeColors } from '@theme/types';
import { TTS_DEFAULTS } from '@services/listen/ttsSettings';
import {
  formatSleepTimer,
  useSleepTimer,
} from '@services/listen/useSleepTimer';

import ReaderSheetPreferenceItem from './ReaderSheetPreferenceItem';

type ReaderTts = NonNullable<ChapterReaderSettings['tts']>;

type Props = {
  tts: ChapterReaderSettings['tts'];
  setTts: (tts: ReaderTts) => void;
  theme: ThemeColors;
};

const ONLINE_ENGINE = 'lnreader.online';
const ONLINE_NOTE =
  "Online voices use Microsoft Edge's Read Aloud service by default (free, unofficial, may stop working; the phone voice takes over if it fails). An Azure Speech key uses the official service instead.";
const PREVIEW_TEXT =
  'This is how this voice sounds. Chapter one, the beginning.';
const SKIP_UNITS: TtsSkipUnit[] = ['clause', 'sentence', 'paragraph'];
const SLEEP_MINUTES = [15, 30, 45, 60, 90];
const AUTO_PAUSE_MINUTES = [0, 10, 20, 30, 60];

const PauseSlider = ({
  label,
  value,
  onChange,
  theme,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  theme: ThemeColors;
}) => (
  <View style={styles.sliderSection}>
    <Text style={[styles.sliderLabel, { color: theme.onSurface }]}>
      {label}: {(value / 1000).toFixed(2)}s
    </Text>
    <Slider
      value={value}
      min={0}
      max={2000}
      step={50}
      showValueIndicator
      formatValue={v => `${(v / 1000).toFixed(2)}s`}
      accessibilityLabel={label}
      onSlidingComplete={onChange}
    />
  </View>
);

const ChipRow = <T extends string | number>({
  label,
  options,
  selected,
  format,
  onSelect,
  theme,
}: {
  label: string;
  options: T[];
  selected?: T;
  format: (value: T) => string;
  onSelect: (value: T) => void;
  theme: ThemeColors;
}) => (
  <View style={styles.chipSection}>
    <Text style={[styles.chipLabel, { color: theme.onSurfaceVariant }]}>
      {label}
    </Text>
    <View style={styles.chipRow}>
      {options.map(option => (
        <Chip
          key={String(option)}
          selected={option === selected}
          showSelectedCheck={false}
          mode={option === selected ? 'flat' : 'outlined'}
          style={styles.chip}
          onPress={() => onSelect(option)}
        >
          {format(option)}
        </Chip>
      ))}
    </View>
  </View>
);

const unitLabel = (unit: TtsSkipUnit) =>
  unit.charAt(0).toUpperCase() + unit.slice(1);

/**
 * T2S-style listening controls: favourites, pauses, skip ranges, sleep timer,
 * auto-pause and audio-focus behaviour.
 */
const ListenSettingsSection: React.FC<Props> = ({ tts, setTts, theme }) => {
  const current = useMemo<ReaderTts>(() => tts ?? {}, [tts]);
  const sleep = useSleepTimer();
  const [previewing, setPreviewing] = useState(false);
  const update = useCallback(
    (patch: Partial<ReaderTts>) => setTts({ ...current, ...patch }),
    [current, setTts],
  );

  const favourites = useMemo(() => current.favourites ?? [], [current]);
  const isFavourite = favourites.some(
    f =>
      f.engine?.name === current.engine?.name &&
      f.voice?.identifier === current.voice?.identifier,
  );

  const preview = useCallback(() => {
    setPreviewing(true);
    Tts.previewVoice(
      PREVIEW_TEXT,
      current.rate ?? 1,
      current.pitch ?? 1,
      current.engine?.name,
      current.voice?.identifier,
    )
      .catch(() => undefined)
      .finally(() => setPreviewing(false));
  }, [current]);

  const toggleFavourite = useCallback(() => {
    if (isFavourite) {
      update({
        favourites: favourites.filter(
          f =>
            !(
              f.engine?.name === current.engine?.name &&
              f.voice?.identifier === current.voice?.identifier
            ),
        ),
      });
      return;
    }
    const favourite: TtsFavourite = {
      engine: current.engine,
      voice: current.voice,
      label:
        [current.engine?.label, current.voice?.name]
          .filter(Boolean)
          .join(' · ') || 'System default',
    };
    update({ favourites: [...favourites, favourite] });
  }, [current, favourites, isFavourite, update]);

  return (
    <>
      <List.Item
        title={previewing ? 'Playing preview…' : 'Preview this voice'}
        onPress={previewing ? undefined : preview}
        right="play-circle-outline"
        theme={theme}
      />
      <List.Item
        title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
        onPress={toggleFavourite}
        right={isFavourite ? 'star' : 'star-outline'}
        theme={theme}
      />
      {favourites.length > 0 ? (
        <View style={styles.chipSection}>
          <Text style={[styles.chipLabel, { color: theme.onSurfaceVariant }]}>
            Favourite voices
          </Text>
          <View style={styles.chipRow}>
            {favourites.map(f => {
              const active =
                f.engine?.name === current.engine?.name &&
                f.voice?.identifier === current.voice?.identifier;
              return (
                <Chip
                  key={`${f.engine?.name}:${f.voice?.identifier}`}
                  selected={active}
                  mode={active ? 'flat' : 'outlined'}
                  style={styles.chip}
                  onPress={() => update({ engine: f.engine, voice: f.voice })}
                >
                  {f.label}
                </Chip>
              );
            })}
          </View>
        </View>
      ) : null}

      {current.engine?.name === ONLINE_ENGINE ? (
        <View style={styles.chipSection}>
          <Text style={[styles.chipLabel, { color: theme.onSurfaceVariant }]}>
            {ONLINE_NOTE}
          </Text>
          <TextInput
            mode="outlined"
            label="Azure Speech key (optional)"
            secureTextEntry
            defaultValue={current.azureKey}
            onEndEditing={e => update({ azureKey: e.nativeEvent.text.trim() })}
          />
          <TextInput
            mode="outlined"
            label="Azure region, e.g. eastus"
            autoCapitalize="none"
            defaultValue={current.azureRegion}
            onEndEditing={e =>
              update({ azureRegion: e.nativeEvent.text.trim() })
            }
            style={styles.input}
          />
        </View>
      ) : null}

      <List.SubHeader theme={theme}>Pauses</List.SubHeader>
      <PauseSlider
        label="After a comma"
        value={current.pauseCommaMs ?? TTS_DEFAULTS.pauseCommaMs}
        onChange={v => update({ pauseCommaMs: v })}
        theme={theme}
      />
      <PauseSlider
        label="After a sentence"
        value={current.pauseSentenceMs ?? TTS_DEFAULTS.pauseSentenceMs}
        onChange={v => update({ pauseSentenceMs: v })}
        theme={theme}
      />
      <PauseSlider
        label="Between paragraphs"
        value={current.pauseParagraphMs ?? TTS_DEFAULTS.pauseParagraphMs}
        onChange={v => update({ pauseParagraphMs: v })}
        theme={theme}
      />
      <PauseSlider
        label="Between chapters"
        value={current.pauseChapterMs ?? TTS_DEFAULTS.pauseChapterMs}
        onChange={v => update({ pauseChapterMs: v })}
        theme={theme}
      />

      <List.SubHeader theme={theme}>Skip range</List.SubHeader>
      <ChipRow
        label="Rewind ⏪"
        options={SKIP_UNITS}
        selected={current.rewindUnit ?? TTS_DEFAULTS.rewindUnit}
        format={unitLabel}
        onSelect={rewindUnit => update({ rewindUnit })}
        theme={theme}
      />
      <ChipRow
        label="Forward ⏩"
        options={SKIP_UNITS}
        selected={current.forwardUnit ?? TTS_DEFAULTS.forwardUnit}
        format={unitLabel}
        onSelect={forwardUnit => update({ forwardUnit })}
        theme={theme}
      />

      <List.SubHeader theme={theme}>
        {`Sleep timer — ${formatSleepTimer(sleep.state)}`}
      </List.SubHeader>
      <ChipRow
        label="Stop after"
        options={SLEEP_MINUTES}
        format={m => `${m} min`}
        onSelect={value =>
          sleep.start({
            mode: 'minutes',
            value,
            shakeToExtend: current.shakeToExtend !== false,
          })
        }
        theme={theme}
      />
      <ChipRow
        label="Or at a chapter end"
        options={[1, 2, 3, 5]}
        format={n => (n === 1 ? 'This chapter' : `${n} chapters`)}
        onSelect={value =>
          sleep.start({
            mode: value === 1 ? 'endOfChapter' : 'chapters',
            value,
            shakeToExtend: current.shakeToExtend !== false,
          })
        }
        theme={theme}
      />
      {sleep.state.active ? (
        <List.Item
          title="Cancel sleep timer"
          onPress={sleep.cancel}
          right="close"
          theme={theme}
        />
      ) : null}
      <ReaderSheetPreferenceItem
        label="Shake to add 10 minutes"
        value={current.shakeToExtend !== false}
        onPress={() =>
          update({ shakeToExtend: !(current.shakeToExtend !== false) })
        }
        theme={theme}
      />

      <List.SubHeader theme={theme}>Playback</List.SubHeader>
      <ChipRow
        label="Auto-pause after no interaction"
        options={AUTO_PAUSE_MINUTES}
        selected={current.autoPauseMinutes ?? TTS_DEFAULTS.autoPauseMinutes}
        format={m => (m === 0 ? 'Off' : `${m} min`)}
        onSelect={autoPauseMinutes => update({ autoPauseMinutes })}
        theme={theme}
      />
      <ReaderSheetPreferenceItem
        label="Play alongside other media"
        description="Keeps reading when other apps play sound. Calls will no longer pause it."
        value={current.mixWithOthers === true}
        onPress={() =>
          update({ mixWithOthers: !(current.mixWithOthers === true) })
        }
        theme={theme}
      />
    </>
  );
};

export default React.memo(ListenSettingsSection);

const styles = StyleSheet.create({
  input: {
    marginTop: 8,
  },
  sliderSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sliderLabel: {
    fontSize: 15,
    marginBottom: 6,
  },
  chipSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    marginEnd: 8,
    marginBottom: 8,
  },
});
