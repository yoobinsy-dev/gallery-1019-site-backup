from pathlib import Path

ROOTS = [
    Path.home() / 'Library/Application Support/Google/Chrome',
    Path.home() / 'Library/Application Support/Google/Chrome Beta',
    Path.home() / 'Library/Application Support/BraveSoftware/Brave-Browser',
    Path.home() / 'Library/Application Support/Microsoft Edge',
    Path.home() / 'Library/Application Support/Arc/User Data',
    Path.home() / 'Library/Application Support/Chromium',
]

TARGETS = [
    b'_https://gallery-1019-site.vercel.app_exhibitions',
    b'_https://gallery-1019-site.vercel.app',
    b'gallery-1019-site.vercel.app',
    b'exhibitions',
]

for root in ROOTS:
    if not root.exists():
        continue
    print('\n=== ROOT', root, '===')

    for prof in sorted(root.glob('*')):
        if not prof.is_dir():
            continue
        leveldb = prof / 'Local Storage' / 'leveldb'
        if not leveldb.exists():
            continue

        total_hits = {t.decode('utf-8', errors='ignore'): 0 for t in TARGETS}
        scanned_bytes = 0
        files = list(leveldb.glob('*.ldb')) + list(leveldb.glob('*.log')) + [leveldb / 'LOG', leveldb / 'LOG.old']

        for f in files:
            if not f.exists() or not f.is_file():
                continue
            b = f.read_bytes()
            scanned_bytes += len(b)
            for t in TARGETS:
                total_hits[t.decode('utf-8', errors='ignore')] += b.count(t)

        if any(v > 0 for v in total_hits.values()):
            print('PROFILE', prof.name, 'bytes_scanned', scanned_bytes, 'hits', total_hits)
