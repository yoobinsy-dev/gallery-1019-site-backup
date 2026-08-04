import json
import hashlib
from pathlib import Path

TARGET = '1785656102446'
INPUTS = [
    Path('tmp/recovered-gallery-prod-exhibitions.raw.repaired.json.txt'),
    Path('tmp/recovered-gallery-prod-exhibitions.raw.carved.utf16.json'),
    Path('tmp/recovered-gallery-prod-exhibitions.raw.carved.utf8.json'),
    Path('tmp/recovered-gallery-prod-exhibitions.utf16le.txt'),
    Path('tmp/recovered-gallery-prod-exhibitions.utf8.json'),
    Path('tmp/recovered-gallery-prod-exhibitions.raw.bin'),
]


def decode_text(path: Path) -> str:
    b = path.read_bytes()
    if path.suffix == '.bin':
        # Chrome localStorage value payload was UTF-16BE-ish in previous scripts.
        t = b.decode('utf-16be', errors='ignore')
    else:
        try:
            t = b.decode('utf-8')
        except UnicodeDecodeError:
            t = b.decode('utf-8', errors='ignore')
    # keep printable and whitespace
    return ''.join(ch for ch in t if ord(ch) >= 32 or ch in '\n\r\t')


def extract_balanced_object(s: str, start: int):
    if start < 0 or start >= len(s) or s[start] != '{':
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == '"':
                in_str = False
            continue

        if ch == '"':
            in_str = True
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return s[start:i + 1]
            if depth < 0:
                return None
    return None


def summarize(ex):
    works = ex.get('works') if isinstance(ex.get('works'), list) else []
    goods = ex.get('goods') if isinstance(ex.get('goods'), list) else []
    art_works = ex.get('artWorks') if isinstance(ex.get('artWorks'), list) else []
    sold = ex.get('soldWorks') if isinstance(ex.get('soldWorks'), list) else []
    art_sold = ex.get('artSoldWorks') if isinstance(ex.get('artSoldWorks'), list) else []
    sold_goods = ex.get('soldGoods') if isinstance(ex.get('soldGoods'), list) else []

    return {
        'title': ex.get('title'),
        'works': len(works),
        'goods': len(goods),
        'artWorks': len(art_works),
        'soldWorks': len(sold),
        'artSoldWorks': len(art_sold),
        'soldGoods': len(sold_goods),
        'works_first': [w.get('manualNumber') for w in works[:8] if isinstance(w, dict)],
        'goods_first': [g.get('manualNumber') for g in goods[:8] if isinstance(g, dict)],
    }


all_rows = []
seen = set()

for p in INPUTS:
    if not p.exists():
        continue

    text = decode_text(p)
    marker = '{"id":' + TARGET
    idx = 0
    count_hits = 0
    count_parsed = 0

    while True:
        i = text.find(marker, idx)
        if i == -1:
            break
        count_hits += 1
        idx = i + 1

        obj_txt = extract_balanced_object(text, i)
        if not obj_txt:
            continue
        digest = hashlib.sha256(obj_txt.encode('utf-8', errors='ignore')).hexdigest()
        if digest in seen:
            continue
        try:
            obj = json.loads(obj_txt)
        except Exception:
            continue

        seen.add(digest)
        count_parsed += 1
        all_rows.append({
            'source': str(p),
            'digest': digest,
            'summary': summarize(obj),
        })

    print('SCAN', p, 'hits', count_hits, 'unique_parsed', count_parsed)

print('\nTOTAL_UNIQUE_CANDIDATES', len(all_rows))
for n, row in enumerate(all_rows, 1):
    s = row['summary']
    print(f"\n[{n}] {row['source']}")
    print('  title=', s['title'])
    print('  counts=', {k: s[k] for k in ['works', 'goods', 'artWorks', 'soldWorks', 'artSoldWorks', 'soldGoods']})
    print('  works_first=', s['works_first'])
    print('  goods_first=', s['goods_first'])

out = Path('tmp/jip-candidates-summary.json')
out.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2), encoding='utf-8')
print('\nWROTE', out)
