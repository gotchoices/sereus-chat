import type { NativeScriptConfig } from '@nativescript/core';

// The NativeScript twin of apps/mobile (docs/app-family.md, `mobile-ns`): same core, a
// different engine (V8 on Android). Its own app id, so it installs beside the RN app.
export default {
	id: 'org.sereus.chat.ns',
	appPath: 'app',
	appResourcesPath: 'App_Resources',
	android: {
		v8Flags: '--expose_gc',
		markingMode: 'none',
		suppressCallJSMethodExceptions: false,
	},
} as NativeScriptConfig;
