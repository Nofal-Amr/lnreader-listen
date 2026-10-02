import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from '@react-native-vector-icons/material-design-icons';
import { Chip } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Dialog, Slider } from '@components';
import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import type { MaterialDesignIconName } from '@type/icon';
import { fixTitle } from '@services/listen/cleaner/fixTitle';
import {
  applyPlayerSettings,
  playAdjacentChapter,
  runPlayerCommand,
  seekPlayer,
  usePlayerStore,
} from '@services/listen/playerStore';
import {
  formatSleepTimer,
  useSleepTimer,
} from '@services/listen/useSleepTimer';

const SPEEDS = [0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.5];

const Control = ({
  icon,
  label,
  size = 30,
  onPress,
  color,
}: {
  icon: MaterialDesignIconName;
  label: string;
  size?: number;
  onPress: () => void;
  color: string;
}) => (
  <Pressable
    onPress={onPress}
    hitSlop={10}
    style={styles.control}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    <Icon name={icon} size={size} color={color} />
  </Pressable>
);

/**
 * Full-screen, music-app style player: big play/pause, chapter and
 * clause/sentence skipping, speed, favourite voices, sleep timer and a
 * follow-along view of the chapter text.
 */
const PlayerScreen = ({ navigation }: { navigation: { goBack(): void } }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { tts, setChapterReaderSettings } = useChapterReaderSettings();
  const state = usePlayerStore(s => s.state);
  const novel = usePlayerStore(s => s.novel);
  const chapter = usePlayerStore(s => s.chapter);
  const progress = usePlayerStore(s => s.progress);
  const paragraphs = usePlayerStore(s => s.paragraphs);
  const error = usePlayerStore(s => s.error);
  const loadingChapter = usePlayerStore(s => s.loadingChapter);
  const sleep = useSleepTimer();
  const [sleepOpen, setSleepOpen] = useState(false);
  const listRef = useRef<FlatList<string>>(null);

  const playing = state === 'playing' || state === 'loading';
  const active = Math.min(progress.index, Math.max(paragraphs.length - 1, 0));

  useEffect(() => {
    if (paragraphs.length > active) {
      listRef.current?.scrollToIndex({
        index: active,
        viewPosition: 0.3,
        animated: true,
      });
    }
  }, [active, paragraphs.length]);

  const updateTts = useCallback(
    (patch: Partial<NonNullable<typeof tts>>) => {
      const next = { ...tts, ...patch };
      setChapterReaderSettings({ tts: next });
      void applyPlayerSettings(next);
    },
    [setChapterReaderSettings, tts],
  );

  const cycleSpeed = () => {
    const rate = tts?.rate ?? 1;
    const next = SPEEDS.find(s => s > rate + 0.01) ?? SPEEDS[0];
    updateTts({ rate: next });
  };

  const favourites = tts?.favourites ?? [];

  if (!novel || !chapter) {
    return (
      <View
        style={[
          styles.empty,
          { backgroundColor: theme.background, paddingTop: insets.top },
        ]}
      >
        <Text style={{ color: theme.onSurfaceVariant }}>
          Nothing is playing. Open a chapter and press play.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 8,
        },
      ]}
    >
      <View style={styles.header}>
        <Control
          icon="chevron-down"
          label="Close player"
          onPress={navigation.goBack}
          color={theme.onSurface}
        />
        <Text
          numberOfLines={1}
          style={[styles.headerText, { color: theme.onSurfaceVariant }]}
        >
          {novel.name}
        </Text>
        <Control
          icon="stop"
          label="Stop"
          onPress={() => {
            void runPlayerCommand('stop');
            navigation.goBack();
          }}
          color={theme.onSurface}
        />
      </View>

      <View style={styles.top}>
        {novel.cover ? (
          <Image source={{ uri: novel.cover }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, { backgroundColor: theme.primary }]} />
        )}
        <View style={styles.titles}>
          <Text
            numberOfLines={2}
            style={[styles.chapter, { color: theme.onSurface }]}
          >
            {fixTitle(chapter.name)}
          </Text>
          <Text style={{ color: theme.onSurfaceVariant }}>
            {loadingChapter
              ? 'Loading chapter…'
              : progress.total > 0
              ? `Paragraph ${active + 1} of ${progress.total}`
              : ' '}
          </Text>
          {error ? (
            <Text style={{ color: theme.error }} numberOfLines={2}>
              {error}
            </Text>
          ) : null}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={paragraphs}
        style={styles.follow}
        keyExtractor={(_, index) => String(index)}
        onScrollToIndexFailed={() => undefined}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => void seekPlayer(index)}>
            <Text
              style={[
                styles.paragraph,
                {
                  color:
                    index === active ? theme.onSurface : theme.onSurfaceVariant,
                  backgroundColor:
                    index === active ? theme.primaryContainer : 'transparent',
                },
              ]}
            >
              {item}
            </Text>
          </Pressable>
        )}
      />

      {progress.total > 1 ? (
        <View style={styles.slider}>
          <Slider
            value={active}
            min={0}
            max={progress.total - 1}
            step={1}
            accessibilityLabel="Position in chapter"
            onSlidingComplete={value => void seekPlayer(Math.round(value))}
          />
        </View>
      ) : null}

      <View style={styles.controls}>
        <Control
          icon="skip-previous"
          label="Previous chapter"
          onPress={() => void playAdjacentChapter('prev')}
          color={theme.onSurface}
        />
        <Control
          icon="rewind"
          label="Rewind"
          size={36}
          onPress={() => void runPlayerCommand('previous')}
          color={theme.onSurface}
        />
        <Pressable
          onPress={() => void runPlayerCommand(playing ? 'pause' : 'play')}
          style={[styles.bigPlay, { backgroundColor: theme.primary }]}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        >
          <Icon
            name={playing ? 'pause' : 'play'}
            size={52}
            color={theme.onPrimary}
          />
        </Pressable>
        <Control
          icon="fast-forward"
          label="Forward"
          size={36}
          onPress={() => void runPlayerCommand('next')}
          color={theme.onSurface}
        />
        <Control
          icon="skip-next"
          label="Next chapter"
          onPress={() => void playAdjacentChapter('next')}
          color={theme.onSurface}
        />
      </View>

      <View style={styles.chips}>
        <Chip icon="speedometer" onPress={cycleSpeed} style={styles.chip}>
          {`${(tts?.rate ?? 1).toFixed(1)}×`}
        </Chip>
        <Chip
          icon="sleep"
          onPress={() => setSleepOpen(true)}
          style={styles.chip}
        >
          {formatSleepTimer(sleep.state)}
        </Chip>
        {favourites.map(f => {
          const selected =
            f.engine?.name === tts?.engine?.name &&
            f.voice?.identifier === tts?.voice?.identifier;
          return (
            <Chip
              key={`${f.engine?.name}:${f.voice?.identifier}`}
              icon="account-voice"
              selected={selected}
              mode={selected ? 'flat' : 'outlined'}
              onPress={() => updateTts({ engine: f.engine, voice: f.voice })}
              style={styles.chip}
            >
              {f.label}
            </Chip>
          );
        })}
      </View>

      <Dialog.Root visible={sleepOpen} onDismiss={() => setSleepOpen(false)}>
        <Dialog.Title>Sleep timer</Dialog.Title>
        <Dialog.Content>
          <View style={styles.sleepOptions}>
            {[15, 30, 45, 60, 90].map(minutes => (
              <Chip
                key={minutes}
                style={styles.chip}
                onPress={() => {
                  sleep.start({
                    mode: 'minutes',
                    value: minutes,
                    shakeToExtend: tts?.shakeToExtend !== false,
                  });
                  setSleepOpen(false);
                }}
              >
                {`${minutes} min`}
              </Chip>
            ))}
            <Chip
              style={styles.chip}
              onPress={() => {
                sleep.start({
                  mode: 'endOfChapter',
                  value: 1,
                  shakeToExtend: tts?.shakeToExtend !== false,
                });
                setSleepOpen(false);
              }}
            >
              End of chapter
            </Chip>
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          {sleep.state.active ? (
            <Dialog.Action
              onPress={() => {
                sleep.cancel();
                setSleepOpen(false);
              }}
            >
              Turn off
            </Dialog.Action>
          ) : null}
          <Dialog.Action onPress={() => setSleepOpen(false)}>
            Close
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>
    </View>
  );
};

export default PlayerScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerText: { flex: 1, textAlign: 'center', fontSize: 14 },
  top: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cover: { width: 96, height: 136, borderRadius: 10 },
  titles: { flex: 1, marginStart: 16 },
  chapter: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  follow: { flex: 1, paddingHorizontal: 12 },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  slider: { paddingHorizontal: 16, paddingTop: 8 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 12,
  },
  control: { padding: 6 },
  bigPlay: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chip: { margin: 4 },
  sleepOptions: { flexDirection: 'row', flexWrap: 'wrap' },
});
