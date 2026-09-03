#!/bin/sh
# env-defaults.sh — per-project, override-friendly emulator/Metro settings.
#
# SOURCE this (don't execute it) so the vars carry into the calling shell —
# the package.json scripts do exactly that, e.g.:
#     . ./env-defaults.sh && react-native start --port "$METRO_PORT"
#
# Precedence, lowest to highest:
#   1. the defaults below                    — applied only when the var is unset/empty
#   2. values already in the environment      — kept, because ${VAR:=default} won't clobber them
#   3. .env.ports.local at the project root   — git-ignored; sourced last, so it wins over both

# (1) + (2): defaults that yield to anything already exported.
: "${METRO_PORT:=8081}"
: "${EMULATOR_PORT:=5554}"
: "${DEVICE_SERIAL:=emulator-5554}"
: "${AVD_NAME:=Pixel_A}"

# (3): project-local overrides, not committed. Sourced from the project root
# (the package.json scripts run there). The leading "./" is required: POSIX `.`
# searches PATH for a bare name, so `. ./.env.ports.local` sources the local file.
if [ -f ./.env.ports.local ]; then
  . ./.env.ports.local
fi

export METRO_PORT EMULATOR_PORT DEVICE_SERIAL AVD_NAME
