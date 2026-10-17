/** Accessible building blocks. Large touch targets (≥ 48 dp), dynamic type, colour + text for state. */
import { useEffect, type ReactNode } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, MaxContentWidth, Radius, Spacing, toneColors, type StatusTone } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { Icon, type IconName } from '@/ui/icon';
import { EASE, ENTER, ICON_IN, ICON_OUT, LAYOUT, PressableScale, tick } from '@/ui/motion';

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
      <ScrollView contentContainerStyle={[styles.screen, { paddingBottom: Spacing.xxl + (footer ? 0 : insets.bottom) }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
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
    <Animated.View layout={LAYOUT} style={[styles.card, { backgroundColor: toned?.bg ?? p.surface, borderColor: toned ? `${toned.fg}33` : p.border }, style]}>
      {children}
    </Animated.View>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <Animated.View entering={ENTER} layout={LAYOUT} style={styles.section}>
      <View style={styles.sectionHeader}>
        <Txt variant="h2" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Txt>
        {right}
      </View>
      {children}
    </Animated.View>
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

/** A soft beige panel that opens a screen: icon, headline and an optional line under it. */
export function Hero({ icon, title, body, image, children }: { icon: IconName; title: string; body?: string; image?: ReactNode; children?: ReactNode }) {
  const p = usePalette();
  return (
    <View style={[styles.hero, { backgroundColor: p.hero }]}>
      {image ?? (
        <View style={[styles.heroIcon, { backgroundColor: p.surface }]}>
          <Icon name={icon} size={28} color={p.primary} />
        </View>
      )}
      <Txt variant="title" accessibilityRole="header">
        {title}
      </Txt>
      {body ? <Txt color={p.textSecondary}>{body}</Txt> : null}
      {children}
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
  const inactive = disabled || loading;
  const filled = kind === 'primary' || kind === 'danger';
  const pressedBg = kind === 'primary' ? p.primaryPressed : kind === 'danger' ? p.dangerPressed : p.primarySoft;
  const restBg = kind === 'primary' ? p.primary : kind === 'danger' ? p.danger : 'transparent';
  // If-style disabled: a flat grey fill (filled) or grey outline, not a faded copy of the live button.
  const fg = disabled && !loading ? (filled ? p.onPrimary : p.textSecondary) : filled ? p.onPrimary : p.primary;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        kind === 'ghost' ? styles.ghost : null,
        {
          backgroundColor: disabled && !loading && filled ? p.disabledBg : pressed ? pressedBg : restBg,
          borderColor: kind === 'secondary' ? (disabled ? p.borderStrong : p.primary) : 'transparent',
        },
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </PressableScale>
  );
}

export interface ChoiceOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** Single-choice chips (radio group). */
export function Choice<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: ChoiceOption<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
      {options.map((o) => (
        <ChoiceChip
          key={String(o.value)}
          label={o.label}
          selected={o.value === value}
          disabled={disabled || o.disabled}
          onPress={() => {
            if (o.value !== value) tick();
            onChange(o.value);
          }}
        />
      ))}
    </View>
  );
}

/** One chip: colours cross-fade on select and the check fades in, so a toggle reads as a change, not a jump. */
function ChoiceChip({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const p = usePalette();
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.set(withTiming(selected ? 1 : 0, EASE));
  }, [on, selected]);
  const colors = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.get(), [0, 1], [p.surface, p.primarySoft]),
    borderColor: interpolateColor(on.get(), [0, 1], [p.borderStrong, p.primary]),
  }));
  const textColor = useAnimatedStyle(() => ({ color: interpolateColor(on.get(), [0, 1], [p.text, p.primary]) }));
  return (
    <PressableScale
      scaleTo={0.95}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected, disabled }}
      aria-checked={selected}
      disabled={disabled}
      onPress={onPress}
      containerStyle={{ opacity: disabled && !selected ? 0.5 : 1 }}>
      <Animated.View style={[styles.chip, colors]}>
        {selected ? (
          <Animated.View entering={ICON_IN} exiting={ICON_OUT}>
            <Icon name="check" size={18} color={p.primary} />
          </Animated.View>
        ) : null}
        <Animated.Text style={[styles.chipText, textColor, { fontFamily: selected ? Fonts.semibold : Fonts.medium }]}>{label}</Animated.Text>
      </Animated.View>
    </PressableScale>
  );
}

/** A tappable card row used for navigation. Pass `accessibilityLabel` when `right` carries status the label must include. */
export function NavCard({
  title,
  subtitle,
  onPress,
  right,
  tone,
  accessibilityLabel,
  leading,
  below,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  right?: ReactNode;
  /** Shown before the title, e.g. a photo thumbnail. */
  leading?: ReactNode;
  /** Shown under the title (badges): keeps the title full width on narrow phones. */
  below?: ReactNode;
  tone?: StatusTone;
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  const toned = tone ? toneColors(p, tone) : undefined;
  return (
    <PressableScale
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)}
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.navCard, { backgroundColor: pressed ? p.surfaceAlt : (toned?.bg ?? p.surface), borderColor: toned ? `${toned.fg}33` : p.border }]}>
      {leading}
      <View style={{ flex: 1, gap: Spacing.xs }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {subtitle ? <Txt variant="small">{subtitle}</Txt> : null}
        {below}
      </View>
      {right}
      <Icon name="chevron" size={20} color={p.textSecondary} />
    </PressableScale>
  );
}

/* ---------- badges ---------- */

export function Badge({ label, tone, icon }: { label: string; tone: StatusTone; icon?: IconName }) {
  const p = usePalette();
  const c = toneColors(p, tone);
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]} accessible accessibilityLabel={label}>
      {icon ? <Icon name={icon} size={15} color={c.fg} /> : null}
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // If-style type: large, medium-weight headings; regular body text.
  title: { fontFamily: Fonts.semibold, fontSize: 30, lineHeight: 38, letterSpacing: -0.4 },
  h2: { fontFamily: Fonts.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  body: { fontFamily: Fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: Fonts.semibold, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: Fonts.regular, fontSize: 13, lineHeight: 18 },
  hero: { borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.md },
  heroIcon: { width: 52, height: 52, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  screen: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, alignItems: 'center' },
  column: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.lg },
  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm },
  navCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg + 2 },
  section: { gap: Spacing.md, marginTop: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md },
  button: { minHeight: 52, borderRadius: Radius.md, borderWidth: 1.5, paddingHorizontal: Spacing.xl, alignItems: 'center', justifyContent: 'center' },
  ghost: { minHeight: 44 },
  buttonText: { fontFamily: Fonts.semibold, fontSize: 16, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs + 2, borderRadius: Radius.pill, borderWidth: 1.5, paddingHorizontal: Spacing.lg },
  chipText: { fontSize: 15 },
  badge: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  badgeText: { fontFamily: Fonts.semibold, fontSize: 13, lineHeight: 18, flexShrink: 1 },
});
