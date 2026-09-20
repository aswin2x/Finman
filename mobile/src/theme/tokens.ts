/**
 * Design tokens. Every colour, radius, space and type style in the app comes
 * from here. Nothing should hardcode a hex value outside this file.
 *
 * Direction: dark-first, calm and minimal. A warm ember gradient carries
 * emphasis; financial values stay in legible neutrals so numbers read first
 * and decoration second.
 */

export const palette = {
  // Backgrounds, darkest to lightest.
  void: '#0A0A0C',
  base: '#0E0F13',
  surface: '#16181F',
  surfaceRaised: '#1D2029',
  surfaceHigh: '#252935',
  hairline: '#2B2F3C',

  // Text.
  textPrimary: '#F5F6F8',
  textSecondary: '#A3A8B8',
  textTertiary: '#6E7486',
  textInverse: '#0A0A0C',

  // Warm accent taken from the reference's ember gradient.
  ember: '#FF6B4A',
  emberBright: '#FF8A5B',
  emberDeep: '#E8452F',
  emberSoft: 'rgba(255, 107, 74, 0.14)',
  emberGlow: 'rgba(255, 107, 74, 0.28)',

  // Financial states. Chosen to stay legible on the dark surfaces above.
  positive: '#3DD68C',
  positiveSoft: 'rgba(61, 214, 140, 0.14)',
  warning: '#F5B544',
  warningSoft: 'rgba(245, 181, 68, 0.14)',
  negative: '#FF5A5A',
  negativeSoft: 'rgba(255, 90, 90, 0.14)',
  neutral: '#8A8F98',
  neutralSoft: 'rgba(138, 143, 152, 0.14)',
  info: '#5B8FF9',
  infoSoft: 'rgba(91, 143, 249, 0.14)',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(6, 7, 10, 0.72)',
} as const;

/** Category swatches, kept apart from state colours so meaning never blurs. */
export const categoryPalette = [
  '#FF6B4A',
  '#F2A65A',
  '#5B8FF9',
  '#9B8AFB',
  '#FF8A65',
  '#EC4899',
  '#34D399',
  '#FBBF24',
  '#F87171',
  '#38BDF8',
  '#C084FC',
  '#8A8F98',
] as const;

export const gradients = {
  ember: ['#FF8A5B', '#FF6B4A', '#E8452F'] as const,
  emberSubtle: ['rgba(255, 138, 91, 0.22)', 'rgba(232, 69, 47, 0.06)'] as const,
  card: ['#1E212B', '#16181F'] as const,
  screen: ['#0E0F13', '#0A0A0C'] as const,
  positive: ['#3DD68C', '#1FA968'] as const,
  negative: ['#FF7A7A', '#E23B3B'] as const,
  glass: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.01)'] as const,
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 44,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/**
 * Type scale. `numeric` styles use tabular figures so digits do not jitter
 * while a value animates.
 */
export const typography = {
  display: { fontSize: 44, lineHeight: 50, fontWeight: '700' as const, letterSpacing: -1.2 },
  balance: { fontSize: 38, lineHeight: 44, fontWeight: '700' as const, letterSpacing: -1 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const, letterSpacing: -0.3 },
  subheading: { fontSize: 17, lineHeight: 23, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '500' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: '600' as const, letterSpacing: 0.6 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  glow: {
    shadowColor: palette.ember,
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  sheet: {
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -6 },
    elevation: 24,
  },
} as const;

/**
 * Motion. Durations are deliberately short: this is a tool people open many
 * times a day, so transitions must never feel like waiting.
 */
export const motion = {
  instant: 120,
  fast: 200,
  base: 280,
  slow: 420,
  counter: 900,
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 120, mass: 1 },
  stagger: 45,
} as const;

export const layout = {
  screenPadding: spacing.lg,
  cardPadding: spacing.lg,
  tabBarHeight: 64,
  headerHeight: 56,
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;
