/**
 * ThemeProvider — app-wide semantic color tokens with system/light/dark
 * selection, persisted to AsyncStorage.
 *
 * Token names follow `design/specs/mobile/global/ui.md` → "Colors (semantic tokens)";
 * the values are the shared tokens in `@chat/resources`, so every app's palette matches.  Screens and
 * shared components reference tokens by name only — never raw hex.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@chat/resources';
import { STORAGE_KEYS } from '../data/persisted-names';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Theme {
  /** Page background. */
  background: string;
  /** Default content background (headers, sheets). */
  surface: string;
  /** One step off `background`: cards, incoming message bubbles, inputs. */
  surfaceAlt: string;
  /** Titles, names, primary body text. */
  textPrimary: string;
  /** Subtitles, previews, secondary labels. */
  textSecondary: string;
  /** De-emphasised metadata, placeholders, disabled text. */
  textMuted: string;
  /** Card / control borders. */
  border: string;
  /** Hairline list dividers. */
  divider: string;
  /** Brand color; outgoing message bubble fill; primary CTA. */
  accent: string;
  /** Text/icon on `accent` fills. */
  accentText: string;
  /** Positive / online status. */
  success: string;
  /** Destructive actions, errors, unread badge. */
  danger: string;
  /** Error banner background. */
  bannerError: string;
  /** Modal / sheet backdrop scrim. */
  overlay: string;
}

// The values are the shared design tokens (@chat/resources, tokens/colors.json).
const lightTheme: Theme = colors.light;
const darkTheme: Theme = colors.dark;

interface ThemeContextValue {
  theme: Theme;
  /** Effective scheme after resolving `system`. */
  scheme: 'light' | 'dark';
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_STORAGE_KEY = STORAGE_KEYS.themeMode;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setThemeModeState(stored);
        }
      } catch (e) {
        console.warn('[theme] failed to load theme preference:', e);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  };

  const resolved = themeMode === 'system' ? systemScheme : themeMode;
  const scheme: 'light' | 'dark' = resolved === 'dark' ? 'dark' : 'light';

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: scheme === 'dark' ? darkTheme : lightTheme,
      scheme,
      themeMode,
      setThemeMode,
    }),
    [scheme, themeMode],
  );

  // Avoid a flash of the wrong theme before the stored preference loads.
  if (!isLoaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used within ThemeProvider');
  return ctx;
}
