This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

## Devices and ports

[`env-defaults.sh`](env-defaults.sh) — sourced by every `yarn` script — carries the
stock React Native settings (Metro 8081, `emulator-5554`), so a fresh clone just
works. Anything specific to your bench goes in a git-ignored `.env.ports.local`
beside it. Running several sereus apps at once needs each to have its own slot:

```sh
METRO_PORT=8084
EMULATOR_PORT=5564
DEVICE_SERIAL="emulator-5564"          # primary device: launch, logs, deep links
AVD_NAME="C_Phone_API_37.1"
DEVICES="emulator-5564 6a61c968"       # optional: every device `yarn android` targets
```

- Console ports must be even and in 5554..5682 — the odd port above is the paired
  adb port. Each project needs its own `METRO_PORT` and `EMULATOR_PORT`.
- `DEVICES` lists raw adb serials (see `adb devices -l`), space-separated. Unset,
  it is just `DEVICE_SERIAL`. A physical phone may appear in several projects'
  sets — each app installs separately and reaches its own Metro port.

Precedence, lowest to highest: the defaults, `.env.ports.local`, then one-off
`TARGET_*` overrides on the command line (announced on stderr):

```sh
TARGET_DEVICE=6a61c968 yarn android             # just this phone, this once
TARGET_DEVICES="478db6f0 6a61c968" yarn android # both phones, this once
TARGET_METRO_PORT=8090 yarn start               # Metro elsewhere, this once
```

A plain exported `DEVICE_SERIAL` or `METRO_PORT` does *not* win — a stale export
left in a terminal is indistinguishable from an intended one.

Typical session:

```sh
yarn start             # Metro on METRO_PORT
yarn android           # build, install to every device in DEVICES, launch on each
yarn android:emu       # same, building only the ABIs those devices need (faster)
yarn emulator          # boot AVD_NAME on EMULATOR_PORT by hand (optional)
```

`yarn android` ([`scripts/android.sh`](scripts/android.sh)) boots this project's own
emulator (`emulator-$EMULATOR_PORT`) if it is in the set and not running, skips any
other listed device that is not attached (out loud), installs to the rest in one
Gradle run, then sets up `adb reverse` for Metro and launches the app on each.

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
yarn android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
yarn ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.

## Releasing an APK

A signed release build for side-loading, and the upload that puts it on
`sereus.org/chat/chat.apk`:

```sh
export STORE_FILE_CHAT=/path/to/chat.keystore   # already set on the dev machine
export STORE_PASSWORD_CHAT=...                  # not stored anywhere in the repo
export KEY_ALIAS_CHAT=org.sereus.chat           # optional; this is the default

yarn ship:apk        # build, then publish — stops if the build fails
```

Or the two halves separately: `yarn build:android:apk`, then `yarn publish:apk`.

`ship:apk` deliberately chains with `&&`: a failed build must not upload, or the
previous APK stays on the server looking like the new one.
