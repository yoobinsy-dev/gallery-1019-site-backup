import json
from pathlib import Path


def inspect(path_str):
    path = Path(path_str)
    if not path.exists():
        print('MISSING', path)
        return

    raw = path.read_bytes()
    text = raw.decode('utf-16be', errors='ignore')
    cleaned = ''.join(ch for ch in text if ord(ch) >= 32 or ch in '\n\r\t')

    print(f'\n=== {path} ===')
    print('len_raw', len(text), 'len_clean', len(cleaned))

    for label, payload in [('raw', text), ('clean', cleaned)]:
        try:
            obj = json.loads(payload)
            print(label, 'PARSE_OK', 'type', type(obj).__name__, 'len', len(obj) if isinstance(obj, list) else 'n/a')
            out = path.with_suffix(f'.{label}.parsed.json')
            out.write_text(json.dumps(obj, ensure_ascii=False), encoding='utf-8')
            print('WROTE', out)
        except Exception as error:
            print(label, 'PARSE_ERR', error)
            pos = getattr(error, 'pos', None)
            if isinstance(pos, int):
                s = max(0, pos - 120)
                e = min(len(payload), pos + 220)
                snippet = payload[s:e]
                print('CONTEXT', repr(snippet))


inspect('tmp/recovered-gallery-prod-exhibitions.raw.bin')
inspect('tmp/recovered-local-127-exhibitions.raw.bin')
