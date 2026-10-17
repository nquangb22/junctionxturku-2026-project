/**
 * Design tokens. Status is never colour alone: StatusPill always pairs colour with an icon and a word.
 * Text/background pairs are chosen for WCAG AA contrast in both schemes.
 */
import type { VerdictLevel, VerificationStatus } from '@firstcar/core';

export const Colors = {
  light: {
    text: '#111418',
    textSecondary: '#555D68',
    background: '#F6F7F9',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF0F3',
    border: '#D9DDE3',
    primary: '#1F5FD6',
    onPrimary: '#FFFFFF',
    danger: '#B42318',
    dangerBg: '#FDECEA',
    warning: '#8A5300',
    warningBg: '#FFF4DE',
    success: '#1B6E3A',
    successBg: '#E5F5EA',
    info: '#2E4A7D',
    infoBg: '#E8EEFA',
    neutralBg: '#EEF0F3',
    highlight: '#FFE9A8',
  },
  dark: {
    text: '#F2F4F7',
    textSecondary: '#AAB2BD',
    background: '#0E1114',
    surface: '#181C21',
    surfaceAlt: '#22272E',
    border: '#333A43',
    primary: '#7AA7FF',
    onPrimary: '#0E1114',
    danger: '#FF8A80',
    dangerBg: '#3A1714',
    warning: '#FFC266',
    warningBg: '#3A2A0D',
    success: '#7BD99A',
    successBg: '#12301D',
    info: '#A9C2F2',
    infoBg: '#1A2638',
    neutralBg: '#22272E',
    highlight: '#5C4A12',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const MaxContentWidth = 720;

export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export const STATUS_TONE: Record<VerificationStatus, StatusTone> = {
  verified: 'success',
  not_verified: 'danger',
  needs_inspection: 'warning',
  awaiting_evidence: 'info',
  unchecked: 'neutral',
};

export const STATUS_ICON: Record<VerificationStatus, string> = {
  verified: '✓',
  not_verified: '✕',
  needs_inspection: '🔧',
  awaiting_evidence: '…',
  unchecked: '○',
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
