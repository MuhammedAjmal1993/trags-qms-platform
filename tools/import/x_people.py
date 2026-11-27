import sys; sys.path.insert(0,'/tmp/build')
from common import *
import collections, openpyxl
P='/tmp/in/08 People (inspector master list, org chart)/List of Emp..xlsx'
ppl={}
def key(emp,name): return str(emp).strip() if emp else norm(name)
for sh,status in [('Quality','Active'),('Jr.','Active'),('Left ','Left')]:
    M=[('sl no','-'),('sr no','-'),('emp no','emp_no'),('employee name','name'),('company designation','designation'),('location','site'),('remarks','remarks'),('remarks2','remarks2'),('replacement','replacement')]
    rs,h=rows(P,sh,3,M)
    for r in rs:
        if not r.get('name'): continue
        st=status
        rem=' '.join(str(r.get(x,'')) for x in ('remarks','remarks2')).strip()
        if sh=='Left ':
            st='Left' if 'left' in rem.lower() or not rem else ('On Leave' if 'leave' in rem.lower() else 'Left')
        k=key(r.get('emp_no'),r['name'])
        cur=ppl.get(k,{})
        if cur and cur.get('status')=='Active' and st!='Active': continue
        d={'emp_no':str(r['emp_no']).strip() if r.get('emp_no') else None,'name':r['name'],'designation':r.get('designation'),'site':r.get('site'),'status':st,
           'discipline':'Junior Engineer' if sh=='Jr.' else None,'remarks':(rem+(f"; replacement: {r['replacement']}" if r.get('replacement') else '')).strip('; ') or None}
        ppl[k]={**cur,**{a:b for a,b in d.items() if b}}
# personal allocation
F=IN+'10- Personal Allocation Register.xlsx'
M=[('s n','-'),('unique identification numbers uid','-'),('primary category','-'),('sub category','designation'),('won','won'),('location','site'),('emp no','emp_no'),
   ('employee name','name'),('mobile no 1','mobile'),('mobile no 2','-'),('e mail','work_email')]+[(m,m) for m in ['january','february','march','april','may','june','july','august','september','october','november','december']]+[('remarks','remarks')]
rs,h=rows(F,'PERSONAL ALLOCATION',1,M)
for r in rs:
    if not r.get('name'): continue
    k=key(r.get('emp_no'),r['name'])
    alloc='; '.join(f"{m[:3].title()}: {r[m]}" for m in ['january','february','march','april','may','june','july','august','september','october','november','december'] if r.get(m))
    cur=ppl.get(k)
    if not cur:
        # match by name
        nk=[kk for kk,v in ppl.items() if norm(v.get('name')).split()[:2]==norm(r['name']).split()[:2]]
        cur=ppl.get(nk[0]) if nk else None
        k=nk[0] if nk else k
    base=cur or {'emp_no':str(r.get('emp_no') or '').strip() or None,'name':str(r['name']).title(),'designation':str(r.get('designation') or '').title(),'status':'Not on current list'}
    if r.get('mobile'): base['mobile']=str(r['mobile']).strip()
    if r.get('work_email'): base['work_email']=str(r['work_email']).strip()
    if r.get('won'): base['won']=str(r['won']).split()[0]
    if alloc: base['allocation']=alloc
    if not base.get('site') and r.get('site'): base['site']=r['site']
    ppl[k]=base
# org chart reporting lines (Jan 2026 chart)
REPORTS={'Rajesh Verma':'Ivan Morgan (General Manager)'}
mgr={'Abdel Rahman':['Irfan Ali','Daryl Natavio','Mohammaed Masood'],
     'Nageswara Rao':['Dishil P V','Uppili Narayana','Durga Prasad','Sony Varghese','Sreejith TR','Girish Kumar'],
     'Elumalayi Periyayi':['Joshy John','Bipin Raj','M. Velmani','Jayakrishna','Sujith Kumar'],
     'Trags Fab Shop':['Muhammad Usman','Vishnu Vijay','Kannan Satheesan','Anil Rajak','Sunilkumar','Abdulla Allabagas'],
     'Anil Thomas':['Paramasivam','Balamurugan Ganapathi','Gnanaprakasam','Balakumar','Shahas Fazil','Arun Pandian'],
     'Prasanth Nattukkalingal':['Binto George','Abraham Perumal','Pondurai Arumugam','Adersh'],
     'Sarang Kottangal':['Afees Kareem','Rasin Lal','Sebin Raphael']}
def find(name):
    n=norm(name).split()
    for k,v in ppl.items():
        vn=norm(v.get('name')).split()
        if vn and n and vn[0]==n[0] and (len(n)==1 or len(vn)>1 and (n[1][:3]==vn[1][:3] or n[-1][:3] in [x[:3] for x in vn])): return v
    return None
for m,subs in mgr.items():
    mv=find(m) if m!='Trags Fab Shop' else None
    if mv: mv['reports_to']='Rajesh Verma'
    for s in subs:
        sv=find(s)
        if sv: sv['reports_to']=mv['name'] if mv else 'TRAGS Fab Shop (QA/QC)'
rv=find('Rajesh Verma')
if rv: rv['reports_to']='Ivan Morgan (General Manager)'
for n in ['Muhammed Ajmal','Muhammed Jasir','Fazilath Jalal']:
    v=find(n)
    if v: v['reports_to']='Rajesh Verma'
out=list(ppl.values())
print(collections.Counter(v.get('status') for v in out), sum(1 for v in out if v.get('reports_to')))
save('PPL',out)
# ---------- TLB
rs,h=rows('/tmp/in/07 Training Library list/TRAGS_Training_Material_Register_Rev1.xlsx','Sheet1',1,[('sl no','sn'),('training topic','title'),('department function process','category'),('target audience','audience'),('duration hrs','duration_hrs')])
tl=[{'ref':f"TM-{int(r['sn']):03d}",'title':r['title'],'category':r.get('category'),'audience':r.get('audience'),'duration_hrs':r.get('duration_hrs'),'status':'Available','owner':'QA/QC','tags':'Training Material Register Rev1'} for r in rs if r.get('title') and isinstance(r.get('sn'),(int,float))]
save('TLB',tl)
# ---------- AWD (trade award nominations)
F=IN+'30-Trade Award Master Register.xlsx'
M=[('month yyyy mm','date'),('welder name','winner'),('welder id','welder_id'),('emp no','emp_no'),('work order','won'),('project site','site'),('welder category','craft'),
   ('nominator pm head','nominator'),('productivity 1 5','productivity'),('quality 1 5','quality'),('safety behaviour 1 5','safety'),('total auto','total'),('status','status'),('month year selected','selected_month')]
rs,h=rows(F,'Nomination Log',3,M)
aw=[]
for r in rs:
    if not r.get('winner'): continue
    d=r.get('date'); sel=r.pop('selected_month',None)
    r['award']='Welder of the Month'; r['period']=str(d)[:7] if d else None; r['won']=won(r.get('won'))
    r['emp_no']=str(r['emp_no']) if r.get('emp_no') else None
    if sel: r['criteria']=f"Selected for {str(sel)[:7]}"
    r['site']=str(r.get('site') or '').strip() or None
    aw.append(r)
aw.append({'award':'Quality Performer of the Year','period':'2025','winner':'Combined Project Team (led by Jad Azar, Project Manager)','date':'2026-10-13','status':'Winner',
           'criteria':'Presented by the General Manager, Mr. Ivan Morgan, at TRAGS Head Office. Nominations received from 14 departments and project teams.'})
print(collections.Counter(r.get('status') for r in aw))
save('AWD',aw)
