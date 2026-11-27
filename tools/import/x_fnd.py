import sys; sys.path.insert(0,'/tmp/build')
from common import *
import collections
M=[('uid','uid'),('uni*','uid'),('primary category','primary'),('sub category','sub_category'),('external internal','ext_int'),('won','won'),('client','client'),
   ('issue date','issue_date'),('months','-'),('finding no','finding_no'),('type of finding','nature'),('finding category','finding_type'),('ncr','finding_type'),
   ('criticality of finding','criticality'),('report no ref no','report_no'),('raised by','raised_by'),('process area department','process'),('location','location'),
   ('recipient*','recipient'),('actionee','actionee'),('description*','description'),('correction*','correction'),('analysis*','root_cause'),
   ('corrective action to*','corrective_action'),('corrective action approval date','ca_approval_date'),('current status','status'),('closeout date','closeout_date'),
   ('reference no of risk register*','risk_ref'),('associated cost manpower','cost_manpower'),('associated material','cost_material'),('overdue','-'),
   ('direct accountable person','accountable'),('remarks','remarks'),('issue category','issue_category'),('issue group','issue_group'),
   ('secondary category','secondary_category'),('nature of issue','nature_of_issue'),('root cause theme','root_cause_theme')]
F=IN+'02- Finding Register.xlsx'
allr=[]
for sh,hr in [('2020',1),('2021',1),('2022',1),('2023',1),('2024',1),('2025',1),('Data-2026',4)]:
    rs,h=rows(F,sh,hr,M)
    miss=[k for k in h if h[k] is None and k]
    rs=[r for r in rs if r.get('description') or r.get('finding_no') or r.get('report_no')]
    for r in rs: r['_sheet']=sh
    print(sh,len(rs),'unmapped:',miss[:8])
    allr+=rs
# 5-year overlay
rs5,h5=rows(IN+'Finding Register - 5 YEAR.xlsx','Data-2026-21 R&D  Ver-1',1,M)
def k(r): return (str(r.get('uid','')).strip(), norm(r.get('finding_no','')), r.get('issue_date'))
idx={}
for r in rs5: idx.setdefault(k(r),[]).append(r)
hit=0
for r in allr:
    m=idx.get(k(r))
    if m:
        o=m.pop(0) if len(m)>1 else m[0]; hit+=1
        for f in ['issue_category','issue_group','secondary_category','nature_of_issue','root_cause_theme']:
            if o.get(f): r[f]=o[f]
        for f in ['client','process','location','raised_by']:
            if o.get(f): r[f]=o[f]
print('overlay matched',hit,'of',len(allr))
# keyword classifier for rows without category (Category Guide)
import openpyxl
wb=openpyxl.load_workbook(IN+'Finding Register - 5 YEAR.xlsx',read_only=True,data_only=True)
guide=[]
for i,row in enumerate(wb['Category Guide'].iter_rows(min_row=5,values_only=True)):
    if row[1] and row[4]: guide.append((row[1],row[2],[w.strip().lower() for w in str(row[4]).split(',') if w.strip() and '(' not in w]))
cls=0
for r in allr:
    if r.get('issue_category') or not r.get('description'): continue
    t=str(r['description']).lower(); best=None; bs=0
    for c,g,ws in guide:
        sc=sum(1 for w in ws if w in t)
        if sc>bs: bs=sc; best=(c,g)
    if best: r['issue_category'],r['issue_group']=best; cls+=1
    else: r['issue_category'],r['issue_group']='Other / Needs Review','Other'
print('classified by keywords',cls)
# normalise
for r in allr:
    r['primary']=prim(r.get('primary')); r['sub_category']=title_sub(r.get('sub_category')); r['ext_int']=up(r.get('ext_int'))
    r['won']=won(r.get('won')); r['status']=stat(r.get('status')) or 'Open'; r['criticality']=crit(r.get('criticality'))
    ft=up(r.get('finding_type'))
    if ft in ('OBS',): ft='OBSERVATION'
    if ft=='OFI': ft='AFI'
    r['finding_type']=ft
    n=up(r.get('nature'))
    r['nature']={'NEGATIVE':'NEGETIVE'}.get(n,n)
    if r['uid'] if 'uid' in r else False: r['uid']=str(r['uid']).strip()
print(collections.Counter(r['finding_type'] for r in allr).most_common(10))
print(collections.Counter(r['status'] for r in allr).most_common(6))
print(collections.Counter(r['sub_category'] for r in allr).most_common(12))
print(collections.Counter((r.get('issue_date') or '????')[:4] for r in allr))
save('FND',allr)
