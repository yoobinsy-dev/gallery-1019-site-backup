import json
import re
from pathlib import Path

src = Path('tmp/recovered-gallery-prod-exhibitions.raw.carved.utf16.json')
if not src.exists():
    raise SystemExit('missing source file')

text = src.read_text(encoding='utf-8', errors='ignore')

# Normalize control chars to keep regex stable.
text_norm = ''.join(ch if ord(ch) >= 32 else ' ' for ch in text)

records = []
for m in re.finditer(r'"soldAtKst"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2})"', text_norm):
    at = m.start()
    s = max(0, at - 1200)
    e = min(len(text_norm), at + 1200)
    chunk = text_norm[s:e]

    def pick(pattern):
        mm = re.search(pattern, chunk)
        return mm.group(1) if mm else ''

    rec = {
        'id': pick(r'"id"\s*:\s*([0-9]{6,})'),
        'workId': pick(r'"workId"\s*:\s*([0-9]{6,})'),
        'itemType': pick(r'"itemType"\s*:\s*"([^"]*)"'),
        'manualNumber': pick(r'"manualNumber"\s*:\s*"([^"]*)"'),
        'title': pick(r'"title"\s*:\s*"([^"]*)"'),
        'author': pick(r'"author"\s*:\s*"([^"]*)"'),
        'price': pick(r'"price"\s*:\s*"([^"]*)"'),
        'soldQuantity': pick(r'"soldQuantity"\s*:\s*([0-9]+)'),
        'soldAtKst': m.group(1),
        'buyerName': pick(r'"buyerName"\s*:\s*"([^"]*)"'),
        'buyerPhone': pick(r'"buyerPhone"\s*:\s*"([^"]*)"'),
        'paymentMethod': pick(r'"paymentMethod"\s*:\s*"([^"]*)"'),
        'paymentMethodEtc': pick(r'"paymentMethodEtc"\s*:\s*"([^"]*)"'),
        'saved': pick(r'"saved"\s*:\s*(true|false)')
    }

    key = (rec['id'], rec['workId'], rec['soldAtKst'], rec['price'])
    if key not in {(r['id'], r['workId'], r['soldAtKst'], r['price']) for r in records}:
        records.append(rec)

records.sort(key=lambda x: (x.get('soldAtKst') or '', x.get('id') or ''))

out = Path('tmp/recovered-gallery-prod-sales-records.json')
out.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')

print('EXTRACTED', len(records), 'records')
print('OUT', out)
for r in records[:10]:
    print(r)
