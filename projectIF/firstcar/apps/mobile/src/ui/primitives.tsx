/** Accessible building blocks. Large touch targets (≥ 48 dp), dynamic type, colour + text for state. */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing, toneColors, type StatusTone } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

/* ---------- text ---------- */

type Variant = 'title' | 'h2' | 'body' | 'bodyStrong' | 'small' | 'caption';

export function Txt({ variant = 'body', color, style, ...rest }: TextProps & { variant?: Variant; color?: string }) {
  const p = usePalette();
  const muted = variant === 'small' || variant === 'caption';
  return <Text style={[styles[variant], { color: color ?? (muted ? p.textSecondary : p.text) }, style]} {...rest} />;
}

/* ---------- layout ---------- */

export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={[styles.screen, { paddingBottom: Spacing.xxl + (footer ? 0 : insets.bottom) }]} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { backgroundColor: p.surface, borderTopColor: p.border, paddingBottom: Spacing.md + insets.bottom }]}>
          <View style={styles.column}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: StatusTone }) {
  const p = usePalette();
  const toned = tone ? toneColors(p, tone) : undefined;
  return (
    <View style={[styles.card, { backgroundColor: toned?.bg ?? p.surface, borderColor: toned ? toned.fg : p.border }, style]}>
      {children}
    </View>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Txt variant="h2" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Txt>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const p = usePalette();
  return (
    <View style={[styles.row, { borderBottomColor: p.border }]} accessible accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}>
      <View style={{ flex: 1 }}>
        <Txt>{label}</Txt>
        {hint ? <Txt variant="caption">{hint}</Txt> : null}
      </View>
      <Txt variant="bodyStrong">{value}</Txt>
    </View>
  );
}

export const Gap = ({ size = Spacing.md }: { size?: number }) => <View style={{ height: size }} />;

/* ---------- controls ---------- */

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const p = usePalette();
  const bg = kind === 'primary' ? p.primary : kind === 'danger' ? p.danger : 'transparent';
  const fg = kind === 'primary' ? p.onPrimary : kind === 'danger' ? p.onPrimary : kind === 'secondary' ? p.primary : p.primary;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: kind === 'secondary' ? p.primary : 'transparent', opacity: inactive ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export interface ChoiceOption<T> {
  value: T;
  label: string;
}

/** Single-choice chips (radio group). */
export function Choice<T extends string | number | boolean>({ options, value, onChange, label }: { options: ChoiceOption<T>[]; value: T | undefined; onChange: (v: T) => void; label: string }) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, { backgroundColor: selected ? p.primary : p.surface, borderColor: selected ? p.primary : p.border }]}>
            <Text style={[styles.chipText, { color: selected ? p.onPrimary : p.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A tappable card row used for navigation. */
export function NavCard({ title, subtitle, onPress, right, tone }: { title: string; subtitle?: string; onPress: () => void; right?: ReactNode; tone?: StatusTone }) {
  const p = usePalette();
  const toned = tone ? toneColors(p, tone) : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.navCard, { backgroundColor: toned?.bg ?? p.surface, borderColor: toned?.fg ?? p.border, opacity: pressed ? 0.85 : 1 }]}>
      <View style={{ flex: 1, gap: Spacing.xs }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {subtitle ? <Txt variant="small">{subtitle}</Txt> : null}
      </View>
      {right}
      <Txt variant="h2" color={p.textSecondary} importantForAccessibility="no">
        ›
      </Txt>
    </Pressable>
  );
}

/* ---------- badges ---------- */

export function Badge({ label, tone, icon }: { label: string; tone: StatusTone; icon?: string }) {
  const p = usePalette();
  const c = toneColors(p, tone);
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.fg }]} accessible accessibilityLabel={label}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{icon ? `${icon} ${label}` : label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 13, lineHeight: 18 },
  screen: { padding: Spacing.lg, alignItems: 'center' },
  column: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.md },
  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.lg, gap: Spacing.sm },
  navCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  section: { gap: Spacing.sm, marginTop: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  button: { minHeight: 50, borderRadius: Radius.md, borderWidth: 1.5, paddingHorizontal: Spacing.lg, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 44, borderRadius: Radius.pill, borderWidth: 1.5, paddingHorizontal: Spacing.lg, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  badge: { alignSelf: 'flex-start', maxWidth: '100%', borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
});
