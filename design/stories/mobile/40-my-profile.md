# User Story: My profile

## Story Overview

As a member of one or more strands  
I want to control the name and picture other people see  
So that friends recognise me, and so that I know what I am disclosing to whom.

Context: Bob entered only a name at first run ([01](01-first-run.md)). He now notices other people's
pictures beside their messages and wonders how to add his own. Susan goes by a handle at work and
wants that to be what people see.

## Roles

| Role | Who | Note |
|------|-----|------|
| Owner of the profile | any member | edits their own; nobody edits anyone else's |

## Sequence

1. Bob opens his profile from home.
2. He sees what he is currently showing other people: his name, and initials standing in for a
   picture he has not set.
3. He is told which parts of this other people see, and which stay on his own device. The
   distinction is stated plainly rather than assumed.
4. He adds a picture — a photo he takes now, one from his library, or an image from his files.
5. He saves. His picture now appears beside his messages and in other people's strand lists.
6. Susan does the same but changes her name to the handle her coworkers know her by. It is not a
   username and nothing is claimed or reserved; it is simply what she is showing.

### Alternative Path A: removing a picture

4.1. Bob decides against the photo and removes it. He goes back to initials. Nothing else changes.

### Alternative Path B: an image that will not do

4.1. The image Bob picks is very large. He is offered a way forward — reduce it, or pick another —
     rather than a refusal.

### Alternative Path C: what a group can see

3.1. Susan is in a strand that can grow, and realises her name and picture are visible to everyone
     in it, including people she did not invite and has never met.
3.2. This is stated where she can act on it, at the point she is editing what she shows.
     → [31](31-whos-in-this-strand.md)

### Alternative Path D: leaving without saving

5.1. Bob backs out with changes he has not saved and is asked whether he means to discard them.

## Acceptance Criteria

- [ ] A user can set and change the name and picture other people see
- [ ] The user is told which profile details are shared and which remain on their device
- [ ] A picture can come from the camera, the photo library, or files
- [ ] Removing a picture falls back to initials
- [ ] An image that is too large offers a way forward rather than a refusal
- [ ] Saved changes appear wherever the user is represented — strand lists and messages
- [ ] The name is a display name, not a claimed or unique identifier
- [ ] A user in a growable strand can tell that people they never invited will see their profile
- [ ] Abandoning unsaved changes is confirmed

## Variants

- happy: a picture added and visible to others
- empty: a profile with a name and nothing else
- error: an unusable image; unsaved changes on exit

## Open

Only name and picture are shared today (`specs/domain/schema.md`); email, phone and notes stay
local. If per-strand disclosure is ever wanted, it is a schema change, not a UI one. Device and cadre management is reached from here but is not this story's subject:
[42](42-staying-connected.md).
