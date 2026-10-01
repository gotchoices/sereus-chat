/**
 * inviteLink.ts — the ONE place that defines chat's invitation URL shape.
 *
 * Primary (shared) form is an Android App Link / iOS Universal Link:
 *   https://sereus.org/chat/invite/#<token>
 * If the recipient has the app installed, the OS opens it directly; if not, the
 * browser loads the static page at /chat/invite/ (download prompt), which reads
 * the token from after the `#` — see `buildInviteUrl` for why it is a fragment.
 * This is the form the generator emits and shares (QR, text, email).
 *
 * Path-based on the existing `sereus.org` host (rather than a `chat.sereus.org`
 * subdomain) so it reuses the site's TLS cert / vhost — see the design decision
 * in ../../../web/README.md.  The two verification files therefore live at the
 * APEX (`sereus.org/.well-known/`), shared with other Sereus apps.
 *
 * Older forms are still accepted on the parse side (see `parseInviteToken`),
 * including the path form `https://sereus.org/chat/invite/<token>` and these
 * custom schemes:
 *   sereus://invite/<token>   (canonical; every invitation minted before the
 *                              generator switched to https used it)
 *   chat://invite/<token>     (older alias)
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
/** Custom URI schemes (app-installed only). `sereus` is canonical; `chat` is the older alias. */
export const INVITE_APP_SCHEMES = ['sereus', 'chat'] as const;

const HTTPS_PREFIX = `https://${INVITE_HOST}${INVITE_PATH_PREFIX}/`;
const SCHEME_PREFIXES = INVITE_APP_SCHEMES.map(s => `${s}://invite/`);

/**
 * Build the shareable invitation URL: `https://sereus.org/chat/invite/#<token>`.
 *
 * THE INVITATION GOES AFTER `#`, NOT IN THE PATH OR A QUERY. With the app
 * installed the OS hands the link to the app and the server is never asked, so
 * the shape does not matter there. Without the app the browser requests it, and:
 *   - a path form (`/chat/invite/<token>`) names no file — it needs a server
 *     rewrite, which the host did not apply, so it was a 404;
 *   - a query (`?t=<token>`) is sent to the server and written to its access
 *     log, and an invitation is a bearer credential;
 *   - a fragment is never sent to the server at all. `/chat/invite/` is a plain
 *     static page (`web/invite/index.html`) that reads the token in the browser.
 * Android matches App Links on scheme/host/path and ignores the fragment, so the
 * existing `/chat/invite/` pathPrefix still claims these links.
 */
export function buildInviteUrl(token: string): string {
  return `${HTTPS_PREFIX}#${token}`;
}

/**
 * Extract the invitation token from a scanned/pasted string. Accepts every form
 * that has been handed out, newest first:
 *   https://sereus.org/chat/invite/#<token>    (current)
 *   https://sereus.org/chat/invite/<token>     (path form; links already sent)
 *   https://sereus.org/chat/invite/?t=<token>  (tolerated, never generated)
 *   sereus://invite/<token>, chat://invite/<token>
 * Returns null if it isn't a recognisable chat invitation URL. base64url tokens
 * are already URL-safe; `decodeURIComponent` is defensive.
 */
export function parseInviteToken(input: string): string | null {
  const s = input.trim();
  let token: string | null = null;
  if (s.startsWith(HTTPS_PREFIX)) {
    const rest = s.slice(HTTPS_PREFIX.length);
    const hash = rest.indexOf('#');
    if (hash >= 0) token = rest.slice(hash + 1);
    else {
      const [path, query] = rest.split('?');
      token = path || queryParam(query ?? '', 't');
    }
  } else {
    const prefix = SCHEME_PREFIXES.find(p => s.startsWith(p));
    if (prefix) token = s.slice(prefix.length).split(/[?#]/)[0];
  }
  if (!token) return null;
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
}

/** One query parameter's raw value — Hermes's URLSearchParams support has been uneven. */
function queryParam(q: string, name: string): string | null {
  for (const part of q.split('&')) {
    const [k, v] = part.split('=');
    if (k === name) return v ?? '';
  }
  return null;
}
