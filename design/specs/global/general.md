# General Specifications

## Sereus Fabric Framework Background and Terminology
- Sereus builds a stack of software protocols including:
  - quereus: sql engine
  - optimystic: peer-to-peer storage, b-tree engine
  - fret: Distributed hash table
  - libp2p: Low level peer-to-peer networking
- Sereus controls the negotiation and establishment of secure channels, edges called "strands".
- The Sereus ecosystem all together is called a "fabric" (many interconnected strands).
- Strands can be established between 2 parties or N parties.
- A strand is a quereus database which the parties to the strand receive access.
- Those given access might be able to read only or also write.
- Invitees might also be given the ability to invite others to the same strand.
- This app, Sereus Chat, is a messaging app using a subset of Sereus capabilities.
- It implements basic text messaging, attachments, calling, video conferencing.

## UI Principles
- Where icons alone are sufficient to describe an action, that is preferred.  For example:
  - Copy icon: copy to clipboard
  - Chat bubble: draft new message
  - '+' by text input: attach something
  - Microphone: record voice message
  - Telephone: voice call
  - Video Camera: video call
  - Magnifying glass: search
- In other cases, text or an icon plus text will be more helpful.
- In some cases, a full descriptive message will be needed for example a security warning.

## Data Model (Local vs Shared)
- Local (device/cadre): profile data (name, email, phone, avatar, notes) persists locally and is not shared by default. In mock/demo mode, local writes are allowed and stored in a local mock store.
- Shared (strand): chat messages, strand membership and message metadata are shared with strand partners. Mock/demo mode drives shared data via variant-controlled fixtures.
- Mock writes: local profile edits write to the local mock store (not to static JSON files). Shared data remains read-only fixtures unless explicitly extended.
