/**
 * Theme access + the type/spacing scales from `global/ui.md` → "Tokens".
 * Import these instead of hard-coding font sizes or padding.
 */

import { useThemeContext } from './ThemeProvider';

export type { Theme, ThemeMode } from './ThemeProvider';
export { ThemeProvider, useThemeContext } from './ThemeProvider';

/** The active color-token set. */
export function useTheme() {
  return useThemeContext().theme;
}

/** Typography scale (ui.md). */
export const typography = {
  title: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  small: { fontSize: 12, fontWeight: '400' as const },
};

/** Spacing scale (ui.md): spacing[0]=4 … spacing[5]=24. */
export const spacing = [4, 8, 12, 16, 20, 24] as const;

/** Card / surface radius; pills use `radius.pill`. */
export const radius = {
  card: 12,
  bubble: 16,
  control: 8,
  pill: 999,
} as const;

/** Minimum interactive target (a11y — ui.md). */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
