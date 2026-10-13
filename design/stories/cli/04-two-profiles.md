# User Story: Two of me on one machine

## Story Overview
As a developer
I want two independent serchat identities on one laptop
So that I can test a conversation end to end without any phone

## Sequence
1. `serchat -p alice` and `serchat -p bob` in two terminals. Each is a separate person
   with its own folder.
2. Alice invites; Bob joins with the link; they chat. With `--listen` they can reach each
   other directly on the machine, without a relay.
3. `rm -r ~/.serchat/bob` is a clean slate for Bob.

## Acceptance Criteria
- [ ] Profiles share nothing but the program
- [ ] Two profiles can converse with no relay and no phone
