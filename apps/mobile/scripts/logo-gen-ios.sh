#!/bin/bash
# Generate iOS app icons for Sereus Chat from the canonical SVG.
# Modelled on ser/health/apps/mobile/scripts/logo-gen-ios.sh.
#
# iOS icons are a single opaque square (no transparency — iOS flattens alpha to
# black) that the OS masks to a rounded rect. So: brand-colour square with the
# green disc centered on top, written at every required size + Contents.json.
#
# Source: docs/images/logo_3_m.svg

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"               # chat/apps/mobile
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"    # chat/
ASSETS_DIR="$PROJECT_ROOT/docs/images"
SRC="$ASSETS_DIR/logo_3_m.svg"
APPICONSET_DIR="$APP_DIR/ios/mobile/Images.xcassets/AppIcon.appiconset"

# --- knobs -----------------------------------------------------------------
BG_COLOR="#fdf8f0"   # icon background (peach, shared with the Sereus family)
DISC_PX="800"        # disc size within the 1024 master (leaves a safe margin)
# ---------------------------------------------------------------------------

echo "🍎 Generating Sereus Chat app icons (iOS) from $(basename "$SRC")..."

command -v magick >/dev/null 2>&1 || { echo "❌ ImageMagick not found. brew install imagemagick"; exit 1; }
[ -f "$SRC" ] || { echo "❌ source not found: $SRC"; exit 1; }
[ -d "$APPICONSET_DIR" ] || { echo "❌ AppIcon set not found: $APPICONSET_DIR"; exit 1; }

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

# 1024 master: opaque brand square + centered disc (flatten so no alpha ships).
magick -size 1024x1024 "xc:${BG_COLOR}" "$tmp/bg.png"
magick -background none "$SRC" -resize "${DISC_PX}x${DISC_PX}" \
  -gravity center -extent 1024x1024 "$tmp/disc.png"
magick "$tmp/bg.png" "$tmp/disc.png" -gravity center -composite \
  -background "$BG_COLOR" -alpha remove -alpha off "$tmp/AppIcon-1024.png"

write_icon() { magick "$tmp/AppIcon-1024.png" -resize "${1}x${1}" "$APPICONSET_DIR/$2"; }

write_icon 40   "AppIcon-20@2x.png"
write_icon 60   "AppIcon-20@3x.png"
write_icon 58   "AppIcon-29@2x.png"
write_icon 87   "AppIcon-29@3x.png"
write_icon 80   "AppIcon-40@2x.png"
write_icon 120  "AppIcon-40@3x.png"
write_icon 120  "AppIcon-60@2x.png"
write_icon 180  "AppIcon-60@3x.png"
cp -f "$tmp/AppIcon-1024.png" "$APPICONSET_DIR/AppIcon-1024.png"

cat > "$APPICONSET_DIR/Contents.json" <<'JSON'
{
  "images" : [
    { "filename" : "AppIcon-20@2x.png", "idiom" : "iphone", "scale" : "2x", "size" : "20x20" },
    { "filename" : "AppIcon-20@3x.png", "idiom" : "iphone", "scale" : "3x", "size" : "20x20" },
    { "filename" : "AppIcon-29@2x.png", "idiom" : "iphone", "scale" : "2x", "size" : "29x29" },
    { "filename" : "AppIcon-29@3x.png", "idiom" : "iphone", "scale" : "3x", "size" : "29x29" },
    { "filename" : "AppIcon-40@2x.png", "idiom" : "iphone", "scale" : "2x", "size" : "40x40" },
    { "filename" : "AppIcon-40@3x.png", "idiom" : "iphone", "scale" : "3x", "size" : "40x40" },
    { "filename" : "AppIcon-60@2x.png", "idiom" : "iphone", "scale" : "2x", "size" : "60x60" },
    { "filename" : "AppIcon-60@3x.png", "idiom" : "iphone", "scale" : "3x", "size" : "60x60" },
    { "filename" : "AppIcon-1024.png", "idiom" : "ios-marketing", "scale" : "1x", "size" : "1024x1024" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON

echo "✅ iOS icons written to $APPICONSET_DIR"
echo "   Rebuild in Xcode / rerun the iOS app to see the icon."
