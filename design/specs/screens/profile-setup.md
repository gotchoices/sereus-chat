---
id: ProfileSetup
route: ProfileSetup
variants: [happy, error]
---

# Profile Setup – Design Specifications (Minimal Draft)

## Purpose
Enable users to review and edit basic profile details, add/change an avatar, and save changes. Keep layout clean and focused without redundant banners.

## Layout Requirements

### Top Bar
- Left: Back button
- Title: “Profile”
- Right: Save button

### Avatar Section
- Large avatar/picture near top (not overlapping any banners)
- Edit affordance: Pencil icon positioned adjacent to the avatar
- Tapping pencil opens media picker (camera/library/files)

### Fields (No section banner)
- Do not include any “Additional Information” or similar banners. Just list fields.
- Required fields use an asterisk suffix in the label; do not annotate optional fields with “optional”.
- Fields (initial set):
  - Name* (required)
  - Email (optional)
  - Phone (optional)
  - Notes/Bio (optional, multiline)

### Privacy Notice
- Inline text block below fields:
  - “Personal information is not collected or stored by Sereus. But information you enter may be shared with connected peers.”

## Interaction Requirements
- Back: Navigates to previous screen without saving (after issuing a warning to save if dirty)
- Save: Validates required fields (Name), persists changes, and returns
- Edit Avatar (pencil): opens media picker with options (camera/library/files); updates preview on selection

## Data Requirements
- Name required; all other fields optional
- Avatar image may be new capture or selected from device; display compressed preview

## Visual Hierarchy
1. Avatar with edit affordance
2. Name field
3. Remaining fields
4. Privacy notice
5. Save (in header)

## Navigation Context
- Entry: From Home (top-right avatar) → Profile
- Exit: Back (warn if dirty, then discard unsaved), Save (commit and exit)

## States
- Empty: Initials-based avatar if no picture
- Validation: Highlight Name if missing on Save
- Loading: Brief state during image processing or save
