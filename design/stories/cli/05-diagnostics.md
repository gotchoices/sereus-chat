# User Story: Looking under the hood

## Story Overview
As someone debugging Sereus Chat
I want serchat to show what the network layer is doing and to time things
So that I can compare it against the phones and find where time goes

## Sequence
1. `-v` prints the node's own log lines to stderr.
2. `status` and `network` show the node, its relay, its machines, and each strand's state.
3. Timings: `send` reports how long the commit took; `tail` stamps each message with when
   it arrived here, so delivery time between two clients can be measured.
4. Later: the same commands the phone's development bridge answers, so `test/devices` tools
   drive serchat and a phone alike.

## Acceptance Criteria
- [ ] Network-layer logging is opt-in and never mixed into stdout
- [ ] What it measures is reported in the same terms the phone tools use
