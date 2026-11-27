import sys; sys.path.insert(0,'/tmp/build')
from common import *
import collections, openpyxl
# ---------- CFB
F=IN+'06- Customer Feedback Register.xlsx'
M=[('s n','-'),('unique identification numbers uid','uid'),('primary category','primary'),('sub category','sub_category'),('external internal','ext_int'),('wo','won'),('won','won'),
   ('date of identfication','id_date'),('raised by client','client'),('report no','report_no'),('process area department','process'),('discipline*','process'),
   ('project contract no*','contract'),('complaint brief description','description'),('issue situation*','root_cause'),('suggested corrective*','action'),
   ('primary function responsibility*','responsibility'),('learning recommendation','learning'),('safety impact','impact_safety'),('cost impact','impact_cost'),
   ('quality impact','impact_quality'),('schedule impact','impact_schedule'),('green yellow red','rag'),('status open closed ongoing','status'),('date','close_date'),
   ('interested party','interested_party'),('issues','issues'),('need expectations','needs'),('impact internal external','impact'),('remakrs','remarks'),('score','score'),
   ('reference no of ncr*','ref')]
out=[]
for sh in ['CFR-2023','CFR-2024','CFR-2025','CFR-2026']:
    wb=openpyxl.load_workbook(F,read_only=True,data_only=True); ws=wb[sh]
    hdr=[c for c in next(ws.iter_rows(min_row=2,max_row=2,values_only=True))]
    rs,h=rows(F,sh,2,M)
    rating_cols=list(range(16,26))
    allrows=list(ws.iter_rows(min_row=3,values_only=True))
    kept=0
    for r in rs:
        if not (r.get('id_date') and (r.get('sub_category') or r.get('description'))): continue
        raw=allrows[r['_row']-3]
        rt=[f"{str(hdr[c]).split('(')[0].strip()}: {cell(raw[c])}" for c in rating_cols if c<len(raw) and cell(raw[c]) not in (None,)]
        if rt: r['ratings']='; '.join(rt)
        if r.get('rag') and str(r['rag']).startswith('#'): r.pop('rag')
        r['primary']=prim(r.get('primary')); r['ext_int']=up(r.get('ext_int')); r['won']=won(r.get('won')); r['status']=stat(r.get('status')) or 'Closed'
        sc=r.get('score')
        if isinstance(sc,(int,float)) and sc>1.5: r['score']=round(sc/100,4)
        if r.get('remarks') and not r.get('client') and sh=='CFR-2023': r['client']=r['remarks']
        out.append(r); kept+=1
    print(sh,len(rs),kept)
# COMPLAINT sheet
cr,_=rows(F,'COMPLAINT',2,[('s n','sn'),('date','id_date'),('company s name','client'),('project','contract'),('complaint','description'),('process project owner','responsibility'),('action','action'),('status','status')])
for r in cr:
    if not r.get('description'): continue
    out.append({'sub_category':'Complaint','primary':'PROJECT','ext_int':'EXTERNAL','id_date':r.get('id_date'),'client':r.get('client'),'report_no':f"CMP-{r.get('sn')}",
                'contract':r.get('contract'),'description':r['description'],'responsibility':r.get('responsibility'),'action':r.get('action'),'status':stat(r.get('status')) or 'Closed','remarks':'From COMPLAINT log sheet'})
print(collections.Counter(r.get('sub_category') for r in out))
save('CFB',out)
# ---------- LLR
F=IN+'05- Lesson Learnt Register.xlsx'
M=[('s n','-'),('unique identification numbers uid','uid'),('primary category','primary'),('sub category','category'),('external internal','ext_int'),('won','won'),
   ('source of ll','source_type'),('report no of source*','source'),('date of identfication','date'),('raised by reported by designation','designation'),
   ('raised by reported by name','raised_by'),('need improvement worked well','ll_type'),('discipline*','discipline'),('project contract no*','project_no'),
   ('ll brief description','description'),('issue situation*','situation'),('suggested corrective*','action'),('primary function responsibility*','owner'),
   ('safety impact','impact_safety'),('cost impact','impact_cost'),('quality impact','impact_quality'),('schedule impact','impact_schedule'),('green yellow red','rag'),
   ('status open closed ongoing','status'),('date','close_date'),('interested party','interested_party'),('issues','issues'),('need expectations','needs'),
   ('impact internal external','impact'),('remakrs','remarks'),('reference no of risk*','risk_ref')]
rs,h=rows(F,'Lesson Learnt Register',2,M)
out=[]
for r in rs:
    if not r.get('description'): continue
    r['won']=won(r.get('won')); r['status']=stat(r.get('status')) or 'Closed'; r['ext_int']=up(r.get('ext_int'))
    lt=str(r.get('ll_type','')).lower(); r['ll_type']='Worked Well' if 'worked' in lt else 'Need Improvement' if lt else None
    r['process']=r.get('discipline'); out.append(r)
n1=len(out)
M2=[('s n','sn'),('date of identfication','date'),('raised by reported by','raised_by'),('need improvement worked well','ll_type'),('discipline*','discipline'),
    ('project contract no*','project_no'),('contract project title*','project_title'),('ll brief description','description'),('issue situation*','situation'),
    ('suggested corrective*','action'),('primary function responsibility*','owner'),('safety impact','impact_safety'),('cost impact','impact_cost'),
    ('quality impact','impact_quality'),('schedule impact','impact_schedule'),('is it risk*','remarks')]
