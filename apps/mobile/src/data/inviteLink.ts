/**
 * inviteLink.ts — the ONE place that defines chat's invitation URL shape.
 *
 * Primary (shared) form is an Android App Link / iOS Universal Link:
 *   https://chat.sereus.org/invite/<token>
 * If the recipient has the app installed, the OS opens it directly; if not, the
 * link loads the web landing page at that URL (download prompt). This is the
 * form the generator emits and shares (QR, text, email).
 *
 * A custom-scheme fallback is also accepted on the parse side:
 *   chat://invite/<token>
 * It only works when the app is already installed (no OS verification needed),
 * so it's handy for same-device / pre-domain testing.
 *
 * Generator, QR scanner, and the navigator linking config all go through here,
 * so the scheme can never drift out of sync across the app again.
 */

/** Web host that owns the App Link / Universal Link (see design decision). */
export const INVITE_HOST = 'chat.sereus.org';
/** Custom URI scheme fallback (app-installed only). */
export const INVITE_APP_SCHEME = 'chat';

const HTTPS_PREFIX = `https://${INVITE_HOST}/invite/`;
const SCHEME_PREFIX = `${INVITE_APP_SCHEME}://invite/`;

/** Build the shareable invitation URL for a token. */
export function buildInviteUrl(token: string): string {
  return `${HTTPS_PREFIX}${token}`;
}

/**
 * Extract the invitation token from a scanned/pasted string, accepting either
 * the https App Link or the chat:// fallback. Returns null if it isn't a
 * recognisable chat invitation URL.  base64url tokens are already URL-safe, so
 * no decoding is required; we still `decodeURIComponent` defensively.
 */
export function parseInviteToken(input: string): string | null {
  const s = input.trim();
  let rest: string | null = null;
  if (s.startsWith(HTTPS_PREFIX)) rest = s.slice(HTTPS_PREFIX.length);
  else if (s.startsWith(SCHEME_PREFIX)) rest = s.slice(SCHEME_PREFIX.length);
  if (rest === null) return null;
  const token = rest.split(/[?#]/)[0];
  if (!token) return null;
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
}
