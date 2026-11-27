import openpyxl, warnings, datetime, re, json
warnings.filterwarnings('ignore')
import os
IN=os.environ.get('TRAGS_REGISTERS', '/tmp/in/01 Registers (Excel)/')  # set to the local register folder
def norm(h): return re.sub(r'[^a-z0-9]+',' ',str(h or '').lower()).strip()
def cell(v):
    if v is None: return None
    if isinstance(v,datetime.datetime): return v.strftime('%Y-%m-%d')
    if isinstance(v,datetime.date): return v.isoformat()
    if isinstance(v,float):
        if v!=v: return None
        return int(v) if v.is_integer() else round(v,6)
    if isinstance(v,str):
        s=v.replace('_x000D_','').replace('\r\n','\n').strip()
        if s in ('','-','--','—','N/A ', 'null') : return None
        if s.startswith('#REF') or s.startswith('#N/A') or s.startswith('#VALUE') or s.startswith('#DIV'): return None
        return s
    return v
def rows(file, sheet, hdr_row, mapping, max_cols=None):
    """mapping: list of (normalized header startswith, key). Returns list of dicts."""
    wb=openpyxl.load_workbook(file,read_only=True,data_only=True)
    ws=wb[sheet]
    out=[]; hdr=None; keys=None
    for i,r in enumerate(ws.iter_rows(values_only=True),1):
        if i<hdr_row: continue
        if i==hdr_row:
            hdr=[norm(h) for h in r]; keys=[]
            used=set()
            for h in hdr:
                k=None
                for pref,key in mapping:
                    if key in used: continue
                    if h==pref or (pref.endswith('*') and h.startswith(pref[:-1])):
                        k=key; break
                if k: used.add(k)
                keys.append(k)
            continue
        d={}
        for k,v in zip(keys,r):
            if k and k!='-':
                c=cell(v)
                if c is not None: d[k]=c
        if d: d['_row']=i; out.append(d)
    return out, dict((h,k) for h,k in zip(hdr,keys))
TITLE={'AUDIT':'Audit','SURVEILLANCE':'Surveillance','SURVIELLANCE':'Surveillance','QWA':'QWA','INSPECTION':'Inspection'}
def title_sub(v):
    if not v: return v
    return TITLE.get(str(v).strip().upper(), str(v).strip())
def up(v): return str(v).strip().upper() if v else v
def stat(v):
    if not v: return v
    s=str(v).strip().lower()
    return {'closed':'Closed','open':'Open','ongoing':'Ongoing','on going':'Ongoing','cancelled':'Cancelled','canceled':'Cancelled'}.get(s,str(v).strip())
def crit(v):
    if not v: return v
    s=str(v).strip().lower()
    return {'high':'High','medium':'Medium','low':'Low','n/a':None}.get(s,str(v).strip())
def prim(v):
    if not v: return v
    s=str(v).strip().upper()
    return 'PROJECT' if s.startswith('PROJECT') else s
def won(v):
    if v is None: return None
    s=str(v).strip()
    s=re.sub(r'\.0$','',s)
    return s or None
def save(code, data):
    json.dump(data, open(f'/tmp/build/raw/{code}.json','w'), ensure_ascii=False)
    print(code, len(data))
