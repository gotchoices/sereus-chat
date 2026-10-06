#!/usr/bin/env sh
# android.sh — build once, install to every device in DEVICES, launch on each.
#
#   sh ./scripts/android.sh [--active-arch-only] [other run-android flags]
#
# `react-native run-android --deviceId X` handles ONE device: it installs, sets up
# `adb reverse` for Metro and launches the app on X alone. Gradle's installDebug,
# which does the actual install, honors a comma-separated ANDROID_SERIAL — so the
# set is installed in a single build by handing Gradle the whole list, and the
# reverse + launch the CLI only does for X is repeated here for the rest.
#
# Settings come from env-defaults.sh / .env.ports.local (see the README's
# "Devices and ports"). The set is DEVICES; DEVICE_SERIAL is the primary.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
APP_DIR=$(cd "$HERE/.." && pwd)
cd "$APP_DIR"
. ./env-defaults.sh

PATH="$APP_DIR/node_modules/.bin:${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools:$PATH"
EMULATOR="${ANDROID_HOME:-$HOME/Library/Android/sdk}/emulator/emulator"
APP_ID=$(sed -n 's/^[[:space:]]*applicationId[[:space:]]*"\([^"]*\)".*/\1/p' android/app/build.gradle | head -1)
OWN_EMU="emulator-$EMULATOR_PORT"
: "${BOOT_TIMEOUT:=240}"

online() {
  adb devices | awk -v s="$1" '$1 == s && $2 == "device" { found = 1 } END { exit !found }'
}

# Boot this project's own AVD — the only emulator whose AVD we know — and wait
# until Android has finished booting, not merely until adb sees it: installing
# into a half-booted emulator fails as "Unknown API Level".
boot_own_emulator() {
  mkdir -p tmp
  echo "==> booting $AVD_NAME on $OWN_EMU (log: tmp/emulator.log)"
  nohup "$EMULATOR" -avd "$AVD_NAME" -port "$EMULATOR_PORT" >tmp/emulator.log 2>&1 &
  _t=0
  until [ "$(adb -s "$OWN_EMU" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
    _t=$((_t + 2))
    if [ "$_t" -ge "$BOOT_TIMEOUT" ]; then
      echo "    $OWN_EMU did not finish booting in ${BOOT_TIMEOUT}s — see tmp/emulator.log" >&2
      return 1
    fi
    sleep 2
  done
  echo "    $OWN_EMU booted"
}

TARGETS=''
SKIPPED=''
for s in $DEVICES; do
  if online "$s"; then
    TARGETS="$TARGETS $s"
  elif [ "$s" = "$OWN_EMU" ] && boot_own_emulator; then
    TARGETS="$TARGETS $s"
  else
    SKIPPED="$SKIPPED $s"
  fi
done
TARGETS=$(echo "$TARGETS" | xargs)
[ -n "$SKIPPED" ] && echo "    skipped (not attached):$SKIPPED" >&2
if [ -z "$TARGETS" ]; then
  echo "No device in DEVICES ($DEVICES) is available." >&2
  exit 1
fi

# The primary gets the CLI's own reverse + launch; prefer DEVICE_SERIAL.
PRIMARY=''
for s in $TARGETS; do [ "$s" = "$DEVICE_SERIAL" ] && PRIMARY=$s; done
[ -z "$PRIMARY" ] && PRIMARY=${TARGETS%% *}

# --active-arch-only asks the CLI for the PRIMARY's ABI only, which leaves an x86_64
# emulator build with nothing to install on an arm64 phone. Build the union of the
# set's ABIs instead.
ARCH_ARGS=''
for a in "$@"; do
  shift
  if [ "$a" = --active-arch-only ]; then
    _abis=''
    for s in $TARGETS; do
      _abis="$_abis $(adb -s "$s" shell getprop ro.product.cpu.abi | tr -d '\r')"
    done
    ARCH_ARGS="-PreactNativeArchitectures=$(echo "$_abis" | tr ' ' '\n' | sed '/^$/d' | sort -u | paste -sd, -)"
  else
    set -- "$@" "$a"
  fi
done

echo "==> installing to: $TARGETS (primary $PRIMARY)${ARCH_ARGS:+, $ARCH_ARGS}"
ANDROID_SERIAL=$(echo "$TARGETS" | tr ' ' ',') \
  react-native run-android --port "$METRO_PORT" --deviceId "$PRIMARY" \
  ${ARCH_ARGS:+--extra-params "$ARCH_ARGS"} "$@"

for s in $TARGETS; do
  [ "$s" = "$PRIMARY" ] && continue
  adb -s "$s" reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT" >/dev/null
  adb -s "$s" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  echo "    $s: metro reversed on $METRO_PORT, $APP_ID launched"
done
