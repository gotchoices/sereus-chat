# Domain Overview

## Sereus Terminology

- **Strand**: A secure channel (edge) between 2–N parties; backed by a Quereus database
- **Fabric**: The ecosystem of interconnected strands
- **Cadre**: A user's own devices (phone, desktop, cloud) forming a local cluster

Stack: libp2p → fret (DHT) → optimystic (p2p storage) → quereus (SQL)

## Data Ownership

- **Local (device/cadre)**: Profile data (name, avatar, notes). Not shared by default.
- **Shared (strand)**: Messages, membership, metadata. Replicated to strand partners.

Mock mode: local profile edits write to local mock store; shared data uses read-only fixtures.

