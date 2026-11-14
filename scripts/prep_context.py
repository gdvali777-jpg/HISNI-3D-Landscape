# Builds public/data/context.json from the OpenStreetMap snapshot (osm/area.json).
import json, math, hashlib
from shapely.geometry import Polygon, Point
SRC='/workspace/hisni/osm/area.json'
lat0, lon0 = 41.6858861, 44.8381523
R = 720
d = json.load(open(SRC))
els = d['elements']; ts = d['osm3s']['timestamp_osm_base']
nodes = {e['id']: e for e in els if e['type']=='node'}
kx = 111320*math.cos(math.radians(lat0)); ky = 110574
def xy(n): return ((n['lon']-lon0)*kx, (n['lat']-lat0)*ky)
def pts(w): return [xy(nodes[n]) for n in w['nodes'] if n in nodes]
site_polys=[]
for e in els:
    if e['type']=='way' and e['id'] in (127758171, 1138689091):
        site_polys.append(Polygon(pts(e)).buffer(2))
def in_site(p):
    c=Polygon(p).representative_point() if len(p)>=3 else Point(p[0])
    return any(s.contains(c) for s in site_polys)
def rnd(p): return [v for a in p for v in (round(a[0],1), round(-a[1],1))]  # scene: x east, z south
def hsh(i): return int(hashlib.md5(str(i).encode()).hexdigest()[:6],16)/0xffffff
def height(t, i):
    try:
        if 'height' in t: return float(str(t['height']).split()[0].replace(',','.'))
    except: pass
    try:
        if 'building:levels' in t: return float(t['building:levels'])*3.2 + 1
    except: pass
    b=t.get('building','yes')
    base={'detached':2,'house':2,'garage':1,'garages':1,'shed':1,'roof':1,'kiosk':1,'apartments':5,'industrial':2,'school':3,'retail':2,'commercial':3,'hotel':4,'construction':3,'ruins':1}.get(b,2.5)
    return round(base*3.1*(0.85+0.3*hsh(i))+1,1)
out={'meta':{'source':'© OpenStreetMap contributors (ODbL)','osm_timestamp':ts,'origin':[lat0,lon0],'radius_m':R,
      'note':'Heights from OSM height/building:levels where present, otherwise estimated by building type (illustrative).'},
     'buildings':[], 'roads':{}, 'green':[], 'water':[], 'rail':[], 'trees':[], 'pitches':[]}
roadw={'trunk':16,'trunk_link':8,'primary':14,'primary_link':8,'secondary':11,'secondary_link':7,'tertiary':9,'tertiary_link':6,'residential':6.5,'unclassified':6,'living_street':5,'service':4,'pedestrian':5,'footway':2,'path':1.6,'steps':2,'track':3,'construction':6}
nb=0
for e in els:
    if e['type']!='way': continue
    t=e.get('tags',{}); p=pts(e)
    if len(p)<2: continue
    cx=sum(a for a,b in p)/len(p); cy=sum(b for a,b in p)/len(p)
    if math.hypot(cx,cy)>R: continue
    if 'building' in t and len(p)>=4:
        if t.get('building') in ('roof',) : continue
        if in_site(p): continue
        out['buildings'].append({'h':height(t,e['id']),'p':rnd(p[:-1] if p[0]==p[-1] else p)}); nb+=1
    elif 'highway' in t and t['highway'] in roadw:
        out['roads'].setdefault(t['highway'],[]).append(rnd(p))
    elif t.get('leisure') in ('park','garden','playground') or t.get('landuse') in ('grass','forest','recreation_ground','meadow','village_green') or t.get('natural') in ('wood','scrub','grassland'):
        if len(p)>=4: out['green'].append(rnd(p[:-1]))
    elif t.get('leisure') in ('pitch','sports_centre','stadium','track') and len(p)>=4:
        out['pitches'].append(rnd(p[:-1]))
    elif t.get('natural')=='water' or t.get('waterway'):
        out['water'].append(rnd(p))
    elif t.get('railway') in ('subway','rail','tram') and t.get('tunnel')!='yes':
        out['rail'].append(rnd(p))
for e in els:
    if e['type']=='node' and e.get('tags',{}).get('natural')=='tree':
        x,y=xy(e)
        if math.hypot(x,y)<R: out['trees'].append([round(x,1),round(-y,1)])
for k in out['roads']: pass
json.dump(out, open('public/data/context.json','w'), separators=(',',':'), ensure_ascii=False)
print('buildings',nb,'roads',{k:len(v) for k,v in out['roads'].items()},'green',len(out['green']),'trees',len(out['trees']),'rail',len(out['rail']))
