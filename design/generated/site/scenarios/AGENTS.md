# AI Agent Rules: Scenarios (Appeus)

Scenarios are narrative walkthroughs that deep-link into the running app (device/simulator). They live under `design/generated/scenarios/` and are fully regenerable. They must read like a story for humans — concrete personas and step-by-step visuals — not technical notes.

Image workflow
- Source of truth is Markdown scenarios; HTML is a publish artifact.
- Use screenshot builders (Android: `appeus/scripts/android-screenshot.sh`) to capture PNGs for each screen/variant/locale. See `appeus/reference/scenarios.md`.

Guidelines (human-first)
- Create one scenario doc per source story (e.g., `discovery.md`, `responding.md`) and link the story at the top.
- Maintain `design/generated/scenarios/index.md` with a reviewer-friendly order (onboarding → invite/accept → chat → search → profile → alternates/errors).
- Avoid technical lingo (“deeplink”, “PNG path”, “variant”) in the narrative. Speak plainly as if guiding a reviewer through the app.
- For each scenario (4–8 steps typical):
  - Each step is 1–3 sentences of narrative (persona intent + what they see/do)
  - Include a clickable image (phone-sized) that links to the deep link for that step
  - Keep deep-link URLs in link targets, not as inline prose
  - Example: `[![home-empty](../images/connections-list-empty.png)](app://connections?variant=empty&locale=en&scenario=home-empty-1)`
- Include alternates and error paths if relevant (short sections at the end).
- Keep in sync with current screens, navigation, i18n strings and screenshots.

How to capture screenshots (Android)
- Use the helper: `appeus/scripts/android-screenshot.sh`
- Example:
  - `appeus/scripts/android-screenshot.sh --deeplink "chat://connections?variant=happy&locale=en" --output "design/generated/images/connections-list-happy.png" --reuse`
- Defaults:
  - AVD: `APPEUS_ANDROID_AVD` (default Medium_Phone_API_34)
  - App ID: `APPEUS_APP_ID` (default org.sereus.chat)
  - Delay: `APPEUS_SCREEN_DELAY` (default 3s before capture)
- File naming: `design/generated/images/<route>[-<variant>[-<locale>]].png`

Agent actions (explicit)
- You generate the exact screenshot commands for each scenario step and execute them.
- You ensure the PNGs are written to `design/generated/images/` with the expected filenames.
- After images are captured, you update/verify the scenario docs and `index.md` links.
- You prioritize multi-step flows per story over single-screen snapshots. Single-screen docs are optional reference, not the primary artifacts.

Mock variants
- Prefer `?variant=` query in deep links for demo data selection. See `appeus/reference/mock-variants.md`.

When to regenerate
- After screens, navigation, i18n, or specs change
- After mock variants change (links or visuals)

Do not
- Don’t reference non-existent screens or routes
- Don’t hand-edit generated scenarios; update stories/specs then regenerate

Deep-link patterns
- Prefer `app://<route>?variant=<name>&locale=<tag>&scenario=<id>`; keep parameters stable and documented per screen in the scenario doc.

Quality checklist
- References source stories at top
- Persona and preconditions are clear
- Each step: narrative + deep-link + screenshot embed
- Includes alternates/errors when applicable
- Index updated to include new docs and order makes sense to a reviewer


