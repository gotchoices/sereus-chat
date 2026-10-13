# Sereus Chat — brand images

Logo exploration and the source art the app icon is generated from.

| File | What |
|------|------|
| `logo_1.png`, `logo_2.png`, `logo_3.png` | Three AI-generated concept logos (raster, 1254²). **logo_3** — a face speaking into a tin-can "string phone" (direct, peer-to-peer talk) — was chosen. |
| `logo_3.svg` | `potrace` auto-trace of `logo_3.png`. Machine-generated; kept for reference only. |
| `../../packages/resources/brand/logo.svg` | **Canonical** hand-drawn vector of logo_3 (green disc `#017959` on transparent), formerly `logo_3_m.svg` here. Cleaner geometry than the trace. Every app's icon and in-app logo are generated from it. |
| `logo_3_icon.svg` | Early icon-composite exploration (green disc on a light square). Superseded by the `logo-gen-*` pipeline below. |

## Generating app assets

The green disc's own left edge **is** the face profile, so the icon is the whole
disc on a light background square (not a "white mark on green"). Regenerate with:

```bash
cd ../../apps/mobile
yarn icons:android    # scripts/logo-gen-android.sh  → adaptive + legacy launcher icons, in-app logo.png
yarn icons:ios        # scripts/logo-gen-ios.sh      → ios AppIcon.appiconset
```

Both read `packages/resources/brand/logo.svg`. Background colour and disc scale are variables
at the top of each script.
