import { useTheme } from '@hooks/persisted';
import React from 'react';
import {
  Dimensions,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { MaterialDesignIconName } from '@type/icon';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

type Action = {
  icon: MaterialDesignIconName;
  /** Short text under the icon, e.g. "Mark unread". */
  label?: string;
  onPress: () => void;
};

interface ActionbarProps {
  active: boolean;
  actions: Action[];
  viewStyle?: StyleProp<ViewStyle>;
}

export const Actionbar: React.FC<ActionbarProps> = ({
  active,
  actions,
  viewStyle,
}) => {
  const theme = useTheme();

  const { bottom } = useSafeAreaInsets();

  if (!active) {
    return null;
  }
  return (
    <Animated.View
      entering={SlideInDown.duration(150)}
      exiting={SlideOutDown.duration(150)}
      style={[
        styles.actionbarContainer,
        {
          backgroundColor: theme.surface2,
          minHeight: 80 + bottom,
          paddingBottom: bottom,
        },
        viewStyle,
      ]}
    >
      {actions.map(({ icon, label, onPress }, id) => (
        <Pressable
          key={id}
          style={styles.action}
          accessibilityLabel={label}
          android_ripple={{
            radius: 50,
            color: theme.rippleColor,
            borderless: true,
          }}
          onPress={onPress}
        >
          <MaterialCommunityIcons
            name={icon}
            color={theme.onSurface}
            size={24}
          />
          {label ? (
            <Text
              numberOfLines={2}
              style={[styles.label, { color: theme.onSurface }]}
            >
              {label}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  action: { alignItems: 'center', flex: 1, paddingVertical: 6 },
  label: { fontSize: 11, marginTop: 4, textAlign: 'center' },
  actionbarContainer: {
    alignItems: 'center',
    bottom: 0,
    elevation: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    position: 'absolute',
    width: Dimensions.get('window').width,
  },
});
