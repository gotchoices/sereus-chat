# User Story: A shared drive

## Story Overview

As somebody in a strand
I want a place in it where we keep files in folders, apart from the conversation
So that the things we keep coming back to are easy to find, rather than buried in what was said.

Context: The cycling group ([05](05-add-someone-to-a-strand.md)) has route maps, a waiver everyone
must sign, and photos from every ride. In the conversation they scroll away within a day. Priya
wants one place where the routes live, Bob wants somewhere to drop ride photos without flooding the
chat, and nobody wants to be the person who has to tidy it all up forever.

## Roles

| Role | Who | Note |
|------|-----|------|
| Member | Priya, Bob, Susan | everyone in the strand sees the drive and can add to it |
| Folder creator | Priya, for "Routes" | decides whether others may add to the folder she made |
| Author | whoever added a file | can rename, move or remove their own files, and only those |

## Sequence

1. Priya opens the strand and goes to its drive, beside the conversation. It is the same drive for
   everyone in the strand; there is no private corner of it.
2. She makes a folder, "Routes", and adds three route maps from her phone. → [20](20-sending-media.md)
   for how things are picked from the phone.
3. Each file shows who added it, when, its size, and how long it will be kept. She keeps the default,
   a month, for the photos she adds later, but chooses a year for the routes.
4. Bob opens the drive the next day. "Routes" is there with Priya's three maps. He opens one; like
   any shared file it may take a moment to arrive the first time. → [21](21-receiving-media.md)
5. Bob makes his own folder, "Ride photos", and adds twelve pictures from Saturday. Nobody is
   notified in the conversation; the drive is where they live.
6. A month later the ride photos Bob didn't keep longer are gone from the drive for everyone, without
   anyone having to clean up.

### Alternative Path A: a folder only its creator adds to

2.1. Priya doesn't want "Routes" to fill with everyone's half-finished maps. She sets it so that only
     she can add to it.
2.2. Bob sees "Routes" and can open everything in it, but he isn't offered "add" there. He can still
     make his own folder anywhere else, or at the top. → 4
2.3. Priya can change her mind and open the folder to everyone again. Only she can.

### Alternative Path B: two files with the same name

5.1. Susan and Bob both add "waiver.pdf" to the top of the drive within the same minute.
5.2. Neither replaces the other. The drive shows two files called "waiver.pdf", each with who added
     it, when, and a short code that tells their contents apart, so it is clear they are different
     files. → 6

### Alternative Path C: keeping something longer

6.1. Susan notices that Bob's photo of the summit will be gone next week. She chooses to keep it for a
     year. She doesn't need to ask Bob; anyone in the strand can keep a file longer.
6.2. Nobody can make a file go sooner than its author chose, except its author, by removing it.

### Alternative Path D: removing your own file

5.3. Bob added a photo he shouldn't have. He removes it. It disappears from the drive for everyone.
5.4. He is told plainly that it is gone from the drive, but that anyone who already opened or saved
     it may still have a copy, and nothing can reach those copies. → [13](13-correcting-a-message.md)
     has the same rule for messages.
5.5. Bob cannot remove, rename or move anyone else's files, and nobody can remove his. The same goes
     for folders: Bob can remove "Ride photos" only once nothing of anyone else's is left in it.

### Alternative Path E: renaming and tidying

5.6. Bob renames "Ride photos" to "Rides 2026" and moves last year's folder inside it. Only the
     creator of a folder can rename or move it, and only into a folder they may add to.

### Alternative Path F: not here yet, or not reachable

4.1. Bob opens a map Priya added a minute ago while her phone was off. He sees the file in the drive
     but it can't be opened yet; he is told it is still arriving, not that it is missing. It opens
     once a member who has it is reachable. → [21](21-receiving-media.md)

## Acceptance Criteria

- [ ] Every strand has one drive, the same for every member, separate from the conversation
- [ ] Any member can make folders and add files at the top level
- [ ] A folder's creator can make it so only they can add to it, and change that back; others can
      still open everything in it
- [ ] Each file shows who added it, when, its size and how long it will be kept
- [ ] When adding a file, its author chooses how long it is kept, with a default; it is gone for
      everyone after that
- [ ] Any member can keep a file longer; nobody can shorten someone else's
- [ ] Files with the same name never replace each other; both are shown, told apart by who, when and
      a short code
- [ ] A member can rename, move and remove only their own files and folders
- [ ] A folder can be removed by its creator only once it holds nothing of anyone else's
- [ ] Removing something tells the member that copies others already have cannot be reached
- [ ] A file not yet arrived, or not reachable, is reported as such, never as missing or deleted
- [ ] The size limit when adding is the user's own setting, as for attachments → [20](20-sending-media.md)

## Variants

- happy: folders with files, opened by another member
- empty: a strand whose drive has nothing in it yet
- error: a file still arriving; adding to a folder only its creator can add to; a file over the
  user's own size limit

## Open

- **Default and choices for how long a file is kept.** Proposed: a day, a week, a month (the
  default), or a year. Should "until I remove it" be offered at all, given that it would rely on
  someone remembering to?
- **Can a manager of the strand remove anyone's file** (for example, something posted in error by a
  member who has since left)? Proposed: not yet.
- **Should adding to the drive be mentioned in the conversation** (a quiet "Bob added 12 files to
  Ride photos")? Proposed: no, the drive is its own place, but a strand could have a way to see
  what's new in it.
