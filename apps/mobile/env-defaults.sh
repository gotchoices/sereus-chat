#!/bin/sh
# env-defaults.sh — per-project, override-friendly emulator/Metro/device settings.
#
# The same file is carried by ser/chat, ser/health and ser/taleus; keep the copies
# identical except for the marked PROJECT-SPECIFIC section, so a fix made in one
# can be copied to the others wholesale. See the README's "Devices and ports".
#
# SOURCE this (don't execute it) so the vars carry into the calling shell —
# the package.json scripts do exactly that, e.g.:
#     . ./env-defaults.sh && react-native start --port "$METRO_PORT"
#
# Precedence, lowest to highest:
#   1. the defaults below                   — applied only when the var is unset/empty
#   2. .env.ports.local at the project root — git-ignored; this bench's real settings
#   3. TARGET_* on the command line         — a deliberate one-off, see below
#
# The defaults are the stock React Native / Android ones, so a fresh clone on any
# bench just works. Running this project alongside a sibling is what
# .env.ports.local is for — put the divergent ports there, not here.
#
# When choosing an emulator port: the console port must be EVEN and in 5554..5682;
# the odd port right above it is the paired adb port (so emulator-5554 speaks adb
# on 5555). 5555 is therefore not a legal console port — step by twos.
#
# WHY NOT "anything already exported wins".  That was once the rule, until it caused
# a genuinely confusing failure: a terminal that had sourced this file BEFORE
# .env.ports.local changed still had the old METRO_PORT exported, so `yarn start` in
# that terminal silently bound the OLD port while every other tool used the new one.
# The app then could not find Metro, and nothing said why.  A shell cannot tell a
# deliberate `METRO_PORT=… yarn …` from a stale leftover — they are the same thing —
# so the override moved to names nothing ever exports by accident.

: "${METRO_PORT:=8081}"
: "${EMULATOR_PORT:=5554}"
: "${DEVICE_SERIAL:=emulator-5554}"
: "${AVD_NAME:=Pixel_A}"

# DEVICES: every device `yarn android` (scripts/android.sh) installs to — raw adb
# serials, space-separated, e.g. DEVICES="emulator-5564 6a61c968". Empty means
# just DEVICE_SERIAL. Not defaulted here: a stale export must not leak in, so it
# is cleared and comes only from .env.ports.local or TARGET_DEVICES.
DEVICES=

# ── PROJECT-SPECIFIC ─────────────────────────────────────────────────────────
# (none)
# ── end PROJECT-SPECIFIC ─────────────────────────────────────────────────────

# (2): project-local settings, not committed. Sourced from the project root (the
# package.json scripts run there). The leading "./" is required: POSIX `.` searches
# PATH for a bare name, so `. ./.env.ports.local` sources the local file.
# Assigns plainly, so it beats the defaults above.
if [ -f ./.env.ports.local ]; then
  . ./.env.ports.local
fi

# (3): one-off overrides. Distinct names, never set by the file or by sourcing this,
# so a leftover cannot masquerade as an intention:
#
#   TARGET_DEVICE=6a61c968 yarn android               this phone only, not the set
#   TARGET_DEVICES="478db6f0 6a61c968" yarn android   this set instead of DEVICES
#   TARGET_METRO_PORT=8090 yarn start                 Metro somewhere else
#
# Announced on stderr: an override that changes which device or port you are acting
# on should never be silent.
if [ -n "${TARGET_METRO_PORT:-}" ]; then
  echo "env-defaults: METRO_PORT $METRO_PORT -> $TARGET_METRO_PORT (TARGET_METRO_PORT)" >&2
  METRO_PORT=$TARGET_METRO_PORT
fi
if [ -n "${TARGET_DEVICE:-}" ]; then
  echo "env-defaults: DEVICE_SERIAL $DEVICE_SERIAL -> $TARGET_DEVICE (TARGET_DEVICE)" >&2
  DEVICE_SERIAL=$TARGET_DEVICE
  # Naming one device means that device — not it plus the usual set.
  [ -z "${TARGET_DEVICES:-}" ] && DEVICES=$TARGET_DEVICE
fi
if [ -n "${TARGET_DEVICES:-}" ]; then
  echo "env-defaults: DEVICES ${DEVICES:-$DEVICE_SERIAL} -> $TARGET_DEVICES (TARGET_DEVICES)" >&2
  DEVICES=$TARGET_DEVICES
fi
DEVICES=$(echo "${DEVICES:-$DEVICE_SERIAL}" | tr ',' ' ' | xargs)

# ANDROID_SERIAL pins every adb and Gradle operation to ONE device.
#
# This is load-bearing, not a convenience. `react-native run-android` shells out to
# Gradle's `app:installDebug`, and that task installs to EVERY connected device --
# the CLI's own --deviceId flag is not passed through to it. So with phones on the
# cable and other projects' emulators up, an unpinned `yarn android` installs on all
# of them, and the whole build fails if ANY one is out of space or still booting.
# adb honors this variable too, so the launch/logs-style scripts inherit it.
#
# Gradle also accepts a comma-separated list here, which is how scripts/android.sh
# targets a multi-device DEVICES set — but only for its own Gradle run. adb rejects
# a list, so the exported value stays a single serial.
ANDROID_SERIAL=$DEVICE_SERIAL

export METRO_PORT EMULATOR_PORT DEVICE_SERIAL AVD_NAME DEVICES ANDROID_SERIAL
