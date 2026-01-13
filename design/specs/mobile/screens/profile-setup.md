# Profile Setup

Edit profile details: avatar, name, and optional contact info.

## Layout

- **Header**: Back, "Profile" title, Save
- **Avatar**: Large image with edit pencil → opens media picker
- **Fields**: Name (required), Email, Phone, Notes/Bio
- **Privacy notice**: Inline text about data sharing with peers

## Behaviors

- Save → validates name is present, persists changes, returns
- Back with unsaved changes → confirm discard dialog
- Edit avatar → media picker for camera/gallery/files

## States

- **No avatar**: Shows initials
- **Validation error**: Highlights name field if empty on save
