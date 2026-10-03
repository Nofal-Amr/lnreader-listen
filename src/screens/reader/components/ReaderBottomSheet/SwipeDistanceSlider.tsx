import { StyleSheet, Text, View } from 'react-native';

import { Slider } from '@components';
import type { ThemeColors } from '@theme/types';

export const DEFAULT_SWIPE_DISTANCE = 0.4;

/** How far a horizontal swipe must travel (share of screen width) to change chapter. */
const SwipeDistanceSlider = ({
  value,
  onChange,
  theme,
}: {
  value?: number;
  onChange: (value: number) => void;
  theme: ThemeColors;
}) => {
  const current = value ?? DEFAULT_SWIPE_DISTANCE;
  return (
    <View style={styles.section}>
      <Text style={[styles.label, { color: theme.onSurface }]}>
        Swipe distance to change chapter: {Math.round(current * 100)}% of the
        screen
      </Text>
      <Slider
        value={current}
        min={0.15}
        max={0.85}
        step={0.05}
        showValueIndicator
        formatValue={v => `${Math.round(v * 100)}%`}
        accessibilityLabel="Swipe distance to change chapter"
        onSlidingComplete={onChange}
      />
    </View>
  );
};

export default SwipeDistanceSlider;

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 8 },
  label: { fontSize: 15, marginBottom: 6 },
});
