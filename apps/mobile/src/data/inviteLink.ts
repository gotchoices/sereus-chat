/**
 * inviteLink.ts — the ONE place that defines chat's invitation URL shape.
 *
 * Primary (shared) form is an Android App Link / iOS Universal Link:
 *   https://sereus.org/chat/invite/<token>
 * If the recipient has the app installed, the OS opens it directly; if not, the
 * link loads the web landing page at that URL (download prompt). This is the
 * form the generator emits and shares (QR, text, email).
 *
 * Path-based on the existing `sereus.org` host (rather than a `chat.sereus.org`
 * subdomain) so it reuses the site's TLS cert / vhost — see the design decision
 * in ../../../web/README.md.  The two verification files therefore live at the
 * APEX (`sereus.org/.well-known/`), shared with other Sereus apps.
 *
 * A custom-scheme fallback is also accepted on the parse side:
 *   chat://invite/<token>
 * It only works when the app is already installed (no OS verification needed),
 * so it's handy for same-device / pre-domain testing.
 *
 * Generator, QR scanner, and the navigator linking config all go through here,
 * so the scheme can never drift out of sync across the app again.
 */

/** Web host that owns the App Link / Universal Link. */
export const INVITE_HOST = 'sereus.org';
/** Path under the host that routes to invitations (also the App-Link pathPrefix). */
export const INVITE_PATH_PREFIX = '/chat/invite';
/** Custom URI scheme fallback (app-installed only). */
export const INVITE_APP_SCHEME = 'chat';

const HTTPS_PREFIX = `https://${INVITE_HOST}${INVITE_PATH_PREFIX}/`;
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
