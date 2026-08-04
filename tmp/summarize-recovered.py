import json
from pathlib import Path

paths = [
    Path('tmp/recovered-gallery-prod-exhibitions.raw.repaired.parsed.json'),
    Path('tmp/recovered-local-127-exhibitions.raw.repaired.parsed.json'),
    Path('tmp/remote-exhibitions-backup-before-restore.json'),
]


def counts(ex):
    return {
        'works': len(ex.get('works') or []) if isinstance(ex.get('works'), list) else 0,
        'artWorks': len(ex.get('artWorks') or []) if isinstance(ex.get('artWorks'), list) else 0,
        'goods': len(ex.get('goods') or []) if isinstance(ex.get('goods'), list) else 0,
        'soldWorks': len(ex.get('soldWorks') or []) if isinstance(ex.get('soldWorks'), list) else 0,
        'artSoldWorks': len(ex.get('artSoldWorks') or []) if isinstance(ex.get('artSoldWorks'), list) else 0,
        'soldGoods': len(ex.get('soldGoods') or []) if isinstance(ex.get('soldGoods'), list) else 0,
    }

for p in paths:
    if not p.exists():
        print('MISSING', p)
        continue
    data = json.loads(p.read_text(encoding='utf-8'))
    print('\n===', p, 'exhibitions', len(data), '===')
    for ex in data:
        c = counts(ex)
        print('ID', ex.get('id'), 'TITLE', (ex.get('title') or '')[:80], c)

        # Show first few item markers for quick sanity check
        works = ex.get('works') if isinstance(ex.get('works'), list) else []
        goods = ex.get('goods') if isinstance(ex.get('goods'), list) else []
        if works:
            sample = works[:3]
            print('  works_sample', [
                {
                    'id': w.get('id'),
                    'no': w.get('manualNumber'),
                    'title': w.get('title'),
                    'qty': w.get('quantity')
                } for w in sample
            ])
        if goods:
            sample = goods[:3]
            print('  goods_sample', [
                {
                    'id': w.get('id'),
                    'no': w.get('manualNumber'),
                    'title': w.get('title'),
                    'qty': w.get('quantity')
                } for w in sample
            ])
