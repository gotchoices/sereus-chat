/**
 * Entry point. The polyfills (sereus's reference-app-ns set) MUST load before any
 * cadre/libp2p code: libp2p and its dependencies reference Web APIs at import time.
 */
import '../src/polyfills';

import { Application } from '@nativescript/core';
import { runPolyfillAudit } from '../src/polyfills/audit';

runPolyfillAudit();

Application.run({ moduleName: 'app-root' });
