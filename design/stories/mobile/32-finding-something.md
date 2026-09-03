# User Story: Finding something

## Story Overview

As somebody with more strands than they can hold in their head  
I want to find either a conversation or something that was said in one  
So that I can get back to it without scrolling, and without paying for more than I asked for.

Context: Bob is in fifteen or so strands. Most of the time he knows exactly who he wants. Now and
then he remembers a phrase and not who said it.

## Roles

| Role | Who | Note |
|------|-----|------|
| Searcher | Bob | everything here happens on his own machines unless he asks for more |

## Sequence

1. Bob wants his conversation with Susan. He starts typing her name where his strands are listed.
2. The list narrows as he types, to the strands whose name matches — and to strands with a member of
   that name, since a group is rarely called after the people in it.
3. It narrows **instantly**, and it does so with the phone in flight mode. Nothing is fetched;
   these are names he already holds.
4. He picks Susan's strand and is done. This is the common case and it costs nothing.
5. Another day he remembers somebody recommended a bike shop but not who, or where. Narrowing by
   name gets him nowhere — he is not looking for a conversation, he is looking for a sentence.
6. From the same place, he can ask for that instead: **search everything I have said and been told**.
   He asks for it deliberately, because it is a different and more expensive act.
7. He is told what it costs while it happens — that it is going through his strands, and how far it
   has got. Results appear as they are found and he can act on one before the rest arrives.
8. He finds it, opens that strand, and lands on the message. → [10](10-catching-up.md)

### Alternative Path A: searching one conversation

5.1. Bob knows the shop came up in the cycling group, he just cannot find it in the scroll.
5.2. He searches inside that strand alone. It is quick, because it is one strand and it is already
     open in front of him.

### Alternative Path B: not everything could be reached

7.1. Some of Bob's strands cannot be reached — nothing holding them is answering right now.
7.2. He is told plainly: this is what was found, and these could not be looked in. The result never
     presents itself as complete when it is not, and "nothing found" is never said on a partial
     sweep.

### Alternative Path C: he calls her something else

1.1. Susan calls herself "Su-Z". Bob has her filed under "Susan (work)".
1.2. Typing either finds her: the name he uses for somebody is a name he can search by
     ([31](31-whos-in-this-strand.md)).

### Alternative Path D: nothing matches

7.1. The sweep finishes and nothing matched.
7.2. He is told the search finished and found nothing — which is different from it having stopped
     early, and reads differently.

## Acceptance Criteria

- [ ] Narrowing the list of strands by name is instant, works with nothing reachable, and fetches
      nothing
- [ ] Narrowing matches a strand's name and the names of its members, including the user's own
      private names for people
- [ ] Searching what was said is a **separate, deliberate act**, reached from the same place but
      never started on the user's behalf
- [ ] While it runs, the user can see it is working through their strands and how far it has got
- [ ] Results are usable before the search finishes
- [ ] A search that could not reach everything says so, and never reports "nothing found" on a
      partial sweep
- [ ] A finished search that matched nothing is distinguishable from one that stopped early
- [ ] A single conversation can be searched on its own, from inside it
- [ ] A result leads to the message in place, in its conversation

## Variants

- happy: a name narrows the list; later, a phrase is found across strands
- empty: nothing matches the name; a finished sweep with no results
- error: strands that cannot be reached; a search that cannot run at all

## Open

What it costs to search everything depends on the platform: there is no index across strands and
most are not running until something wakes them ([sereus.md](../../specs/domain/sereus.md)). The
story asks only that the user be told what is happening and never be charged for it without asking.
