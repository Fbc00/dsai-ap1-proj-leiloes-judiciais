import re
import sys

lines = open(sys.argv[1], encoding='utf-8').read().splitlines()
out = []
grab = False
for i, l in enumerate(lines, 1):
    if l.startswith('### Task'):
        out.append(f'{i}: {l}')
        grab = False
    if l.startswith('**Files:**') or l.startswith('**Interfaces:**'):
        grab = True
    elif grab and re.match(r'^- \[ \] \*\*Step', l):
        grab = False
    if grab:
        out.append(f'{i}: {l}')
print('\n'.join(out))
