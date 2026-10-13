/**
 * Theme access + the type/spacing scales from `global/ui.md` → "Tokens".
 * Import these instead of hard-coding font sizes or padding.
 */

import { layout } from '@chat/resources';
import { useThemeContext } from './ThemeProvider';

export type { Theme, ThemeMode } from './ThemeProvider';
export { ThemeProvider, useThemeContext } from './ThemeProvider';

/** The active color-token set. */
export function useTheme() {
  return useThemeContext().theme;
}

// The scales are the shared design tokens (@chat/resources, tokens/layout.json), mapped
// onto React Native style values here.

/** Typography scale (ui.md). */
export const typography = {
  title: { fontSize: layout.type.title.size, fontWeight: String(layout.type.title.weight) as '600' },
  body: { fontSize: layout.type.body.size, fontWeight: String(layout.type.body.weight) as '400' },
  small: { fontSize: layout.type.small.size, fontWeight: String(layout.type.small.weight) as '400' },
};

/** Spacing scale (ui.md): spacing[0]=4 … spacing[5]=24. */
export const spacing = layout.spacing;

/** Card / surface radius; pills use `radius.pill`. */
export const radius = layout.radius;

/** Minimum interactive target (a11y — ui.md). */
export const HIT_SLOP = { top: layout.hitSlop, bottom: layout.hitSlop, left: layout.hitSlop, right: layout.hitSlop } as const;
