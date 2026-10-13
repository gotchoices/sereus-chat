/**
 * Deterministic display-name → avatar color.
 *
 * ui.md: "With no image, show the initial on a fill color derived (hashed) from
 * the display name — not a uniform gray."  Same name always yields the same
 * color, across sessions and devices.
 *
 * The palette is a fixed set of mid-saturation hues chosen to keep white text
 * legible (AA) in both light and dark themes; we don't vary lightness by theme
 * so a contact keeps a stable identity color.
 */
import { colors } from '@chat/resources';

const AVATAR_COLORS = colors.avatar; // shared tokens (@chat/resources)

/** Pick a stable avatar fill color for a display name. */
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    // Basic string hash; magnitude doesn't matter, only stability.
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

/** First visible character of a name, upper-cased; falls back to "?". */
export function avatarInitial(name: string | undefined | null): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}
