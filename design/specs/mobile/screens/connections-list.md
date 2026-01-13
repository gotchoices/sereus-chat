# Connections List (Home)

App entry point showing all strands. User can search, invite friends, sort, or open profile.

## Layout

- **Header**: Search icon, "Add Friends" button, sort icon
- **List**: Rows with avatar, name, last message preview, timestamp, unread badge
- **Footer**: QR scanner, notifications, profile avatar

## Behaviors

- Tap strand row → opens chat
- Tap search → push search screen
- Tap "Add Friends" → modal invite screen
- Tap sort → overlay with options (Recent, Alphabetical, Unread first)
- Tap profile avatar → push profile screen
- Pull to refresh

## States

- **Normal**: List of strands
- **Empty**: CTA to invite a friend
- **Error**: Inline banner with retry