rs,h=rows(F,'Lesson Learnt-Dept',1,M2)
for r in rs:
    if not r.get('description'): continue
    sn=r.pop('sn',None)
    lt=str(r.get('ll_type','')).lower(); r['ll_type']='Worked Well' if 'worked' in lt else 'Need Improvement' if lt else None
    r['uid']=f"LLD-{int(sn):03d}" if isinstance(sn,(int,float)) else None
    r['category']='Lesson Learnt'; r['primary']='PROJECTS'; r['process']=r.get('discipline'); r['status']='Closed'; r['source_type']='Department LL list (historic)'
    if r.get('remarks'): r['remarks']=f"Is it a risk: {r['remarks']}"
    out.append(r)
print('LLR', n1, len(out)-n1)
save('LLR',out)
# ---------- TRN
F=IN+'14- Training Register.xlsx'
M=[('sr no','sr_no'),('uid','uid'),('unique identification numbers uid','uid'),('primary category','primary'),('sub category','sub_category'),('external internal','ext_int'),('won','won'),
   ('training plan document no project','plan_doc'),('training planned date','plan_date'),('reason purpose of training','reason'),('process area department','process'),
   ('department process','process'),('subject on awareness session','subject'),('training location','location'),('training actual date','actual_date'),
   ('conducted by','conducted_by'),('total no participants','participants'),('invitation notification','-'),('training material','-'),('assessment','evaluation'),
   ('feedback','-'),('photo s','-'),('attendance','attendance'),('observation ncr no referance closeout','finding_ref'),('training feedback','feedback_pct'),
   ('remarks','remarks'),('planned month','-'),('actual month','-'),('training date','actual_date'),('year','-')]
out=[]
for sh,hr in [('2020-2024',16),('Training 2025',1),('Training 2026',4)]:
    rs,h=rows(F,sh,hr,M)
    rs=[r for r in rs if r.get('subject') and (r.get('plan_date') or r.get('actual_date'))]
    for r in rs:
        r['won']=won(r.get('won')); r['primary']=prim(r.get('primary')); r['ext_int']=up(r.get('ext_int'))
        if sh=='2020-2024' and not r.get('plan_date'): r['plan_date']=r.get('actual_date')
        p=r.get('participants')
        if isinstance(p,str):
            try: r['participants']=int(float(p))
            except: r.pop('participants')
        fp=r.get('feedback_pct')
        if isinstance(fp,(int,float)) and fp>1.5: r['feedback_pct']=round(fp/100,4)
        if isinstance(r.get('sr_no'),float): r['sr_no']=int(r['sr_no'])
    print(sh,len(rs),[k for k,v in h.items() if v is None and k])
    out+=rs
save('TRN',out)
# ---------- NFI
F=IN+'21_Inspection Log Register.xlsx'
M=[('sl no','sl_no'),('po number','po_no'),('won','won'),('subcontractor nfi received date','nfi_received'),('subcontractor nfi no','nfi_no'),('itp number','itp_no'),
   ('itp activity no','itp_activity'),('itp activity description','itp_desc'),('trags tpi inspection intervention*','trags_int'),('required date of inspection','required_date'),
   ('location of inspection','location'),('generate inspection request serial number','ir_no'),('tpi approval status*','tpi_approval'),('name of tpi agnecy company','tpi_agency'),
   ('name of inspector','inspector'),('cv status*','cv_status'),('tpi agency p o','tpi_po'),('nfi inspection planned*','planned'),('client tpi inspection intervention*','client_int'),
   ('client is notifed*','client_notified'),('actual date of inspection','actual_date'),('tpi inspection status*','tpi_status'),('tpi flash report status*','flash_status'),
   ('tpi inspection report recived on date','report_received'),('tpi inspection report no','tpi_report_no'),('tpi inspection result*','result'),('comments punch*','comments'),
   ('status of comments for the inspection','comment_status'),('tpi final report no irn no','irn_no'),('manufacturer report and tpi report*','reviewed_by'),
   ('nfi status*','status'),('number of tpi man days','man_days'),('inspector s performance','-'),('prefered for future inspections','preferred'),('tpi booked order value','order_value'),('remakrs','remarks')]
rs,h=rows(F,'2_Inspection Log',1,M)
import datetime as dt
def dparse(v):
    if not isinstance(v,str): return v
    for f in ('%d-%b-%y','%d-%b-%Y','%d/%m/%Y','%d.%m.%Y'):
        try: return dt.datetime.strptime(v.strip(),f).strftime('%Y-%m-%d')
        except: pass
    return v
out=[]
for r in rs:
    if not r.get('nfi_no'): continue
    for f in ('nfi_received','required_date','actual_date','report_received'): 
        if f in r: r[f]=dparse(r[f])
    r['won']=won(r.get('won')); r['status']=stat(r.get('status'))
    out.append(r)
print('unmapped',[k for k,v in h.items() if v is None and k])
save('NFI',out)
