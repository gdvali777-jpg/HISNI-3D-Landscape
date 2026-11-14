# Merges the Block I / Block II apartments published on biograpi.ge (saved page snapshot) into apartments.json.
# Source: /workspace/hisni/site_hi1.html (https://biograpi.ge/ka/hi1/apartments?view=grid), Nuxt payload, read-only.
import json, math, os, sys, collections, datetime
sys.path.insert(0, os.path.dirname(__file__))
from devalue import load, hydrate
SNAP = '/workspace/hisni/site_hi1.html'
snap_date = datetime.datetime.fromtimestamp(os.path.getmtime(SNAP)).strftime('%Y-%m-%d')
d = hydrate(load(SNAP))
ac = d['pinia']['page']['apartmentCatalogue']
STATUS = {s['id']: s['name'].lower() for s in ac['status'] if s['id'] in (17, 18, 19)}   # page's own definitions: 17 Available, 18 Reserved, 19 Sold
assert STATUS == {17: 'available', 18: 'reserved', 19: 'sold'}, STATUS
KIND = {52: 'studio', 10: '1br', 6: '2br', 11: '3br', 53: 'penthouse'}             # from apartment_types (page)
floors = {}
def walk(o, depth=0):
    if depth > 16: return
    if isinstance(o, dict):
        if 'block_id' in o and 'number' in o and 'slug' in o and isinstance(o.get('id'), int): floors[o['id']] = o
        for v in o.values(): walk(v, depth + 1)
    elif isinstance(o, list):
        for v in o: walk(v, depth + 1)
walk(d)
SITE_BLOCK = {318: 'I', 319: 'II'}   # site codes HISNI1 / HISNI2 ("ჰისნი", "ჰისნი II ბლოკი")
types = {t['id']: t for t in ac['types']}
doc = json.load(open('public/data/apartments.json'))
# Block III types get keys/codes
for t in doc['types']:
    t['key'] = 'III-%02d' % t['type_no']; t['code'] = 'III-%02d' % t['type_no']; t.pop('type_name_ka', None)
for a in doc['apartments']:
    a['type_key'] = 'III-%02d' % a.pop('type_no'); a['source'] = 'sample'
ctx = json.load(open('public/data/context.json')); TW = {t['id']: t for t in ctx['towers']}
dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
def facing(block, f):
    T = TW[block]; A = T.get('a', T.get('w', 30) / 2); B = T.get('b', T.get('d', 30) / 2)
    th = -2 * math.pi * f; nx, ny = math.cos(th) / A, math.sin(th) / B
    r = math.radians(T['rot']); wx = nx * math.cos(r) - ny * math.sin(r); wy = nx * math.sin(r) + ny * math.cos(r)
    return dirs[int(((90 - math.degrees(math.atan2(wy, wx))) % 360 + 22.5) // 45) % 8]
new_types = {}; new_apts = []
byfloor = collections.defaultdict(list)
for a in ac['apartments']:
    fl = floors[a['floor_id']]; blk = SITE_BLOCK[fl['block_id']]; byfloor[(blk, int(fl['number']))].append(a)
for (blk, fno), lst in sorted(byfloor.items()):
    lst.sort(key=lambda a: int(a['number']))
    tot = sum(float(a['space']) for a in lst); acc = 0
    for a in lst:
        t = types[a['type_id']]; key = f'{blk}-site{t["id"]}'
        if key not in new_types:
            rooms = sorted((float(v) for v in t['extra_attributes'].values() if str(v).replace('.', '', 1).isdigit()), reverse=True)
            new_types[key] = {'key': key, 'code': None, 'site_type_id': t['id'], 'kind': KIND.get(t['type_id'], 'unknown'),
                              'bedrooms': {'studio': 0, '1br': 1, '2br': 2, '3br': 3}.get(KIND.get(t['type_id'])),
                              'room_areas_m2': rooms, 'area_m2': round(sum(rooms), 2) if rooms else None,
                              'plan_2d': None, 'plan_3d': (t.get('image_3d') or {}).get('url'), 'source_file': 'biograpi.ge apartment type'}
        sp = float(a['space']); f0 = acc / tot; acc += sp; f1 = acc / tot
        ppm = str(a['price_per_m2'] or '').split('|')
        new_apts.append({'id': f'B{ {"I":1,"II":2}[blk] }-{fno:02d}-{int(a["number"]):03d}'.replace(' ', ''), 'block': blk, 'floor': fno,
                         'number': a['number'], 'type_key': key, 'area_m2': round(sp, 2),
                         'status': STATUS.get(a['status_id'], 'unknown'), 'price_usd': round(float(a['price'])) if a['price'] else None,
                         'price_per_m2_usd': float(ppm[0]) if ppm and ppm[0] else None,
                         'slot': {'from': round(f0, 4), 'to': round(f1, 4)}, 'orientation': facing(blk, (f0 + f1) / 2),
                         'sample': False, 'source': 'biograpi.ge', 'site_id': a['id'], 'site_page_path': a['page_path']})
# readable per-block type codes in order of first appearance
for blk in ('I', 'II'):
    n = 0
    for a in new_apts:
        if a['block'] != blk: continue
        t = new_types[a['type_key']]
        if t['code'] is None: n += 1; t['code'] = f'{blk}-{n:02d}'
doc['types'] = doc['types'] + list(new_types.values())
doc['apartments'] = [a for a in doc['apartments'] if a['block'] == 'III'] + new_apts
for b in doc['blocks']:
    if b['id'] in ('I', 'II'):
        b.update({'has_data': True, 'source': 'biograpi.ge', 'snapshot': snap_date, 'site_code': 'HISNI1' if b['id'] == 'I' else 'HISNI2',
                  'apartments_per_floor': collections.Counter(collections.Counter(a['floor'] for a in new_apts if a['block'] == b['id']).values()).most_common(1)[0][0]})
    if b['id'] == 'III': b.update({'source': 'sample', 'apartments_per_floor': 19})
doc['schema_version'] = 2
doc['meta']['site_snapshot'] = {'url': 'https://biograpi.ge/ka/hi1/apartments?view=grid', 'date': snap_date,
    'status_map': {'17': 'available', '18': 'reserved', '19': 'sold'}, 'note': 'Blocks I and II: status, price (total USD), price per m² and area as published on biograpi.ge at snapshot date. Site blocks HISNI1/HISNI2 are assumed to be master-plan Blocks I/II. Apartment position on the floor is schematic (site drawings are not linked to apartments in the payload).'}
doc['meta']['notes'] = [n for n in doc['meta']['notes'] if 'SAMPLE DATA' not in n] + ['Block III: status and price_usd are SAMPLE DATA (sample=true). Blocks I/II: real data from biograpi.ge snapshot (sample=false).']
json.dump(doc, open('public/data/apartments.json', 'w'), ensure_ascii=False, separators=(',', ':'))
c = collections.Counter((a['block'], a['status']) for a in doc['apartments'])
print(snap_date, len(doc['apartments']), dict(c), 'types', len(doc['types']))
print(collections.Counter((a['block'], new_types[a['type_key']]['kind']) for a in new_apts))
