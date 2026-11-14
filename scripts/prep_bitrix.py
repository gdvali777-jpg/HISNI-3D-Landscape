# Replaces the Block III sample apartments with the read-only Bitrix24 catalog export (/workspace/hisni/bitrix_block3.csv).
# Run after prep_apartments.py and prep_site.py. deal_id and other CRM-internal fields are NOT shipped.
import csv, json, collections
SRC = '/workspace/hisni/bitrix_block3.csv'
SNAP = '2026-11-14'
STATUS = {'free': 'available', 'reserved': 'reserved', 'sold': 'sold', 'NFS': 'nfs', 'queue': 'queue'}
DIRS = {'ჩრდილოეთი': 'N', 'ჩრდილო-აღმოსავლეთი': 'NE', 'აღმოსავლეთი': 'E', 'სამხრეთ-აღმოსავლეთი': 'SE', 'სამხრეთი': 'S',
        'სამხრეთ-დასავლეთი': 'SW', 'დასავლეთი': 'W', 'ჩრდილო-დასავლეთი': 'NW'}
KIND = {0: 'studio', 1: '1br', 2: '2br'}
doc = json.load(open('public/data/apartments.json'))
types = {t['key']: t for t in doc['types'] if t['key'].startswith('III-')}
# PDF type number <- apartment-type name (the PDF file names are "<n> <name>.pdf"); Bitrix spells type 16 "თლია", the PDF "თლიე"
pdf_by_name = {t['source_file'].rsplit('/', 1)[-1][:-4].split(' ', 1)[1]: k for k, t in types.items()}
pdf_by_name['თლია'] = pdf_by_name.pop('თლიე')
rows = list(csv.DictReader(open(SRC, encoding='utf-8')))
assert len(rows) == 589
code2type, issues, apts = {}, [], []
for r in rows:
    n = dict(kv.split('=', 1) for kv in r['notes'].split('; ') if '=' in kv)
    code = int(n['layout_type_code']); key = pdf_by_name.get(n['name'])
    if key is None: issues.append(('no PDF type for name', r['apartment_no'], n['name'])); continue
    code2type.setdefault(code, set()).add(key)
    ty = types[key]; bd = int(r['rooms_or_type'].split('=')[1])
    if KIND[bd] != ty['kind']: issues.append(('kind mismatch', r['apartment_no'], key))
    o = n.get('orientation', '').replace(' - ', '-').strip()
    ori = DIRS.get(o)
    if o and ori is None: issues.append(('orientation unreadable -> blank', r['apartment_no'], o))
    st = STATUS[r['status']]; fl = int(r['floor']); no = int(r['apartment_no'])
    apts.append({'id': f'B3-{fl:02d}-{no:03d}', 'block': 'III', 'floor': fl, 'number': str(no), 'type_key': key,
                 'area_m2': float(r['area_sqm']), 'living_m2': float(n['living_sqm']), 'summer_m2': float(n['summer_area_sqm']),
                 'bedrooms': bd, 'layout_code': code, 'status': st,
                 'price_usd': None if st == 'nfs' else round(float(r['price_total'])),
                 'price_per_m2_usd': None if st == 'nfs' else float(r['price_per_sqm']),
                 'slot': ty['slot'], 'orientation': ori, 'sample': False, 'source': 'bitrix24'})
amb = {c: s for c, s in code2type.items() if len(s) > 1}
assert not amb, amb
for k, ty in types.items():
    ty['bitrix_layout_codes'] = sorted(c for c, s in code2type.items() if k in s)
doc['apartments'] = [a for a in doc['apartments'] if a['block'] != 'III'] + sorted(apts, key=lambda a: (a['floor'], int(a['number'])))
for b in doc['blocks']:
    if b['id'] == 'III': b.update({'has_data': True, 'source': 'bitrix24', 'snapshot': SNAP, 'apartments_per_floor': 19})
doc['meta']['bitrix_snapshot'] = {'date': SNAP, 'block': 'III', 'status_map': STATUS, 'price': 'list price, USD',
    'plan_match': 'Bitrix apartment-type name = PDF file name (19 types); each layout_type_code maps to exactly one type (4 codes per type, by floor band).'}
doc['meta']['notes'] = [x for x in doc['meta']['notes'] if 'Block III' not in x] + ['Block III: Bitrix24 catalog snapshot 2026-11-14 (list prices; NFS prices withheld). Blocks I/II: biograpi.ge snapshot.']
json.dump(doc, open('public/data/apartments.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(collections.Counter(a['status'] for a in apts), len(apts))
print('issues', issues)
print({k: ty['bitrix_layout_codes'] for k, ty in types.items()})
