# Project Spec

This document captures key decisions for the project. Complete this during the discovery phase before adding app scaffolds.

## Purpose

**What problem does this project solve?**

Current chat apps require a provider and sometimes expose the user to spam.  Sereus chat will use the [Sereus Fabric](https://sereus.org) platform to network with known, trusted peers on an invitation-only basis for increased privacy and security.

**Who are the target users?**

Anyone on a mobile, web or desktop platform who wants to communicate with known, trusted peers.

**Delivery posture (pick one):**

- Production / Industrial-strength — optimize for correctness, scalability, accessibility, maintainability

## Platforms

**What platforms will this project target?**

- [x] Mobile (iOS/Android)
- [x] Web (desktop browsers)
- [ ] Desktop (Electron, Tauri)

**Are experiences different per platform?**

Each platform will have its own experience but hopefully they will be similar enough that users can easily adapt from one to another.

## Identity (publisher + app id)

- **Publisher id (reverse-DNS domain)**: `org.sereus`
- **Preferred app name**: `chat`
- **Default mobile app id (reverse-DNS)**: `org.sereus.chat`

## Apps

List the apps to be built:

| App Name | Platform | Framework | Status |
|----------|----------|-----------|--------|
| mobile | iOS/Android | react-native | initial |
| web | browser | sveltekit | planned |
| desktop | unknown | unknown | possibly in future |

## Toolchain

### Mobile (if applicable)

- Framework: react-native
- Runtime: bare
- Language: typescript
- Package manager: yarn

### Web (if applicable)

- Framework: sveltekit
- Language: typescript
- Package manager: yarn

## Data Strategy

**How will data be managed?**

- [x] Offline support required
- [x] All non-mock data managed by [Quereus](https://github.com/gotchoices/quereus.git)
- [x] Real-time updates needed

**Backend:**

Sereus/quereus facilitate a device, like a phone, connecting to other of the user's devices (desktop, cloud droplet) to form a cadre.  This cadre likewise connects with other users' cadres to form a common cohort of nodes, a 'strand'.  Data is distributed (or replicated) across the cohort according by a quereus sub-module [optimystic](https://github.com/gotchoices/optimystic.git).  The app relates to quereus via SQL.

Sereus manages trust and authentication.  Strands are initiated by invitations sent out of band as QR codes and/or clickable deep links.

## Shared Resources

**What will be shared across targets?**

- [x] Domain contract (schema, api, rules, interfaces as needed) — `design/specs/domain/`
- [x] Mock data

## Notes

The Sereus stack should accommodate tiny strands with 2 user up through huge strands with millions of users where DHT becomes the predominantly obvious storage mechanism.

**Quality / performance posture (brief):**

- Expected scale: large
- Critical interactions that must stay fast
  Search, scrolling, screen transitions
