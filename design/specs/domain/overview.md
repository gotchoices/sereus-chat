# Domain Overview

## Sereus Terminology

- **Strand**: A secure channel (edge) between 2–N parties; backed by a Quereus database
- **Fabric**: The ecosystem of interconnected strands
- **Cadre**: A user's own devices (phone, desktop, cloud) forming a local cluster

Stack: libp2p → fret (DHT) → optimystic (p2p storage) → quereus (SQL)

## Partial locality — a device holds what it can

A strand's data is **not** wholly held by every member. Each node participates to the degree it is
able and relies on the cohort for the rest; strand blocks replicate to a subset rather than to
everyone, which `sereus/docs/cadre-consistency.md` describes as a storage-versus-availability
tradeoff. A phone will impose a limit on what it keeps.

**This is not a correctness problem — Quereus sits on top of it.** A SQL query finds everything in
the table. What partial locality costs is *time and availability*, not results: a read may block
while the blocks it needs are fetched from the cohort, and may fail outright if nothing holding them
is reachable. A query never silently returns a subset.

Consequences the app must be built for, not around:

- **A read can be slow, or can fail, in a way a local database never is.** Reaching into a strand's
  past may pause while blocks are fetched, and may be impossible while the device is cut off. That is
  a state to show honestly — waiting, or unavailable — never an empty result presented as an answer.
- **Never present "could not fetch" as "nothing there".** The distinction between *deleted*,
  *not yet retrieved*, and *still arriving* must survive into the UI, because the user's conclusion
  differs completely in each case.
- **A strand carried only by phones may not hold its whole history between them.** That is a real
  capacity limit and should surface as a condition the user can act on, not a silent loss.
- **Trimming is legitimate.** The user, or a policy, may drop local content deliberately. What other
  members hold is unaffected — though a device that keeps less is one the strand can lean on less.
- **Capacity is something a user can improve.** Adding a more capable machine to their cadre
  increases what they can keep, and so how much is reachable without waiting on anybody. This is one
  of the few places where the cadre becomes concretely worth having.

## Data Ownership

- **Local (device/cadre)**: Profile data (name, avatar, notes). Not shared by default.
- **Shared (strand)**: Messages, membership, metadata. Replicated to strand partners.

Mock mode: local profile edits write to local mock store; shared data uses read-only fixtures.

