#!/usr/bin/env sh
# tap.sh — tap the on-screen control whose label matches, or print what is on screen.
#
# The app is consent-driven: relay offers, invitations and joins all end at a
# button a person is meant to press.  Automating a two-device test means pressing
# them from here, and `adb shell input tap X Y` needs coordinates that change with
# every layout tweak — so look them up by LABEL each time instead.
#
#   tap.sh <serial> '<label substring>'   tap the first matching control
#   tap.sh <serial>                       print the visible text
#
# TWO THINGS MAKE THE NAIVE VERSION WRONG, and both fail silently — a tap that
# lands on nothing is indistinguishable from one that worked:
#
#   1. The tappable node is a ViewGroup whose label lives in `content-desc`; the
#      `text` attribute belongs to a NON-clickable TextView inside it.  Matching
#      only `text` finds the label but taps a view that ignores taps.
#   2. Headings repeat the button's words — this screen asks "Use this relay?"
#      above a button reading "Use this relay" — so first-match taps the question.
#
# So: search `content-desc` and `text`, and let a clickable node win over a
# non-clickable one regardless of document order.
set -eu

S="$1"
LABEL="${2:-}"
TMP="${TMPDIR:-/tmp}/ui-$S.xml"

adb -s "$S" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb -s "$S" shell cat /sdcard/ui.xml > "$TMP" 2>/dev/null

if [ -z "$LABEL" ]; then
  tr '>' '\n' < "$TMP" | grep -o 'text="[^"]\{1,\}"' | sed 's/text="//;s/"$//'
  exit 0
fi

COORDS=$(tr '>' '\n' < "$TMP" | awk -v want="$LABEL" '
  BEGIN { IGNORECASE = 1; lw = tolower(want) }
  function attr(line, name,   re) {
    re = name "=\"[^\"]*\""
    if (match(line, re)) return substr(line, RSTART + length(name) + 2, RLENGTH - length(name) - 3)
    return ""
  }
  {
    label = attr($0, "text")
    desc  = attr($0, "content-desc")
    if ((label != "" && index(tolower(label), lw) > 0) ||
        (desc  != "" && index(tolower(desc),  lw) > 0)) {
      if (match($0, /bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"/)) {
        b = substr($0, RSTART + 8, RLENGTH - 9)
        gsub(/\]\[/, ",", b); gsub(/[\[\]]/, "", b)
        split(b, c, ",")
        x = int((c[1] + c[3]) / 2); y = int((c[2] + c[4]) / 2)
        if ($0 ~ /clickable="true"/) { if (!haveClick) { cx = x; cy = y; haveClick = 1 } }
        else if (!haveAny) { ax = x; ay = y; haveAny = 1 }
      }
    }
  }
  END { if (haveClick) print cx, cy; else if (haveAny) print ax, ay }')

if [ -z "$COORDS" ]; then
  echo "no node matching \"$LABEL\" on $S; on screen:" >&2
  tr '>' '\n' < "$TMP" | grep -o 'text="[^"]\{2,\}"' | sed 's/text="//;s/"$//' >&2
  exit 1
fi

# A PRESS WITH DURATION, not `input tap`.
#
# `input tap` synthesises a DOWN and an UP in the same millisecond. The emulator
# accepts that; the physical Galaxy S7 silently ignores it for React Native
# Pressables — the command reports success, the screen does not change, and the
# failure is indistinguishable from a tap that landed on nothing. `input swipe`
# with identical start/end coordinates and a 120 ms hold is the same gesture with
# a realistic duration, and both devices honour it.
# shellcheck disable=SC2086
set -- $COORDS
adb -s "$S" shell input swipe "$1" "$2" "$1" "$2" 120
echo "pressed \"$LABEL\" on $S at $COORDS"
