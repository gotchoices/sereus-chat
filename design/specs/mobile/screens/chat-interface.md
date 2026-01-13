# Chat Interface

Strand conversation view. Opens when user taps a strand from Home.

## Layout

- **Header**: Back, partner avatar + name, voice call, video call, search icons
- **History**: Scrollable message bubbles (left = theirs, right = mine), timestamps
- **Composer**: Attach (+), text input (expands to ~4 lines), mic or send icon

## Behaviors

- Tap voice/video icon → initiates call
- Tap search → in-strand search mode with highlighted matches
- Tap + → opens media picker; selected items appear as removable chips above composer
- Mic icon shows when composer is empty; send icon shows when there's content
- Long-press own message → edit/delete/copy menu
- Long-press others' message → reply/copy menu

## States

- **Normal**: History + composer
- **Empty**: "No messages yet" placeholder
- **Editing**: Composer prefilled with message text; save/cancel controls replace send
- **Error**: Inline banner with retry
