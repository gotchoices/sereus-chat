import re, sys
best = (0, 0); run = 0; start = None; last = None
for line in open(sys.argv[1], errors='ignore'):
    m = re.match(r'\[([0-9.]+)s\]', line)
    if not m: continue
    t = float(m.group(1))
    if 'wrote "host tick' in line:
        if run and last is not None and last - start > best[0]: best = (last - start, run)
        run = 0
    elif 'tick write failed' in line:
        if run == 0: start = t
        run += 1; last = t
if run and last is not None and last - start > best[0]: best = (last - start, run)
print(f"{best[0]:.0f}s across {best[1]} consecutive failures")
