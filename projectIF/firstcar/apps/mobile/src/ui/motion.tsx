/**
 * Motion: one spring for every tap, one fade-up for content arriving, a light haptic tick on selection.
 * Everything respects the system "Reduce motion" setting: presses stay still and layout animations are skipped.
 */
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

/** Quick, slightly soft spring: settles in ~250 ms without a visible wobble. */
export const SPRING = { damping: 18, stiffness: 320, mass: 0.6 } as const;

/** Content that appears (a section, a result) rises a little and fades in. */
export const ENTER = FadeInDown.duration(280).reduceMotion(ReduceMotion.System);

/** Siblings slide into place when something above them grows or disappears. */
export const LAYOUT = LinearTransition.springify().damping(22).stiffness(220).reduceMotion(ReduceMotion.System);

/** Selection feedback: a light tick on phones, nothing on web. */
export function tick() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
}

/**
 * A Pressable that dips to `scaleTo` while held and springs back on release.
 * `containerStyle` sizes the animated wrapper (width, flex); `style` styles the pressable inside it.
 */
export function PressableScale({
  scaleTo = 0.97,
  containerStyle,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: Omit<PressableProps, 'children'> & { scaleTo?: number; containerStyle?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={[containerStyle, animated]}>
      <Pressable
        {...rest}
        onPressIn={(e) => {
          if (!reduced) scale.set(withSpring(scaleTo, SPRING));
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.set(withSpring(1, SPRING));
          onPressOut?.(e);
        }}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
