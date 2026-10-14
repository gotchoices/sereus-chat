/**
 * Entry point. The polyfills (sereus's reference-app-ns set plus chat's) MUST load before
 * any cadre/libp2p code: libp2p and its dependencies reference Web APIs at import time.
 *
 * Invitation links arrive as `chatns://invite/<token>` (its own scheme, so the RN app and
 * this one never compete for `chat://`).
 */
import '../src/polyfills';

import { AndroidApplication, Application, Frame } from '@nativescript/core';
import { runPolyfillAudit } from '../src/polyfills/audit';
import { boot, setPendingInvitation } from '../src/model';

runPolyfillAudit();

function tokenFrom(intent: android.content.Intent | null | undefined): string | null {
  const data = intent?.getData?.();
  if (!data) return null;
  const m = /^chatns:\/\/invite\/(.+)$/.exec(String(data.toString()));
  return m ? decodeURIComponent(m[1]) : null;
}

function openInvitation(token: string): void {
  const frame = Frame.topmost();
  if (frame?.currentPage) frame.navigate({ moduleName: 'invitation-page', context: { token } });
  else setPendingInvitation(token); // the strand list opens it once it is up
}

if (Application.android) {
  Application.android.on(AndroidApplication.activityCreatedEvent, args => {
    const token = tokenFrom((args as unknown as { activity: android.app.Activity }).activity.getIntent());
    if (token) setPendingInvitation(token);
  });
  Application.android.on(AndroidApplication.activityNewIntentEvent, args => {
    const token = tokenFrom((args as unknown as { intent: android.content.Intent }).intent);
    if (token) openInvitation(token);
  });
}

// SQLite opens through the activity (`activity.openOrCreateDatabase`), so the node starts
// once there is one.
Application.on(Application.launchEvent, () => { void boot().catch(() => {}); });
Application.run({ moduleName: 'app-root' });
