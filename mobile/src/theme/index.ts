import {
  dataRamp,
  fonts,
  layout,
  motion,
  palette,
  radius,
  rampAt,
  shadow,
  spacing,
  typography,
} from './tokens';

export const theme = {
  color: palette,
  dataRamp,
  fonts,
  spacing,
  radius,
  typography,
  shadow,
  motion,
  layout,
} as const;

export type Theme = typeof theme;

/**
 * State is carried by ink weight and wording, never by hue.
 *
 * `emphasis` is for a figure that needs attention (over budget, money owed
 * out). `muted` recedes. Callers pair these with an explicit word such as
 * "over" or "left" so the meaning never rests on tone alone.
 */
export type Emphasis = 'strong' | 'normal' | 'muted';

export function inkFor(emphasis: Emphasis): string {
  switch (emphasis) {
    case 'strong':
      return palette.ink;
    case 'muted':
      return palette.inkTertiary;
    default:
      return palette.inkSecondary;
  }
}

export function fontFor(emphasis: Emphasis): string {
  return emphasis === 'strong' ? fonts.semibold : fonts.regular;
}

/** Budget and debt states map to ink weight, with the label doing the talking. */
export function stateInk(state: string): string {
  return state === 'over' ? palette.ink : state === 'warning' ? palette.inkSecondary : palette.inkTertiary;
}

export function stateFont(state: string): string {
  return state === 'over' ? fonts.semibold : fonts.medium;
}

/** The fill for a progress bar. Over-budget reads darkest. */
export function stateFill(state: string): string {
  return state === 'over' ? palette.ink : state === 'warning' ? '#5C5C5C' : '#8A8A8E';
}

export { dataRamp, fonts, layout, motion, palette, radius, rampAt, shadow, spacing, typography };
