import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '@react-native-vector-icons/material-design-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '@hooks/persisted';
import type { RootStackParamList } from '@navigators/types';
import {
  isActiveState,
  runPlayerCommand,
  usePlayerStore,
} from '@services/listen/playerStore';
import { fixTitle } from '@services/listen/cleaner/fixTitle';

/** Music-style "now playing" bar shown above the bottom tabs while listening. */
const MiniPlayer = () => {
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const state = usePlayerStore(s => s.state);
  const novel = usePlayerStore(s => s.novel);
  const chapter = usePlayerStore(s => s.chapter);
  const progress = usePlayerStore(s => s.progress);

  if (!novel || !chapter || !isActiveState(state)) return null;

  const playing = state === 'playing' || state === 'loading';
  const fraction =
    progress.total > 0 ? (progress.index + 1) / progress.total : 0;

  return (
    <Pressable
      onPress={() => navigation.navigate('Player')}
      style={[styles.container, { backgroundColor: theme.surfaceVariant }]}
      accessibilityRole="button"
      accessibilityLabel="Open player"
    >
      <View style={styles.row}>
        {novel.cover ? (
          <Image source={{ uri: novel.cover }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, { backgroundColor: theme.primary }]} />
        )}
        <View style={styles.text}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: theme.onSurface }]}
          >
            {fixTitle(chapter.name)}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.subtitle, { color: theme.onSurfaceVariant }]}
          >
            {novel.name}
          </Text>
        </View>
        <Pressable
          onPress={() => runPlayerCommand('previous')}
          hitSlop={8}
          style={styles.small}
          accessibilityLabel="Rewind"
        >
          <Icon name="rewind" size={26} color={theme.onSurface} />
        </Pressable>
        <Pressable
          onPress={() => runPlayerCommand(playing ? 'pause' : 'play')}
          style={[styles.play, { backgroundColor: theme.primary }]}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        >
          <Icon
            name={playing ? 'pause' : 'play'}
            size={30}
            color={theme.onPrimary}
          />
        </Pressable>
        <Pressable
          onPress={() => runPlayerCommand('next')}
          hitSlop={8}
          style={styles.small}
          accessibilityLabel="Forward"
        >
          <Icon name="fast-forward" size={26} color={theme.onSurface} />
        </Pressable>
      </View>
      <View style={[styles.track, { backgroundColor: theme.outlineVariant }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: theme.primary, width: `${fraction * 100}%` },
          ]}
        />
      </View>
    </Pressable>
  );
};

export default MiniPlayer;

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  text: {
    flex: 1,
    marginHorizontal: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  small: {
    padding: 6,
  },
  play: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  track: {
    height: 2,
  },
  fill: {
    height: 2,
  },
});
