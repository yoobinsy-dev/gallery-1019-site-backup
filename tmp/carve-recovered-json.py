import json
from pathlib import Path

FILES = [
    Path('tmp/recovered-gallery-prod-exhibitions.raw.bin'),
    Path('tmp/recovered-local-127-exhibitions.raw.bin'),
]

for p in FILES:
    if not p.exists():
        continue

    b = p.read_bytes()
    print(f"\n=== {p} bytes={len(b)} ===")
    print('HEAD_HEX', b[:32].hex())
    print('TAIL_HEX', b[-32:].hex())

    t16 = b.decode('utf-16be', errors='ignore')
    start16 = t16.find('[')
    end16 = t16.rfind(']')
    print('UTF16 start/end', start16, end16)

    if start16 == -1 or end16 == -1 or end16 <= start16:
        print('CARVE_SKIPPED')
        continue

    cand16 = t16[start16:end16 + 1]
    carved_path = p.with_suffix('.carved.utf16.json')
    carved_path.write_text(cand16, encoding='utf-8')
    print('WROTE', carved_path, 'chars', len(cand16))

    try:
        obj = json.loads(cand16)
        print('PARSE_OK', 'array_len', len(obj) if isinstance(obj, list) else 'n/a')
    except Exception as error:
        print('PARSE_ERR', str(error))
        print('HEAD', cand16[:200])
        print('TAIL', cand16[-200:])
