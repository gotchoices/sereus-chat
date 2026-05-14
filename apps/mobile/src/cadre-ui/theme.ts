/**
 * theme.ts — color tokens for CadreManager and friends.
 *
 * All visible colors are tokens.  Apps override by passing a `theme` prop
 * to <CadreManager />; missing tokens fall back to the defaults below.
 *
 * Spacing/sizing are intentionally NOT in the token set — they're layout
 * concerns, not branding, and apps shouldn't need to override them.
 */

import { createContext, useContext } from 'react';

export interface CadreManagerTheme {
  /** Page background. */
  background: string;
  /** Card / row background. */
  surface: string;
  /** Card border. */
  border: string;
  /** Primary text color (titles, ids). */
  textPrimary: string;
  /** Secondary text (subtitles, status labels, hints). */
  textSecondary: string;
  /** Muted text (loading state, deemphasised metadata). */
  textMuted: string;
  /** Accent (add buttons, primary CTA). */
  accent: string;
  /** Accent text on accent backgrounds. */
  accentText: string;
  /** Destructive actions (remove, error). */
  danger: string;
  /** Online status dot. */
  online: string;
  /** Section header label color. */
  sectionLabel: string;
  /** Modal backdrop overlay. */
  backdrop: string;
}

export const DEFAULT_THEME: CadreManagerTheme = {
  background: '#fff',
  surface: '#fff',
  border: '#e2e2e2',
  textPrimary: '#111',
  textSecondary: '#666',
  textMuted: '#888',
  accent: '#0066cc',
  accentText: '#fff',
  danger: '#c4392f',
  online: '#2c8a3f',
  sectionLabel: '#666',
  backdrop: 'rgba(0,0,0,0.4)',
};

export function resolveTheme(overrides?: Partial<CadreManagerTheme>): CadreManagerTheme {
  return overrides ? { ...DEFAULT_THEME, ...overrides } : DEFAULT_THEME;
}

export const CadreThemeContext = createContext<CadreManagerTheme>(DEFAULT_THEME);

export function useCadreTheme(): CadreManagerTheme {
  return useContext(CadreThemeContext);
}
