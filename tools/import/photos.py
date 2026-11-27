from PIL import Image
import io, os, json, zipfile, hashlib
B='/tmp/in/06 Branding (logo, photos, colours)/'
def save_jpg(im,name,maxw=1600,q=80):
    im=im.convert('RGB'); im.thumbnail((maxw,maxw)); p=f'/tmp/build/files/{name}.jpg'; im.save(p,'JPEG',quality=q,optimize=True,progressive=True); return p
lg=Image.open(B+'Trags logo - High Quality Transparent.png'); lg=lg.crop(lg.getbbox()); lg.thumbnail((900,900)); lg.save('/tmp/build/files/logo.png',optimize=True)
save_jpg(Image.open('/tmp/pdfimg/p1-003.png'),'hero',1920,82)
P=[]
def add(src,name,title,typ,date,public,location=None,notes=None,crop=None,maxw=1600):
    im=Image.open(src) if isinstance(src,str) else src
    if crop: im=im.crop(crop)
    p=save_jpg(im,name,maxw); P.append({'file':p,'title':title,'type':typ,'date':date,'public':public,'location':location,'notes':notes})
add('/tmp/pdfimg/p1-003.png','pho_hq','TRAGS Head Office and Fabrication Shop','Facility','2026-11-26','Yes','Doha, Qatar')
add(B+'Air Liquide visit.jpeg','pho_visit','Client delegation visit to the TRAGS Fabrication Shop','Client Visit','2026-10-06','Yes','TRAGS Fabrication Shop')
add(B+'TRAGS_Quality_Performer_2025_Poster.png','pho_qpa','Quality Performer of the Year 2025 – award presentation','Recognition','2026-10-13','Yes','Head Office')
add(B+'TRAGS_Quality_Performer_2025_Corporate_Poster.png','pho_qpa2','Quality Performer of the Year 2025 – corporate poster','Recognition','2026-10-13','Yes','Head Office')
s=4494/1100
for i,(x0,y0,x1,y1) in enumerate([(42,222,362,438),(390,216,710,438),(738,216,1058,438)]):
    add(B+'World Quality Week 2026.png',f'pho_wqw{i+1}',f'World Quality Week 2026 at TRAGS – site celebration {i+1}','World Quality Week','2026-11-09','Yes','Project sites',crop=(int(x0*s),int(y0*s),int(x1*s),int(y1*s)))
for i,(f,t) in enumerate([('s25_11.jpg','welder'),('s25_12.jpg','fabricator & fitter'),('s25_13.jpg','NDT')]):
    add('/tmp/pptimg/'+f,f'pho_trn{i+1}',f'Standby training – {t} training','Training','2026-07-01','Yes','Site training room')
for i,f in enumerate(['s41_50.png','s41_51.png','s41_52.png']):
    add('/tmp/pptimg/'+f,f'pho_wa{i+1}',f'Monthly Welder Award ceremony {i+1}','Recognition','2026-09-15','Yes','Head Office')
add('/tmp/pptimg/s6_6.png','pho_scope','TRAGS certification scope','Infographic','2026-10-13','Yes',None,maxw=1700)
add('/tmp/pptimg/s46_41.png','pho_medal','Quality Performer of the Year 2025 medal','Recognition','2026-10-13','Yes',None,maxw=800)
add('/tmp/pptimg/s1_0.png','pho_mrm','MRM 26/02 cover – Half-Yearly Review Jan–Jun 2026','Management Review','2026-10-13','No','Al Manara Building, Doha')
months={'Jan 2026 - input quality.docx':'2026-01-08','Mar 2026 - input quality.docx':'2026-04-21','May 2026 - input quality.docx':'2026-04-27','Jun 2026 - input quality _ R0.docx':'2026-05-20',
        'July 2026 - input quality _ R1.docx':'2026-07-15','Aug- input quality.docx':'2025-08-30','Sep 2026 - input quality _ R0 rec.docx':'2026-09-29','Oct 2026 - input quality _ R0.docx':'2026-10-28'}
seen=set(); n=0
for f,d in months.items():
    z=zipfile.ZipFile(B+f)
    for nm in z.namelist():
        if not nm.startswith('word/media/') or not nm.lower().endswith(('.jpg','.jpeg','.png')): continue
        b=z.read(nm); h=hashlib.md5(b).hexdigest()
        if h in seen or len(b)<60000: continue
        seen.add(h)
        try:
            im=Image.open(io.BytesIO(b)); im.load()
        except Exception: continue
        if im.size[0]<500: continue
        n+=1; label=f.split(' - ')[0].split('-')[0].strip()
        add(im,f'pho_news{n:02d}',f'TRAGS Times news photo – {label} {n}','News',d,'No',None,notes=f'From {f}')
print('photos',len(P),'news imgs',n, sum(os.path.getsize(p['file']) for p in P)//1024,'KB')
json.dump(P,open('/tmp/build/raw/_photos.json','w'),ensure_ascii=False)
