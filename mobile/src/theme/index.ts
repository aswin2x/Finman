import { categoryPalette, gradients, layout, motion, palette, radius, shadow, spacing, typography } from './tokens';

export const theme = {
  color: palette,
  categoryPalette,
  gradients,
  spacing,
  radius,
  typography,
  shadow,
  motion,
  layout,
} as const;

export type Theme = typeof theme;
export type FinancialState = 'positive' | 'warning' | 'negative' | 'neutral';

/** Maps a signed amount to the colour that should carry it. */
export function amountColor(value: number, invert = false): string {
  if (value === 0) return palette.textSecondary;
  const good = invert ? value < 0 : value > 0;
  return good ? palette.positive : palette.negative;
}

/** Maps budget usage to a state colour, mirroring the backend's thresholds. */
export function stateColor(state: FinancialState | string): string {
  switch (state) {
    case 'positive':
    case 'on_track':
      return palette.positive;
    case 'warning':
      return palette.warning;
    case 'negative':
    case 'over':
      return palette.negative;
    default:
      return palette.neutral;
  }
}

export function stateSoftColor(state: FinancialState | string): string {
  switch (state) {
    case 'positive':
    case 'on_track':
      return palette.positiveSoft;
    case 'warning':
      return palette.warningSoft;
    case 'negative':
    case 'over':
      return palette.negativeSoft;
    default:
      return palette.neutralSoft;
  }
}

export { categoryPalette, gradients, layout, motion, palette, radius, shadow, spacing, typography };
