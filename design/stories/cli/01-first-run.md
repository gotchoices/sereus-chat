# User Story: First run

## Story Overview
As a developer evaluating Sereus Chat
I want to install a command-line client and have an identity at once
So that I can take part in Sereus Chat conversations — with people using the phone app — without a phone

## Sequence
1. Bob installs it: `npm install -g serchat`.
2. He runs `serchat` with no arguments. It creates a profile under his home folder (a new
   identity and network of its own), starts its node, and drops him at a prompt that says
   `help` (or `?`) lists the commands.
3. It asks nothing. He sets his name when he likes: `profile set name=Bob`.
4. `status` tells him he cannot be reached: no relay. He adds one by its name:
   `relay add relay.example`. serchat looks up the rest, says what it found, and waits until
   the relay accepts him. `status` shows it working.
5. He quits. Next time, the same identity, strands and relay are there.

```
$ serchat
serchat 0.1 · profile default · starting…  (stderr)
serchat> status
profile	default
peer	12D3KooWGRBG…
party	ce350720-854d-…
reachable	no
relays	0
strands	0
serchat> relay add relay.example
relay relay.example: /dns4/relay.example/tcp/4011/ws/p2p/12D3KooWMD…
  its peer id 12D3KooWMD… was published by DNS
1	reserved	/dns4/relay.example/tcp/4011/ws/p2p/12D3KooWMD…
serchat> status
…
reachable	yes
relay	reserved	/dns4/relay.example/…
```
Commands can be shortened to any unique beginning: `stat` is `status`, since nothing else starts
that way.

## Acceptance Criteria
- [ ] First run needs no questions and no flags
- [ ] Everything it keeps lives under one folder per profile, in the user's home folder
- [ ] It says plainly when it cannot be reached, and why
- [ ] Help is one word away, and commands can be abbreviated
