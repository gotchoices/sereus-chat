---
id: chat-interface
route: ChatInterface
variants: [happy, empty, error]
description: One strand's conversation.
---

# Chat Interface

Stories 04, 10, 11, 12, 13, 20, 21.

## Layout

- **Header**: back, strand avatar + title, voice call, search icons
- **History**: message bubbles, left = theirs, right = mine, with timestamps
- **Composer**: attach (+), text input expanding to about four lines, mic or send icon

## Behaviours

- **Mic icon shows when the composer is empty; send icon shows when there is content**
- Tap + → media picker; selected items appear as removable chips above the composer
- Tap search → in-strand search
- Long-press own message → edit / delete / copy
- Long-press another's → reply / copy / react

## States

- **Editing**: composer prefilled with the message; save and cancel replace send
