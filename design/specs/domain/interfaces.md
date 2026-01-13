# Interfaces

## Backend Modes

| Mode | Persistence | Scope | Use Case |
|------|-------------|-------|----------|
| mock | None | Variant-driven fixtures | Dev, demos, screenshots |
| quereus-memory | Session only | Single device | Testing, ephemeral |
| quereus-store | Local storage | Single device | Offline-first |
| quereus-sync | Local + cadre | User's devices | Multi-device sync |
| quereus-optimystic | DHT distributed | Strand cohort | Full production |

## Configuration

Backend mode via environment or build config:
- `SEREUS_BACKEND=mock` (default for dev)
- `SEREUS_BACKEND=quereus-store` (typical production start)

## Adapter Contract

All backends implement operations from `ops.md`. UI calls operations without knowing which backend is active. Mock adapter reads variant from context; production adapters ignore it.

## Quereus Interface

App ↔ Quereus via SQL. Quereus handles:
- Local persistence (store module)
- Cadre sync (sync module)  
- DHT distribution (optimystic module)

App is unaware of replication topology—Quereus abstracts it.

