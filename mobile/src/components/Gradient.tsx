/**
 * Thin wrapper over expo-linear-gradient.
 *
 * The library types `colors` as a fixed tuple, which makes the shared token
 * arrays awkward to pass around. This keeps the cast in one place.
 */
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient';
import React from 'react';

type GradientTuple = readonly [string, string, ...string[]];

export interface GradientProps extends Omit<LinearGradientProps, 'colors'> {
  colors: readonly string[];
}

export function Gradient({ colors, ...rest }: GradientProps) {
  return <LinearGradient colors={colors as unknown as GradientTuple} {...rest} />;
}

/** Diagonal start/end pair used by the ember surfaces. */
export const diagonal = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } as const;
export const horizontal = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } as const;
