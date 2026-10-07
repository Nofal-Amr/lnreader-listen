import { StyleSheet, Text, View } from 'react-native';
import { Chip } from 'react-native-paper';

import type { TtsBubblePosition } from '@hooks/persisted/useSettings';
import type { ThemeColors } from '@theme/types';

const ROWS: [TtsBubblePosition, string][][] = [
  [
    ['top-left', 'Top left'],
    ['top-right', 'Top right'],
  ],
  [
    ['middle-left', 'Middle left'],
    ['middle-right', 'Middle right'],
  ],
  [
    ['bottom-left', 'Bottom left'],
    ['bottom-right', 'Bottom right'],
  ],
];

/** Where the read-aloud bubble starts on the page. Picking one also resets a dragged bubble. */
const BubblePositionPicker = ({
  value,
  onChange,
  theme,
}: {
  value?: TtsBubblePosition;
  onChange: (value: TtsBubblePosition) => void;
  theme: ThemeColors;
}) => {
  const current = value ?? 'top-left';
  return (
    <View style={styles.section}>
      <Text style={[styles.label, { color: theme.onSurface }]}>
        Read-aloud bubble start position
      </Text>
      <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
        Picking a spot also moves a bubble you dragged elsewhere.
      </Text>
      {ROWS.map(row => (
        <View key={row[0][0]} style={styles.row}>
          {row.map(([position, label]) => (
            <Chip
              key={position}
              selected={position === current}
              mode={position === current ? 'flat' : 'outlined'}
              style={styles.chip}
              onPress={() => onChange(position)}
            >
              {label}
            </Chip>
          ))}
        </View>
      ))}
    </View>
  );
};

export default BubblePositionPicker;

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 8 },
  label: { fontSize: 16 },
  hint: { fontSize: 13, marginTop: 2, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
  chip: { flex: 1 },
});
