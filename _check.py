import re
with open('docs/ISSUES.md') as f:
    content = f.read()

# Count all open (non-strikethrough) headings
open_count = 0
for m in re.finditer(r'^#### (.+)$', content, re.MULTILINE):
    title = m.group(1)
    if not title.startswith('~~'):
        open_count += 1
        print(f'  OPEN: {title}')

# Count closed
closed_count = len(re.findall(r'^#### ~~', content, re.MULTILINE))
print(f'\nTotal open: {open_count}, Total closed: {closed_count}')

# Also check P3 specifically
p3_open = 0
for m in re.finditer(r'^#### (P3-\d+\..+)$', content, re.MULTILINE):
    p3_open += 1
    print(f'  P3 OPEN: {m.group(1)}')

p3_closed = len(re.findall(r'^#### ~~P3-', content, re.MULTILINE))
print(f'\nP3 open: {p3_open}, P3 closed: {p3_closed}')
