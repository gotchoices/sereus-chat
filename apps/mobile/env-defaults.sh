#!/bin/sh
# env-defaults.sh — per-project, override-friendly emulator/Metro settings.
#
# SOURCE this (don't execute it) so the vars carry into the calling shell —
# the package.json scripts do exactly that, e.g.:
#     . ./env-defaults.sh && react-native start --port "$METRO_PORT"
#
# Precedence, lowest to highest:
#   1. the defaults below                   — applied only when the var is unset/empty
#   2. .env.ports.local at the project root — git-ignored; the project's real settings
#   3. TARGET_* on the command line         — a deliberate one-off, see below
#
# WHY NOT "anything already exported wins".  That was the rule here until it caused a
# genuinely confusing failure: a terminal that had sourced this file BEFORE
# .env.ports.local changed still had the old METRO_PORT exported, so `yarn start` in
# that terminal silently bound the OLD port while every other tool used the new one.
# The app then could not find Metro, and nothing said why.  A shell cannot tell a
# deliberate `METRO_PORT=… yarn …` from a stale leftover — they are the same thing —
# so the override moved to names nothing ever exports by accident.

: "${METRO_PORT:=8081}"
: "${EMULATOR_PORT:=5554}"
: "${DEVICE_SERIAL:=emulator-5554}"
: "${AVD_NAME:=Pixel_A}"

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
#   TARGET_DEVICE=6a61c968 yarn android     install to the phone, not the emulator
#   TARGET_METRO_PORT=8090 yarn start       run Metro somewhere else, just this once
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
fi

export METRO_PORT EMULATOR_PORT DEVICE_SERIAL AVD_NAME ANDROID_SERIAL
