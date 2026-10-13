# User Story: Scripting it

## Story Overview
As a developer
I want to run serchat commands from the shell and from files
So that I can automate checks and filter results with ordinary tools

## Sequence
1. One command, then exit: `serchat strands`. It starts the node, waits until its strands
   have settled, prints, and stops. It is slow (seconds), and that is accepted.
2. Several in one start: `serchat strands \; log f8f3 -n 5`. Each output line says which
   strand and message it belongs to, so the combined output still reads.
3. From a file: `serchat < checks.txt`, one command per line.
4. Filtering: `serchat log f8f3 -n 200 | awk -F'\t' '$5=="Susan"'`. Fields are tab-separated
   in documented columns; a message's tabs and newlines are escaped, so one message is
   always one line. `--json` gives JSON lines for `jq`.
5. A failed command says why on stderr and exits non-zero, with a different code when trying
   again may help.

## Acceptance Criteria
- [ ] Data goes to stdout and nothing else does; progress and errors go to stderr
- [ ] Columns are stable and documented; timestamps are ISO 8601 UTC; full ids are printed
- [ ] Exit codes distinguish usage errors, failures worth retrying, and failures that are not
