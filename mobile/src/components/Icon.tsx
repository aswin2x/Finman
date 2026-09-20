/**
 * Icons.
 *
 * One line-weight family (Feather) used everywhere, at a fixed set of sizes,
 * always in ink. Named semantically so a screen asks for "expense" rather
 * than remembering which glyph stands in for it.
 */
import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { palette } from '../theme';

export type IconName =
  | 'home'
  | 'list'
  | 'target'
  | 'card'
  | 'trend'
  | 'plus'
  | 'minus'
  | 'close'
  | 'back'
  | 'forward'
  | 'up'
  | 'down'
  | 'search'
  | 'filter'
  | 'settings'
  | 'user'
  | 'calendar'
  | 'clock'
  | 'edit'
  | 'trash'
  | 'check'
  | 'alert'
  | 'info'
  | 'download'
  | 'upload'
  | 'refresh'
  | 'logout'
  | 'expense'
  | 'income'
  | 'wallet'
  | 'people'
  | 'repeat'
  | 'tag'
  | 'chevron';

const GLYPHS: Record<IconName, React.ComponentProps<typeof Feather>['name']> = {
  home: 'home',
  list: 'list',
  target: 'pie-chart',
  card: 'credit-card',
  trend: 'trending-up',
  plus: 'plus',
  minus: 'minus',
  close: 'x',
  back: 'arrow-left',
  forward: 'arrow-right',
  up: 'arrow-up-right',
  down: 'arrow-down-right',
  search: 'search',
  filter: 'sliders',
  settings: 'settings',
  user: 'user',
  calendar: 'calendar',
  clock: 'clock',
  edit: 'edit-2',
  trash: 'trash-2',
  check: 'check',
  alert: 'alert-circle',
  info: 'info',
  download: 'download',
  upload: 'upload',
  refresh: 'refresh-cw',
  logout: 'log-out',
  expense: 'arrow-up-right',
  income: 'arrow-down-left',
  wallet: 'credit-card',
  people: 'users',
  repeat: 'repeat',
  tag: 'tag',
  chevron: 'chevron-right',
};

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 18, color = palette.inkSecondary, style }: Props) {
  return <Feather name={GLYPHS[name]} size={size} color={color} style={style} />;
}
