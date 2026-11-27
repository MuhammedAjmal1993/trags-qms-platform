import sys; sys.path.insert(0,'/tmp/build')
from common import *
import collections
F=IN+'08- RFI Register.xlsx'
M=[('sn','-'),('unique identification numbers uid','uid'),('primary category','primary'),('sub category','sub_category'),('external internal','ext_int'),('won','won'),
   ('custodian','inspector'),('location','location'),('contractno','contract_no'),('discipline','discipline'),('rfino','rfi_no'),('rfi date','rfi_date'),('description','activity'),
   ('inspection date','inspection_date'),('client','client_int'),('trags','trags_int'),('status code','status'),('remaning rfi','remaining'),('itr no','itr_no'),
   ('investigation report*','investigation_ref'),('remarks','remarks'),('project no','project_no')]
SMAP={'APPROVED':'Approved','APPROVED WITH COMMENTS':'AWC','APPROVED WITH COMMENT':'AWC','REJECTED':'Rejected','CANCELLED':'Cancelled','CANCELED':'Cancelled'}
out=[]
for sh in ['Roads','RFI Register 2024','RFI Register 2025','RFI Register 2026']:
    rs,h=rows(F,sh,1,M)
    rs=[r for r in rs if r.get('rfi_no')]
    for r in rs:
        r['won']=won(r.get('won')); r['primary']=prim(r.get('primary')); r['ext_int']=up(r.get('ext_int'))
        s=str(r.get('status') or '').strip().upper()
        st=SMAP.get(s)
        if not st:
            st='Open'
            if s and s not in ('OPEN',): r['status_note']=r.get('status')
        r['status']=st
        r['rfi_no']=str(r['rfi_no']).strip()
        if sh=='Roads' and not r.get('discipline'): r['discipline']='ROADS'
        r['_sheet']=sh
    print(sh,len(rs),collections.Counter(r['status'] for r in rs).most_common(6),[k for k,v in h.items() if v is None and k])
    out+=rs
# newest first so 2026 loads first
out.sort(key=lambda r:(r.get('rfi_date') or '0000'), reverse=True)
save('RFI',out)
# ---------- WRR + WLD
F=IN+'07- Welding Monitoring Register.xlsx'
M=[('s n','-'),('unique identification numbers uid','uid'),('primary category','-'),('sub category','-'),('external internal','-'),('data input date','input_date'),
   ('week*','week'),('emp no','emp_no'),('welder type','welder_type'),('name','welder_name'),('welder no','welder_id'),('no of joints','joints_welded'),('inch dia','inch_dia'),
   ('no of joints rt carried out','joints_rt'),('no of joints rt acc','joints_acc'),('of joints accepted','-'),('no of films rt d','films_rt'),('no of films rejected','films_rej'),
   ('repair rate*','-'),('circumference mm','circumference'),('repair length mm','repair_length'),('rejection linear','-'),('linear meter welded','lm_welded'),
   ('ndt rejected mtr','lm_rej'),('won','won'),('qc name','qc'),('site','site'),('hr allocation','hr_allocation'),('defect type','defect_type'),('size of defect*','defect_size'),('remarks','remarks')]
wrr=[]; welders={}
for sh in ['Register 2023','Register 2026']:
    rs,h=rows(F,sh,4,M)
    act=0
    for r in rs:
        if not (r.get('welder_id') or r.get('welder_name')): continue
        r['won']=won(r.get('won'))
        if isinstance(r.get('uid'),str) and len(r['uid'])==10 and r['uid'][4]=='-': r['uid']=None
        wid=str(r.get('welder_id') or '').strip()
        if wid:
            w=welders.setdefault(wid,{'welder_id':wid,'n':0})
            d=r.get('input_date') or ''
            if d>=w.get('last',''):
                w.update({'last':d,'name':r.get('welder_name'),'emp_no':r.get('emp_no'),'welder_type':r.get('welder_type'),'site':r.get('site'),'won':r.get('won'),'qc':r.get('qc')})
            if sh=='Register 2026': w['y26']=True
        nums=[r.get(k) for k in ('joints_welded','joints_rt','films_rt','films_rej','lm_welded','lm_rej','repair_length')]
        if any(isinstance(v,(int,float)) and v>0 for v in nums) or r.get('defect_type'):
            for k in list(r):
                if r[k]=='' : r.pop(k)
            wrr.append(r); act+=1
    print(sh,len(rs),act,[k for k,v in h.items() if v is None and k])
save('WRR',wrr)
wl=[]
for wid,w in sorted(welders.items()):
    wl.append({'welder_id':wid,'name':w.get('name'),'emp_no':w.get('emp_no'),'welder_type':w.get('welder_type'),'site':w.get('site'),'won':w.get('won'),'qc':w.get('qc'),
               'status':'Active' if w.get('y26') else 'Inactive','remarks':f"Last data input {w.get('last')} (Welding Monitoring Register)"})
save('WLD',wl)
