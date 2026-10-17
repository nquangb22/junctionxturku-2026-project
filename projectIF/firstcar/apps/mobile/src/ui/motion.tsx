/**
 * Motion: a short ease-out for every tap (no spring, so nothing bounces), a fade-up for content arriving,
 * a light haptic tick on selection.
 * Everything respects the system "Reduce motion" setting: presses stay still and layout animations are skipped.
 */
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, LinearTransition, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

/** Ease-out timing used for every small change: decelerates into place and never overshoots. */
export const EASE = { duration: 180, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System } as const;
const PRESS_IN = { ...EASE, duration: 90 } as const;

/** A small icon (a check mark) appearing or leaving: a plain fade, no zoom. */
export const ICON_IN = FadeIn.duration(150).reduceMotion(ReduceMotion.System);
export const ICON_OUT = FadeOut.duration(100).reduceMotion(ReduceMotion.System);

/** Content that appears (a section, a result) rises a little and fades in. */
export const ENTER = FadeInDown.duration(280).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System);

/** Siblings slide into place when something above them grows or disappears. */
export const LAYOUT = LinearTransition.duration(220).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System);

/** Selection feedback: a light tick on phones, nothing on web. */
export function tick() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
}

/**
 * A Pressable that dips to `scaleTo` while held and eases back on release.
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
          if (!reduced) scale.set(withTiming(scaleTo, PRESS_IN));
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.set(withTiming(1, EASE));
          onPressOut?.(e);
        }}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
