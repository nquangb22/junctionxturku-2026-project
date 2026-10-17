/**
 * Design tokens. Status is never colour alone: StatusPill always pairs colour with an icon and a word.
 * Text/background pairs are chosen for WCAG AA contrast in both schemes.
 */
import type { VerdictLevel, VerificationStatus } from '@firstcar/core';

import type { IconName } from '@/ui/icon';

/**
 * Warm palette after If's design system (if.fi "IDS"): cream backgrounds, dark-brown text, one strong blue for
 * actions. Status colours are If's feedback/alert pairs.
 */
export const Colors = {
  light: {
    text: '#331E11',
    textSecondary: '#6E625E',
    background: '#FAF9F7',
    surface: '#FFFFFF',
    surfaceAlt: '#F1ECE8',
    border: '#E8E0D9',
    borderStrong: '#D6CEC8',
    primary: '#0054F0',
    primaryPressed: '#1241A2',
    primarySoft: '#E1E9F6',
    onPrimary: '#FFFFFF',
    disabledBg: '#B7AEA8',
    danger: '#BB320C',
    dangerPressed: '#812308',
    dangerBg: '#F9E3D4',
    warning: '#7A4A00',
    warningBg: '#F9EBC7',
    success: '#217331',
    successBg: '#E0F0DB',
    info: '#1241A2',
    infoBg: '#E1E9F6',
    neutralBg: '#F1ECE8',
    highlight: '#F6DB8E',
    hero: '#F1ECE8',
  },
  dark: {
    text: '#FAF9F7',
    textSecondary: '#B7AEA8',
    background: '#1B120C',
    surface: '#271B13',
    surfaceAlt: '#33251B',
    border: '#3F3026',
    borderStrong: '#5A4A3F',
    primary: '#8DB0F5',
    primaryPressed: '#A8C2F0',
    primarySoft: '#1E2B45',
    onPrimary: '#1B120C',
    disabledBg: '#6E625E',
    danger: '#F1B398',
    dangerPressed: '#F9E3D4',
    dangerBg: '#3E1D10',
    warning: '#F2C86A',
    warningBg: '#3A2B0F',
    success: '#9BD3A5',
    successBg: '#17301D',
    info: '#A8C2F0',
    infoBg: '#1E2B45',
    neutralBg: '#33251B',
    highlight: '#5C4A12',
    hero: '#33251B',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** If's radii: small details 4, buttons and inputs 6, cards 12. */
export const Radius = { sm: 4, md: 6, lg: 12, pill: 999 } as const;
export const MaxContentWidth = 720;

/** Figtree stands in for If Sans (proprietary). Custom fonts pick weight by family, never by fontWeight. */
export const Fonts = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
} as const;

export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export const STATUS_TONE: Record<VerificationStatus, StatusTone> = {
  verified: 'success',
  not_verified: 'danger',
  needs_inspection: 'warning',
  awaiting_evidence: 'info',
  unchecked: 'neutral',
};

export const STATUS_ICON: Record<VerificationStatus, IconName> = {
  verified: 'check',
  not_verified: 'cross',
  needs_inspection: 'wrench',
  awaiting_evidence: 'clock',
  unchecked: 'circle',
};

export function toneColors(p: Palette, tone: StatusTone): { fg: string; bg: string } {
  switch (tone) {
    case 'success':
      return { fg: p.success, bg: p.successBg };
    case 'danger':
      return { fg: p.danger, bg: p.dangerBg };
    case 'warning':
      return { fg: p.warning, bg: p.warningBg };
    case 'info':
      return { fg: p.info, bg: p.infoBg };
    case 'neutral':
      return { fg: p.textSecondary, bg: p.neutralBg };
  }
}

export const VERDICT_TONE: Record<VerdictLevel, StatusTone> = {
  comfortable: 'success',
  manageable: 'info',
  tight: 'warning',
  over_budget: 'danger',
  unknown: 'neutral',
};
