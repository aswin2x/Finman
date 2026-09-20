import type { TextStyle } from 'react-native';

/**
 * Design tokens.
 *
 * Direction: strict monochrome on paper white. No hue anywhere, no gradients,
 * no glow. Hierarchy comes from type scale, weight and whitespace; separation
 * comes from hairline rules rather than fills or shadows.
 *
 * Nothing outside this file should define a colour, a radius or a type style.
 */

export const palette = {
  // Surfaces, lightest first. Cards are white on white, separated by a rule.
  page: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSubtle: '#FAFAFA',
  surfaceSunken: '#F4F4F5',
  surfaceInverse: '#0A0A0A',

  // Rules. `border` is the default hairline; `borderStrong` marks emphasis.
  border: '#EAEAEA',
  borderStrong: '#D4D4D4',
  borderInverse: '#262626',

  // Ink.
  ink: '#0A0A0A',
  inkSecondary: '#525252',
  inkTertiary: '#8A8A8E',
  inkQuaternary: '#B4B4B8',
  inkInverse: '#FFFFFF',
  inkInverseSecondary: 'rgba(255,255,255,0.72)',
  inkInverseTertiary: 'rgba(255,255,255,0.52)',

  // Interaction. Black is the only accent.
  accent: '#0A0A0A',
  accentPressed: '#262626',
  accentSubtle: '#F4F4F5',

  overlay: 'rgba(10,10,10,0.32)',
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

/**
 * Ordered grays for categories and chart series: darkest carries the largest
 * value, so rank reads without hue. Assign by position, never at random.
 */
export const dataRamp = [
  '#0A0A0A',
  '#3D3D3D',
  '#5C5C5C',
  '#787878',
  '#949494',
  '#ABABAB',
  '#BFBFBF',
  '#D0D0D0',
  '#DEDEDE',
  '#E8E8E8',
] as const;

/** Picks a ramp shade by rank, darkest first, flattening once the ramp runs out. */
export function rampAt(index: number): string {
  return dataRamp[Math.min(index, dataRamp.length - 1)];
}

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  section: 36,
} as const;

/** Restrained corners. Nothing is a pill except controls that must read as tappable. */
export const radius = {
  xs: 4,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

/**
 * Google Sans Flex, one family per weight. React Native cannot synthesise a
 * weight for a custom font, so the family name carries it.
 */
export const fonts = {
  regular: 'GoogleSansFlex_400Regular',
  medium: 'GoogleSansFlex_500Medium',
  semibold: 'GoogleSansFlex_600SemiBold',
  bold: 'GoogleSansFlex_700Bold',
} as const;

/**
 * Type scale. Figures use tabular lining numerals so digits do not shift
 * while a value animates or a column scrolls.
 */
export const typography = {
  /** The one number a screen is about. */
  display: {
    fontFamily: fonts.bold,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1.4,
    fontVariant: ['tabular-nums'],
  },
  figure: {
    fontFamily: fonts.semibold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.7,
    fontVariant: ['tabular-nums'],
  },
  figureSmall: {
    fontFamily: fonts.medium,
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  title: { fontFamily: fonts.semibold, fontSize: 27, lineHeight: 33, letterSpacing: -0.7 },
  heading: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 25, letterSpacing: -0.4 },
  subheading: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  captionMedium: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  /** Small uppercase section labels. Apply textTransform at the call site. */
  label: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.7 },
  mono: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TextStyle>;

/**
 * Shadows are for things that genuinely float above the page. Cards do not
 * use them; a hairline does that job.
 */
export const shadow = {
  none: {},
  raised: {
    shadowColor: '#0A0A0A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sheet: {
    shadowColor: '#0A0A0A',
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
} as const;

/**
 * Motion. Short and quiet. This is a tool opened many times a day, so nothing
 * should feel like waiting, and nothing loops.
 */
export const motion = {
  instant: 110,
  fast: 180,
  base: 240,
  slow: 340,
  counter: 720,
  spring: { damping: 20, stiffness: 200, mass: 0.9 },
  stagger: 38,
} as const;

export const layout = {
  screenPadding: spacing.lg,
  tabBarHeight: 60,
  hairline: 1,
} as const;
