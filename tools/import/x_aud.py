import sys; sys.path.insert(0,'/tmp/build')
from common import *
import collections
M=[('s n','-'),('uid','uid'),('unique identification numbers uid','uid'),('primary category','primary'),('sub category','sub_category'),('external internal','ext_int'),
   ('won','won'),('client','client'),('plan date of audit','plan_date'),('audit report no','report_no'),('department function process','process'),('project','project'),
   ('auditor','auditor'),('auditee','auditee'),('actual date of audit*','actual_date'),('audit follow up date','followup_date'),('number of ncr','ncr_no'),
   ('status of ncr','ncr_status'),('number of observation*','obs_no'),('status of observation','obs_status'),('number of ofi','ofi_no'),('action on ofi','ofi_status'),
   ('remarks','remarks'),('month','-'),('actual month','actual_month_raw')]
F=IN+'01- Audit Plan Register.xlsx'
allr=[]
for sh,hr in [('Data-2022-23',1),('Data-2024',1),('Data-2025',1),('Data-2026',6)]:
    rs,h=rows(F,sh,hr,M)
    rs=[r for r in rs if (r.get('plan_date') or r.get('actual_date')) and (r.get('process') or r.get('report_no') or r.get('uid'))]
    print(sh,len(rs),[k for k,v in h.items() if v is None and k])
    allr+=rs
for r in allr:
    r['primary']=prim(r.get('primary')); r['sub_category']=title_sub(r.get('sub_category')); r['ext_int']=up(r.get('ext_int')); r['won']=won(r.get('won'))
    if r.get('uid')=='-': r.pop('uid')
    for f in ('ncr_status','obs_status','ofi_status'):
        if r.get(f): r[f]=stat(r[f])
    rem=str(r.get('remarks','')).lower()
    am=str(r.pop('actual_month_raw','')).lower()
    if 'cancel' in rem: r['status']='Cancelled'; r['status_locked']=True
    elif 'postpone' in rem: r['status']='Postponed'; r['status_locked']=True
    for f in ('ncr_no','obs_no','ofi_no'):
        v=r.get(f)
        if isinstance(v,str):
            try: r[f]=int(float(v))
            except: r.pop(f)
print(collections.Counter(r['sub_category'] for r in allr), collections.Counter(r['plan_date'][:4] for r in allr))
save('AUD',allr)
