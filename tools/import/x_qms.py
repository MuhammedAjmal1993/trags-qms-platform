import sys; sys.path.insert(0,'/tmp/build')
from common import *
import collections
F=IN+'03- Risk Register.xlsx'
M=[('s n','-'),('unique identification numbers uid','uid'),('primary category','primary'),('sub category','-'),('external internal','ext_int'),('won','won'),
   ('date of identification','id_date'),('date of identfication','id_date'),('source of risk','source'),('raised by reported by','raised_by'),('report no','report_no'),
   ('risk type external internal','-'),('owner of risk*','owner'),('area of risk exist*','area'),('description of risk','description'),('ownership status*','ownership'),
   ('risk status*','risk_status'),('risk treatment','treatment'),('risk treatement','treatment'),('cause of risk','cause'),('identified specific impact*','impact_desc'),
   ('likelihood l 1 5','likelihood'),('probability','likelihood'),('impact i 1 5','impact'),('impact','impact'),('risk score l i','score'),('risk level procedure','level'),
   ('green yellow red','level'),('mitigation measures*','mitigation'),('action by','action_by'),('status open closed alarp','status'),('closeout date','close_date'),('date','close_date'),
   ('interested party','interested_party'),('issues','issues'),('need expectations','needs'),('impact internal external','impact_ie'),('remarks','remarks'),('remakrs','remarks'),
   ('opportunity if any','opportunity'),('opportunity reference no*','opp_ref')]
out=[]
for sh in ['Risk Register 2020','Risk Register 2021','Risk Register']:
    rs,h=rows(F,sh,2,M)
    for r in rs:
        if not r.get('uid') or not (r.get('description') or r.get('source')): continue
        r['won']=won(r.get('won')); r['primary']=prim(r.get('primary')); r['status']=stat(r.get('status')) or ('Closed' if str(r.get('risk_status','')).lower().startswith('clos') else 'Open')
        if r.get('raised_by')=='[Name]': r.pop('raised_by')
        if isinstance(r.get('level'),(int,float)): r.pop('level')
        if r.get('score')==0: r.pop('score')
        out.append(r)
    print(sh,len(out))
save('RSK',out)
F=IN+'04- Opportunity Register.xlsx'
M=[('s n','-'),('uid','uid'),('primary category','primary'),('sub category','sub_category'),('external internal','ext_int'),('won','won'),('date of identfication','id_date'),
   ('source of opportunity','source'),('raised by reported by','raised_by'),('report no','report_no'),('strength opportunities','kind'),('description of opportunity','description'),
   ('opportunity treatment','treatment'),('benfits to business*','benefit'),('action on opportunity','action'),('implementation cost','cost'),('implementation duration','duration'),
   ('inhouse capability','inhouse'),('green yellow red','rag'),('brief summary of action to be taken','summary'),('action by','action_by'),('status open closed ongoing','status'),
   ('date','date'),('interested party','interested_party'),('need expectations','needs'),('remakrs','remarks'),('reference no of opportunity source*','-')]
rs,h=rows(F,'Opportunity Register',2,M)
op=[]
for r in rs:
    if not r.get('description'): continue
    r['won']=won(r.get('won')); r['status']=stat(r.get('status')) or 'Open'
    for k in list(r):
        if r[k]=='—': r.pop(k)
    op.append(r)
save('OPP',op)
F=IN+'25- Oraganizational Certification Tracker.xlsx'
M=[('','sn'),('certification standard','certification'),('certifying body','body'),('certificate no','cert_no'),('site facility','site'),('scope summary','scope'),
   ('issue date','issue_date'),('expiry date','expiry_date'),('days to expiry','-'),('status','status'),('next surveillance due','next_surveillance'),('recertification due','recert_due'),
   ('cert cost qar','cert_cost'),('other costs qar','other_cost'),('total cost qar','total_cost')]
rs,h=rows(F,'Main Tracker',3,M)
sc,_=rows(F,'Scope Register',2,[('','sn'),('certification','certification'),('certificate no','cert_no'),('site facility','site'),('full scope of certification','full_scope')])
scope={norm(r.get('certification')):r.get('full_scope') for r in sc}
ct=[]
def fam(c):
    c=c.upper()
    if '17025' in c: return 'Laboratory'
    if 'ASME' in c or 'NB' in c or 'NATIONAL BOARD' in c or 'STAMP' in c: return 'ASME / National Board'
    if 'ICV' in c or 'TAWTEEN' in c: return 'National Programme'
    return 'ISO Management System'
for r in rs:
    if not isinstance(r.get('sn'),(int,float)) or not r.get('certification'): continue
    r.pop('sn'); r['family']=fam(r['certification']); r['public']='Yes'
    fs=scope.get(norm(r['certification']))
    if fs: r['full_scope']=fs
    for k in ('next_surveillance','recert_due'):
        if r.get(k)=='–': r.pop(k)
    ct.append(r)
for r in ct: print('  ',r['certification'],'|',r.get('body'),'|',r.get('cert_no'),'|',r.get('site'),'|',r.get('expiry_date'),'|',r.get('status'))
save('CRT',ct)
