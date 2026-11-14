# Builds public/data/apartments.json and plan images from the source folder (read-only).
import json, math, os, re, subprocess, hashlib
from PIL import Image
SRC='/workspace/hisni/source'
P2=SRC+'/Floor and Apartment Plans 2D'; P3=SRC+'/Floor and Apartment Plans 3D'
os.makedirs('public/plans',exist_ok=True)
types=[]
for f in sorted(os.listdir(P2), key=lambda s:(not s[0].isdigit(), int(s.split()[0]) if s[0].isdigit() else 0)):
    if not f[0].isdigit(): continue
    no=int(f.split()[0]); name=f[len(str(no))+1:-4]
    txt=subprocess.run(['pdftotext','-raw',P2+'/'+f,'-'],capture_output=True,text=True).stdout
    rooms=[float(x) for x in re.findall(r'(\d+\.\d{2}) ?მ',txt)]
    n=len(rooms)
    kind={4:'studio',5:'1br',9:'2br'}.get(n,'unknown')
    # plan images
    tmp='/tmp/plan_%d'%no
    subprocess.run(['pdftoppm','-r','110','-png','-singlefile',P2+'/'+f,tmp],check=True)
    im=Image.open(tmp+'.png').convert('RGB'); bb=Image.eval(im.convert('L'),lambda v:255-v).point(lambda v:255 if v>12 else 0).getbbox()
    if bb: im=im.crop((max(bb[0]-20,0),max(bb[1]-20,0),min(bb[2]+20,im.width),min(bb[3]+20,im.height)))
    im.thumbnail((1200,1200)); im.save('public/plans/type-%02d-2d.webp'%no,quality=80)
    f3=[x for x in os.listdir(P3) if x.startswith('%d '%no)]
    if f3:
        im=Image.open(P3+'/'+f3[0]).convert('RGB'); bb=Image.eval(im.convert('L'),lambda v:255-v).point(lambda v:255 if v>12 else 0).getbbox()
        if bb: im=im.crop(bb)
        im.thumbnail((1200,1200)); im.save('public/plans/type-%02d-3d.webp'%no,quality=78)
    types.append({'type_no':no,'type_name_ka':name,'kind':kind,'bedrooms':{'studio':0,'1br':1,'2br':2}.get(kind),
                  'room_areas_m2':sorted(rooms,reverse=True),'area_m2':round(sum(rooms),2),
                  'plan_2d':'plans/type-%02d-2d.webp'%no,'plan_3d':('plans/type-%02d-3d.webp'%no) if f3 else None,
                  'source_file':'Floor and Apartment Plans 2D/'+f})
# typical floor plan image
subprocess.run(['pdftoppm','-r','90','-png','-singlefile',P2+'/ბლოკი 3 (სართულის გეგმა).pdf','/tmp/floorplan'],check=True)
im=Image.open('/tmp/floorplan.png').convert('RGB'); bb=Image.eval(im.convert('L'),lambda v:255-v).point(lambda v:255 if v>12 else 0).getbbox(); im=im.crop(bb); im.thumbnail((1400,1400)); im.save('public/plans/block3-typical-floor.webp',quality=80)
# schematic slots around the ellipse, proportional to area
tot=sum(t['area_m2'] for t in types); acc=0
TOWER_ROT_DEG=55.5  # block III long-axis direction, degrees CCW from east (from masterplan)
A,B=30.5,15.5
dirs=['N','NE','E','SE','S','SW','W','NW']
for t in types:
    f0=acc/tot; acc+=t['area_m2']; f1=acc/tot
    t['slot']={'from':round(f0,4),'to':round(f1,4)}
    th=-2*math.pi*(f0+f1)/2   # clockwise from the "north" tip of the plan
    nx,ny=math.cos(th)/A, math.sin(th)/B
    r=math.radians(TOWER_ROT_DEG); wx=nx*math.cos(r)-ny*math.sin(r); wy=nx*math.sin(r)+ny*math.cos(r)
    ang=(90-math.degrees(math.atan2(wy,wx)))%360
    t['orientation']=dirs[int((ang+22.5)//45)%8]
def h(s): return int(hashlib.md5(s.encode()).hexdigest()[:8],16)/0xffffffff
apts=[]
for fl in range(6,37):
    for t in types:
        aid='B3-%02d-%02d'%(fl,t['type_no'])
        r=h(aid)
        status='available' if r<0.68 else ('reserved' if r<0.84 else 'sold')
        ppm=1300+fl*12+(60 if t['kind']=='studio' else 0)+int(h(aid+'p')*80)
        apts.append({'id':aid,'block':'III','floor':fl,'number':'%d%02d'%(fl,t['type_no']),'type_no':t['type_no'],
                     'status':status,'price_usd':int(round(ppm*t['area_m2'],-2)),'sample':True})
doc={'schema_version':1,
 'meta':{
  'project':'Hisni by Biograpi Living','generated_from':'Hisni For Web / Floor and Apartment Plans 2D + Infrastucture/ჰისნი - ბლოკი 3 ინფოქარდი.docx',
  'notes':[
   'Areas = sum of the room areas labelled on each apartment-type PDF (balcony/loggia included where labelled). Not an official sales area.',
   'kind (studio / 1br / 2br) inferred from room counts and matches the info card mix (4 studios, 11 one-bedroom, 4 two-bedroom per floor).',
   'Residential floors 6-36 (31 floors) x 19 apartments = 589, per the info card. Apartment numbering here (floor + type no.) is a DEMO convention, not official.',
   'slot / orientation = schematic position around the ellipse; the real position of each type on the typical floor plan is not labelled in the source files and must be confirmed.',
   'status and price_usd are SAMPLE DATA (sample=true) generated for the demo. Live values will come read-only from Bitrix24 CRM via src/data/adapter.js.'],
  'statuses':['available','reserved','sold'],
  'floor_height_m':3.45, 'residential_floors':[6,36]},
 'blocks':[{'id':'I','floors':36,'has_data':False},{'id':'II','floors':36,'has_data':False},{'id':'III','floors':36,'has_data':True,'typical_floor_plan':'plans/block3-typical-floor.webp'},{'id':'IV','floors':36,'has_data':False}],
 'types':types,'apartments':apts}
json.dump(doc,open('public/data/apartments.json','w'),ensure_ascii=False,indent=0)
print(len(types),'types',len(apts),'apartments'); print({t['type_no']:(t['kind'],t['area_m2'],t['orientation']) for t in types})
