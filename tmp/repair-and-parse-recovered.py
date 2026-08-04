import json
from json import JSONDecodeError
from pathlib import Path


SOURCES = [
    Path('tmp/recovered-gallery-prod-exhibitions.raw.bin'),
    Path('tmp/recovered-local-127-exhibitions.raw.bin'),
]


def decode_source(raw_bytes: bytes) -> str:
    # Stored values are UTF-16BE-like payloads in Chrome localStorage leveldb value.
    text = raw_bytes.decode('utf-16be', errors='ignore')
    # Keep printable chars and whitespace only.
    return ''.join(ch for ch in text if ord(ch) >= 32 or ch in '\n\r\t')


def try_repair(text: str, max_steps: int = 30000):
    s = text
    edits = 0

    for _ in range(max_steps):
        try:
            obj = json.loads(s)
            return obj, s, edits, None
        except JSONDecodeError as error:
            pos = error.pos
            msg = error.msg or ''

            if pos < 0 or pos >= len(s):
                return None, s, edits, error

            # 1) Remove invalid control chars.
            if 'Invalid control character' in msg:
                s = s[:pos] + s[pos + 1:]
                edits += 1
                continue

            # 2) Common corruption: missing closing quote before next key.
            # Pattern near error: ...:"value,<nextKey>
            if "Expecting ',' delimiter" in msg:
                start = s.rfind(':"', 0, pos)
                next_key_comma = s.find(',"', pos)
                if start != -1 and next_key_comma != -1:
                    segment = s[start + 2:next_key_comma]
                    # If no quote exists in this value segment, insert one before comma.
                    if '"' not in segment:
                        s = s[:next_key_comma] + '"' + s[next_key_comma:]
                        edits += 1
                        continue

            # 3) Fallback: drop one problematic character and continue.
            s = s[:pos] + s[pos + 1:]
            edits += 1

    return None, s, edits, RuntimeError('max repair steps exceeded')


def summarize(name: str, obj):
    if not isinstance(obj, list):
        return {'type': type(obj).__name__, 'exhibitions': 0, 'works': 0, 'goods': 0, 'artSoldWorks': 0, 'soldGoods': 0}

    works = 0
    goods = 0
    art_sold = 0
    goods_sold = 0
    for ex in obj:
        if not isinstance(ex, dict):
            continue
        works += len(ex.get('works') or ex.get('artWorks') or []) if isinstance(ex.get('works') or ex.get('artWorks') or [], list) else 0
        goods += len(ex.get('goods') or []) if isinstance(ex.get('goods') or [], list) else 0
        art_sold += len(ex.get('artSoldWorks') or ex.get('soldWorks') or []) if isinstance(ex.get('artSoldWorks') or ex.get('soldWorks') or [], list) else 0
        goods_sold += len(ex.get('soldGoods') or []) if isinstance(ex.get('soldGoods') or [], list) else 0

    return {
        'type': 'list',
        'exhibitions': len(obj),
        'works': works,
        'goods': goods,
        'artSoldWorks': art_sold,
        'soldGoods': goods_sold,
    }


def main():
    for src in SOURCES:
        if not src.exists():
            print('MISSING', src)
            continue

        raw = src.read_bytes()
        text = decode_source(raw)
        obj, repaired, edits, err = try_repair(text)

        print('\n===', src, '===')
        print('raw_len', len(raw), 'decoded_len', len(text), 'edits', edits)

        repaired_text_path = src.with_suffix('.repaired.json.txt')
        repaired_text_path.write_text(repaired, encoding='utf-8')
        print('WROTE', repaired_text_path)

        if obj is None:
            print('PARSE_FAILED', repr(err))
            continue

        parsed_path = src.with_suffix('.repaired.parsed.json')
        parsed_path.write_text(json.dumps(obj, ensure_ascii=False), encoding='utf-8')
        print('PARSE_OK', parsed_path)
        print('SUMMARY', summarize(src.name, obj))


if __name__ == '__main__':
    main()
