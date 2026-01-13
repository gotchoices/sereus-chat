# Story: Manage My Profile Picture

## Story Overview
As a user, I want to set or change my profile picture so that my friends see a recognizable image next to my messages and in their connections list.

## Context / Triggers
- From Home, the user notices friends’ avatars in the strands list and in message bubbles, wonders how to add their own.
- From first‑launch name modal, the user chooses to “Set up full profile”.
- From Profile screen, the user sees a prompt to add/update a picture.

## Sequence (Primary)
1. User opens Profile screen from Home (top‑right avatar).
2. User sees current avatar placeholder (initials) and an “Add Photo” affordance.
3. User chooses how to add a picture.
3.1 Take a selfie (camera opens) → confirm → returns to Profile with preview.
3.2 Choose from photo library → select → returns to Profile with preview.
3.3 Use image/drawing (files, sketches) → select → returns to Profile with preview.
4. User saves changes.
5. Profile picture appears in Home strands list and in chat bubbles for outgoing messages.

## Alternative Paths
- 3.4 Cancel selection → returns to Profile without changes.
- 3.5 Image too large → user sees message with options to compress or choose a different image → proceeds.
- 3.6 Remove picture → reverts to initials‑based avatar.
- A1. From Chat: user taps their own bubble/avatar → “Edit Profile” → steps 2‑5.
- A2. From first‑launch: user taps “Set up full profile” after entering name → steps 2‑5.
 - A3. Prefers handle: the user decides they go by a handle in apps, so they change the Name to “Moss” (a nickname friends recognize) and Save.

## Acceptance Criteria
- [ ] Profile shows an “Add/Change Photo” control with options: Camera, Library, Files/Drawing.
- [ ] Saving updates the avatar across Home (connections list) and Chat bubbles.
- [ ] Removing photo falls back to initials‑based avatar.
- [ ] Large images prompt to compress or choose a different source.
- [ ] Cancel preserves previous avatar without changes.

## Notes / References
- Screens involved: `../screens/profile-setup.xml`, `../screens/media-picker.xml`, `../screens/chat-interface.xml`, `../screens/connections-list.xml`.
- Navigation: Home (Profile) → Profile (Push/Modal TBD), Media picker may be modal/overlay.
- Specs to consider: add `specs/profile-setup.md` if layout becomes complex.
