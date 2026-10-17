/** Line icons (Ionicons outline set) in place of emoji, so icons follow the text colour and look the same everywhere. */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { Txt } from '@/ui/primitives';

const GLYPHS = {
  check: 'checkmark-circle-outline',
  cross: 'close-circle-outline',
  wrench: 'construct-outline',
  clock: 'time-outline',
  circle: 'ellipse-outline',
  lock: 'lock-closed-outline',
  warning: 'warning-outline',
  info: 'information-circle-outline',
  calendar: 'calendar-outline',
  flag: 'flag-outline',
  sparkles: 'sparkles-outline',
  scale: 'scale-outline',
  shield: 'shield-checkmark-outline',
  car: 'car-sport-outline',
  checkbox: 'checkbox-outline',
  checkboxEmpty: 'square-outline',
  chevron: 'chevron-forward',
  settings: 'settings-outline',
  faceId: 'scan-outline',
  fingerprint: 'finger-print-outline',
  iris: 'eye-outline',
  passcode: 'keypad-outline',
} as const satisfies Record<string, ComponentProps<typeof Ionicons>['name']>;

export type IconName = keyof typeof GLYPHS;

export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color?: string }) {
  const p = usePalette();
  return <Ionicons name={GLYPHS[name]} size={size} color={color ?? p.text} importantForAccessibility="no" accessibilityElementsHidden />;
}

/** An icon in front of a line of text, aligned to its first line. */
export function IconLine({ icon, children, variant = 'body', color }: { icon: IconName; children: ReactNode; variant?: 'body' | 'bodyStrong' | 'small' | 'caption' | 'title'; color?: string }) {
  const p = usePalette();
  const muted = variant === 'small' || variant === 'caption';
  const size = variant === 'title' ? 28 : muted ? 16 : 20;
  return (
    <View style={styles.row}>
      <View style={{ paddingTop: variant === 'title' ? 3 : 1 }}>
        <Icon name={icon} size={size} color={color ?? (muted ? p.textSecondary : p.text)} />
      </View>
      <Txt variant={variant} color={color} style={styles.text}>
        {children}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  text: { flex: 1 },
});
