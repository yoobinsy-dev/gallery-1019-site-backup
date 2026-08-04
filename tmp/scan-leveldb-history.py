from pathlib import Path
import re

base = Path.home() / 'Library/Application Support/Google/Chrome/Default/Local Storage/leveldb'
domain = b'_https://gallery-1019-site.vercel.app'
marker = b'exhibitions'

files = sorted(list(base.glob('*.ldb')) + list(base.glob('*.log')))

print('BASE', base)
for f in files:
    b = f.read_bytes()
    domain_offsets = [m.start() for m in re.finditer(re.escape(domain), b)]
    if not domain_offsets:
        continue

    hits = []
    for off in domain_offsets:
        window_end = min(len(b), off + 240)
        window = b[off:window_end]
        m = re.search(re.escape(marker), window)
        if m:
            hits.append((off, off + m.start()))

    if not hits:
        continue

    print('\nFILE', f.name, 'SIZE', len(b), 'DOMAIN_MATCHES', len(domain_offsets), 'HITS', len(hits))
    for i, (domain_off, marker_off) in enumerate(hits[:20], 1):
        s = max(0, domain_off - 80)
        e = min(len(b), marker_off + 900)
        chunk = b[s:e]
        txt = chunk.decode('utf-8', errors='ignore').replace('\n', ' ')
        print('  HIT', i, 'DOMAIN_OFFSET', domain_off, 'MARKER_OFFSET', marker_off)
        print('   ', txt[:420])
