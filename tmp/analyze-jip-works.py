import json
import re
from collections import Counter
from pathlib import Path

p = Path('tmp/recovered-gallery-prod-exhibitions.raw.repaired.parsed.json')
data = json.loads(p.read_text(encoding='utf-8'))
jip = next((e for e in data if str(e.get('id')) == '1785656102446'), None)
if not jip:
    print('NO JIP')
    raise SystemExit(1)

works = jip.get('works') or []
print('works', len(works), 'goods', len(jip.get('goods') or []), 'artWorks', len(jip.get('artWorks') or []))

prefix = Counter()
qty_nonempty = 0
qty_numeric = 0
qty_examples = []
cat = Counter()
auth = Counter()

for w in works:
    mn = str(w.get('manualNumber') or '')
    m = re.match(r'([A-Za-z]+)', mn)
    prefix[m.group(1) if m else '(none)'] += 1

    q = str(w.get('quantity') or '')
    if q.strip():
        qty_nonempty += 1
        if re.search(r'\d', q):
            qty_numeric += 1
        if len(qty_examples) < 20:
            qty_examples.append((mn, q, w.get('title')))

    c = str(w.get('category') or '').strip()
    if c:
        cat[c] += 1

    a = str(w.get('author') or '').strip()
    if a:
        auth[a] += 1

print('manual prefix top:', prefix.most_common(20))
print('quantity non-empty:', qty_nonempty, 'numeric-ish:', qty_numeric)
print('quantity samples:', qty_examples)
print('category top:', cat.most_common(20))
print('author top:', auth.most_common(10))
print('manual samples first 30:', [w.get('manualNumber') for w in works[:30]])
