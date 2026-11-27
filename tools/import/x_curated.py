import sys,json,re; sys.path.insert(0,'/tmp/build')
from common import *
# ---- CRT fix from certificate PDFs
ct=json.load(open('/tmp/build/raw/CRT.json'))
for r in ct:
    if r['certification'].startswith('ISO 22000'):
        r['_flags']={'expiry_date':'Tracker showed 17-Oct-2026; certificate PDF (uploaded 25-Nov-2026) shows expiry 16-Oct-2027. Confirm and update status.'}
        r['remarks']='Tracker expiry 17-Oct-2026 superseded by certificate PDF: expiry 16-Oct-2027.'
        r['expiry_date']='2027-10-16'
ct.append({'certification':'ICV Certificate (In-Country Value)','family':'National Programme','body':'TAWTEEN Programme (Qatar)','site':'TRAGS','public':'Yes','status':'ACTIVE','remarks':'ICV score 60.07% (MRM 26/02). Certificate image uploaded; validity dates not stated in the tracker.'})
save('CRT',ct)
# ---- News (from monthly "input quality" news files)
N=[
 ('2026-11-03','Leadership','TRAGS Management Conducts Workshop Leadership Walk','Doha, Qatar','TRAGS senior management conducted a workshop leadership walk at the TRAGS Fabrication Shop on 3 November 2026, reviewing fabrication activities, workplace conditions, housekeeping, equipment management and workshop performance.','Yes','Oct 2026 input'),
 ('2026-10-29','Training','Plant Department Enhances Fleet Monitoring Awareness Through IVMS Training','Doha, Qatar','The Plant Department conducted an awareness session on the IVMS Dashboard and real-time monitoring at the TRAGS Garage facility as part of the QMS training plan.','Yes','Oct 2026 input'),
 ('2026-10-28','Training','QA/QC Department Conducts Material Inspection and Storage Training','Doha, Qatar','A technical session on material inspection, identification and storage was held at the TRAGS Fabrication Shop for workshop QA/QC personnel and inspectors.','Yes','Oct 2026 input'),
 ('2026-10-25','Audit','Internal Audit Conducted for the Desalter Upgrade Project','Mesaieed, Qatar','TRAGS conducted the second internal project audit for the EPIC Desalter Upgrade project, covering project management, design control, procurement, document control, material management and subcontractor oversight.','No','Oct 2026 input'),
 ('2026-10-13','Recognition','Quality Performer of the Year 2025 Award Presented','Doha, Qatar','The Quality Performer of the Year 2025 Award was presented to the Combined Project Team, led by Jad Azar, Project Manager. Nominations were received from 14 departments and project teams.','Yes','Oct 2026 input'),
 ('2026-10-08','Recognition','TRAGS Recognizes Welding Excellence Through the Welder of the Month Awards','Doha, Qatar','Five welders received the Welder of the Month Award with cash vouchers at a ceremony at the TRAGS Head Office led by the General Manager.','Yes','Oct 2026 input'),
 ('2026-10-05','Audit','Internal Audit Completed for a Decommissioning Project','Ras Laffan, Qatar','TRAGS completed an internal audit for an EPIC decommissioning, demolition and salvage project, covering project management, procurement control, material management and QMS implementation.','No','Oct 2026 input'),
 ('2026-09-30','Training','Workshop QA/QC Conducts Pressure Vessel Fabrication Training','Street-7, Doha','A technical training on pressure vessel fabrication was delivered to workshop QA/QC inspectors at the Salwa Workshop Training Room.','Yes','Sep 2026 input'),
 ('2026-09-29','Leadership','TRAGS Management Reinforces Commitment to Workshop Excellence','Doha, Qatar','Management conducted the monthly workshop walk at the TRAGS Fabrication Shop, reviewing activities, workplace conditions, housekeeping, tool control and operational practices.','Yes','Sep 2026 input'),
 ('2026-09-23','Training','Road Services Department Conducts Training on Road Material Testing Requirements','Street-7, Doha','Training on required testing for road materials as per Qatar Construction Specifications (QCS 2024) under the 2026 QMS Training Plan.','Yes','Sep 2026 input'),
 ('2026-09-20','Training','Estimation Department Conducts Training on Effective Use of Estimation Norms','Doha, Qatar','The Estimation Department held a session on the best use of estimation norms to gain competitive advantage, as part of the 2026 QMS training objective.','Yes','Sep 2026 input'),
 ('2026-09-01','Client Evaluation','Excellent Quality Rating of 97% in Client Contractor Quality Evaluation (Q2 2026)','Ras Laffan, Qatar','TRAGS achieved an Excellent rating with an overall score of 97% in the client Contractor Quality Performance Evaluation for Q2 2026, with an average KPI performance of 98%.','No','Sep 2026 input'),
 ('2026-09-27','Project Milestone','Client Team Visits TRAGS Fabshop for Column Fabrication','Doha, Qatar','A client team visited the TRAGS Fabshop to review fabrication of the 4901E Amine Regenerator Column at Workshop 41.','No','Sep 2026 input'),
 ('2026-05-20','Certification','Certification Recommendation for Insulation and Cladding Scope at Jery Al Samur Yard','Jery Al Samur Yard','TRAGS completed a DNV Scope Extension audit covering insulation and cladding activities; the audit concluded with a recommendation for certification.','Yes','Jun 2026 input'),
 ('2026-04-27','Leadership','TRAGS Leadership Reaffirms Quality Excellence at Strategic Management Review','Doha, Qatar','Top management convened for the Management Review Meeting (MRM 26/01) to review the suitability, adequacy and effectiveness of the ISO 9001:2015 QMS.','Yes','May 2026 input'),
 ('2026-04-21','Audit','Comprehensive Quality Audit for the BMS Project','Mesaieed, Qatar','The in-house QA/QC team completed a two-day internal quality audit of the Burner Management Systems project covering project management, procurement, engineering documentation and fabrication controls.','No','May 2026 input'),
 ('2026-04-09','Client Evaluation','94% Excellent Rating in Client Q1 2026 Quality Performance Review','Doha, Qatar','TRAGS achieved a 94% Excellent rating in the Q1 2026 Contractor Quality Performance Evaluation, including 100% adherence to scheduled training and timely closure of audit findings.','No','May 2026 input'),
 ('2026-04-15','Project Milestone','Offshore Module Delivered for the PTSC-RUYA Project','Mesaieed, Qatar','A high-precision skid-mounted integrated module fabricated at the TRAGS shop was delivered for offshore installation.','No','Jun 2026 input'),
 ('2026-03-24','Certification','TRAGS Renews ISO/IEC 17025:2017 Accreditation','Salwa Workshop','TRAGS renewed its ISO/IEC 17025:2017 laboratory accreditation following an external recertification audit on 24 March 2026.','Yes','May 2026 input'),
 ('2026-01-08','Training','Departments Execute Cross-Functional Training Under the Yearly QMS Plan','Doha, Qatar','HR, Procurement, Proposals, Estimation and project QA/QC teams delivered specialised training sessions under the TRAGS Yearly QMS Training Plan, with assessments to confirm knowledge transfer.','Yes','Jan 2026 input'),
 ('2026-01-08','Recognition','December Monthly Welder Award Winners Announced','TRAGS Head Office','Seven welders from project sites received the Monthly Welder Award from the General Manager, with cash prizes from management.','Yes','Jan 2026 input'),
 ('2025-08-30','Training','QA/QC Team Delivers WPS Review and On-Job Use Session','TRAGS Fabrication Shop','A QC inspector led focused training on WPS review and on-job use for quality personnel and shop supervisors under the Yearly Training Plan.','Yes','Aug input'),
 ('2025-08-15','Client Evaluation','94% Rating in Client Q2 2025 Quality Performance Evaluation','Doha, Qatar','TRAGS secured a 94% overall rating in the Q2 2025 Quality Performance Evaluation, reflecting consistent alignment with client expectations.','No','Aug input'),
]
nws=[{'date':d,'category':c,'title':t,'location':l,'summary':s,'public':p,'source':src,'status':'Published'} for d,c,t,l,s,p,src in N]
save('NWS',nws)
# ---- MRM / MRA
mrm=[{'mrm_no':'MRM 26/01','plan_date':'2026-04-27','actual_date':'2026-04-27','chair':'Ivan Morgan (GM)','agenda':'Full-year 2025 management review (ISO 9001:2015 clause 9.3).',
      'attendees':'Ivan Morgan (GM), Brandon Turner (DGM), Manoj Thoppil, Samir Syed, Shaju Joseph, Anthony Philips, Muhammed Ibraheem, Philip Jreije, Noel Deladia, Nishad Ziaudeen, D.S. Naidu, Crisho Marianu, Faheem Anjum, Kishore Prakashan, Rohith Radhamohanan, Mohamed Aznaz, Anbalagan V; MR: A.K. Nayak; facilitated by Rajesh Verma (QA/QC Manager)',
      'decisions':'12 action items raised; follow-up communicated to department owners on 11-May-2026.','status':'Held'},
     {'mrm_no':'MRM 26/02','plan_date':'2026-10-13','actual_date':'2026-10-13','chair':'Ivan Morgan (GM)','agenda':'Half-yearly review Jan–Jun 2026: certification & policy status, previous MRM actions, customer satisfaction, quality objectives, audit results, training, external providers, monitoring & measurement, resources, interested parties, risks, opportunities, ISO 9001:2026 transition, Quality Performer Award.',
      'decisions':'H1 2026: customer satisfaction 98%; RFI rejection 0.49%; weld repair rate 0.38%; training plan 100%; 35 of 40 assessed quality objectives achieved. Next MRM tentatively Feb 2027.','minutes_ref':'Conference Room, 2nd Floor, Al Manara Building, Doha · 03:45 PM','status':'Held'},
     {'mrm_no':'MRM 27/01','agenda':'Full-year 2026 review; review of MRM 26/02 action items for closure. Tentatively scheduled Feb 2027 (date to be confirmed).','status':'Planned'}]
save('MRM',mrm)
A=[('01','Management','GM advised that the ICV performance of major competitors should be periodically monitored and reviewed, so TRAGS can assess its relative position for future tenders and client evaluations.',None),
   ('02','A.K Nayak (Sr. Projects Manager)','A 100-ton counter load is to be made available at Street-7 workshop.','30.06.2026'),
   ('03','A.K Nayak (Sr. Projects Manager)','Evaluate the feasibility of 24-hour Fabrication Shop operations, including resource requirements.','30.06.2026 (revised from 31.12.2025)'),
   ('04','Rajesh Verma (QA/QC Manager)','In-house PAUT for NOC projects approved; equipment purchase and technician mobilisation on hold due to the geopolitical situation; reassess in September.','30.09.2026 (revised from 31.12.2025)'),
   ('05','A.K Nayak (Sr. Projects Manager)','Explore skid manufacturing opportunities with OEMs such as Halliburton and Schlumberger.','30.06.2026 (revised from 31.12.2025)'),
   ('06','Nishad Ziaudeen (Electrical Manager)','Establish an electrical resource competency module for hands-on training at the Street-7 Fabrication Training Centre (NOC).','30.06.2026 (revised from 31.12.2025)'),
   ('07','Management','Ensure management messages and organisational updates are cascaded across all departments, projects, workshops and workforce levels, including through TRAGS Times.',None),
   ('08','Manoj Thoppil (Planning Manager)','Present and discuss a 4-week look-ahead (project and resource) for the workshop in the monthly management meeting.',None),
   ('09','Management','Identify and analyse strategic business opportunities arising from the current geopolitical situation to enhance market positioning.','31.06.2026'),
   ('10','Rajesh Verma (QA/QC Manager)','Commence fabrication of the 38 mm Air Receiver Vessel to support QatarEnergy PML qualification thickness upgrade.','31.12.2026'),
   ('11','Shaju Joseph (HSE Manager)','Affix recognition stickers on the helmets of monthly Best Observer award winners.','31.06.2026'),
   ('12','Anthony Philips (Proposals Manager)','Standardised internal review and approval section in tender document templates to avoid scattered signatures.','31.06.2026')]
def ddate(s):
    if not s: return None
    m=re.match(r'(\d{2})\.(\d{2})\.(\d{4})',s)
    if not m: return None
    d,mo,y=m.groups()
    if mo=='06' and d=='31': d='30'
    return f'{y}-{mo}-{d}'
mra=[{'action_no':f'MRA-{n}-26','mrm_no':'MRM 26/01','owner':o,'department':o.split('(')[-1].rstrip(')') if '(' in o else o,'action':a,'raised_date':'2026-04-27','target':ddate(t),
      'status':'Open','update':(f'Due as recorded: {t}. ' if t else '')+'Reviewed at MRM 26/02 (13-Oct-2026); closure status not stated in the source deck.'} for n,o,a,t in A]
for r in mra:
    if r['target'] is None: r.pop('target')
save('MRA',mra)
# ---- EVT / INI
evt=[{'title':'MRM 26/01 – Management Review (FY 2025)','type':'Management Review','date':'2026-04-27','location':'Head Office','status':'Completed'},
     {'title':'ISO/IEC 17025 recertification audit','type':'External Audit','date':'2026-03-24','location':'Salwa Workshop laboratory','status':'Completed'},
     {'title':'DNV scope extension audit – insulation & cladding','type':'External Audit','date':'2026-05-20','location':'Jery Al Samur Yard','status':'Completed'},
     {'title':'Monthly workshop leadership walk','type':'Leadership Walk','date':'2026-09-29','location':'TRAGS Fabrication Shop','status':'Completed'},
     {'title':'MRM 26/02 – Management Review (H1 2026)','type':'Management Review','date':'2026-10-13','location':'Al Manara Building, Doha','status':'Completed'},
     {'title':'Quality Performer of the Year 2025 – award ceremony','type':'Recognition','date':'2026-10-13','location':'Head Office','status':'Completed'},
     {'title':'Workshop leadership walk','type':'Leadership Walk','date':'2026-11-03','location':'TRAGS Fabrication Shop','status':'Completed'},
     {'title':'World Quality Week 2026 celebrations at project sites','type':'World Quality Week','date':'2026-11-09','location':'TRAGS Fabshop; TSF, RLIC','status':'Completed','details':'Celebrated across project sites (Fabshop and TSF, RLIC). Date set to the start of World Quality Week; confirm actual dates.','_flags':{'date':'Exact date not stated in the source slide; confirm.'}}]
save('EVT',evt)
ini=[{'ref':'QI-001-26','type':'Training initiative','title':'Standby Training Initiative','start_date':'2026-07-01','owner':'QA/QC','process':'Training','status':'Implemented',
      'details':'Training sessions conducted during standby hours to make productive use of time lost to permit delays and operational constraints: welder, fabricator & fitter and NDT training.',
      'benefit':'58 personnel trained; average score 96%; trainer communication 96.8%, effectiveness 96.2%, overall satisfaction 96.2%.','participants':58,'showcase':'Yes'},
     {'ref':'QI-002-26','type':'Recognition programme','title':'TRAGS Monthly Welder Award','start_date':'2025-10-01','owner':'QA/QC','process':'Welding','status':'Ongoing',
      'details':'Project and site leadership nominate welders by the 30th; QA/QC consolidates and reviews against productivity, quality and safety & behaviour; five welders selected monthly; repeat winners excluded via the Trade Award Register.',
      'benefit':'Certificate of Appreciation and cash voucher from Top Management; communicated via TRAGS Times and notice boards.','showcase':'Yes'},
     {'ref':'QI-003-26','type':'Recognition programme','title':'TRAGS Quality Performer Award','start_date':'2026-01-01','owner':'QA/QC','process':'QMS','status':'Implemented',
      'details':'System-driven elements: objectives, training plan adherence, NCR disposition within 7 days, corrective action adherence, internal NCRs raised, risk management, lessons learnt. HOD booster elements: internal NCRs, workforce training, risk identification.',
      'benefit':'2025 winner: Combined Project Team led by Jad Azar (presented 13-Oct-2026).','showcase':'Yes'}]
save('INI',ini)
# ---- Objectives 2026 (MRM 26/02 slides 16-20, achieved till Jun)
O=[('Management','1.1','Complying with Statutory & Legal requirements','100 %','100%',''),
   ('Management','1.2','Increase in overall Customer Satisfaction Score','≥ 2%','98%',''),
   ('Procurement','2.1','Conduct major key supplier audit to ensure compliance with P.O. requirements','2 Nos.','2 Nos.',''),
   ('Procurement','2.2','Local purchase carried out against approved MRs within 10 days','≥ 85%','58%','21,155 of 36,664 MRs'),
   ('Procurement','2.3','Procurement of materials: meeting delivery schedule (required vs actual)','≥ 80%','78%','On-time delivery + delivery within 15 days'),
   ('Procurement','2.4','On-time delivery for critical path materials','≥ 85%','Pending','Data pending'),
   ('Plant','3.1','Reduction in equipment/vehicle unplanned down time','≤ 10%','0.5%','13 of 2,565 job cards'),
   ('Plant','3.2','Minimise motor vehicle accidents','≤ 5% of year 2025','7 accidents','Jan–Jun 2025: 17'),
   ('Plant','3.3','On-time renewal of third-party certifications of vehicles and equipment','≥ 95%','100%','135 of 135 equipment renewals'),
   ('Plant','3.4','Vehicle/equipment registration renewals prior to expiry','≥ 95%','100%','57.0% renewed by expiry date'),
   ('QA/QC','4.1',"RFI rejection rate",'≤ 2%','0.49%',''),
   ('QA/QC','4.2','Weld repair rate','≤ 1.5%','0.38%',''),
   ('QA/QC','4.3','Training plan vs actual','≥ 95%','100%','13 of 13 trainings conducted'),
   ('QA/QC','4.4','Non-compliance close-out on agreed time','≥ 90%','90.9%','20 of 22 within target date'),
   ('Projects Management','5.1','Profit performance of completed projects (by value)','≥ 90%','92.2%','by value'),
   ('Projects Management','5.2','Completion of projects within approved schedule','≥ 90%','64%','7 of 11 on schedule'),
   ('Contract & Estimation','6.1','Increase project booking (value)','≥ 5%','−11%','QAR 351.0M vs 393.2M'),
   ('Contract & Estimation','6.2','Tenders submitted against collected','≥ 80%','89.2%','166 of 186'),
   ('Contract & Estimation','6.3','Tenders awarded against submitted (EPCM, PCI, infrastructure)','≥ 15%','15.7%','26 of 166'),
   ('Human Resources','7.1','Mobilisation of manpower to meet project requirement (requested vs mobilised)','≥ 85%','97.8%','313 of 320 net requests'),
   ('Human Resources','7.2','Permanent direct employee turnover rate','≤ 5%','5% staff / 4% labour',''),
   ('Human Resources','7.3','Conduct welfare meetings','> 90%','100%',''),
   ('Human Resources','7.4','Perform camp inspection','≥ 90%','100%',''),
   ('Human Resources','7.5','Induction of new employees within 1st week of joining','100%','100%',''),
   ('Human Resources','7.6','Issue PPE, PCs, phone, SIM within 1st week of joining','100%','100%',''),
   ('Document Control','8.1','Submission of dossiers within 30 days after project completion','≥ 95%','100%','8 of 8 dossiers'),
   ('Information Technology','9.1','Server down time','< 0.05%','0%','0 h of 4,344 h'),
   ('Information Technology','9.2','Adding software for business process enhancement','1 No.','Annual objective',''),
   ('Fabrication Shop','10.1','Release/handover accuracy (releases vs returned)','≥ 98%','99%','1 item returned in 2 years'),
   ('Fabrication Shop','10.2','Reduce NCRs/observations related to material control at Fabshop','50% of 2025','25 OBS in 2026','22 OBS in 2025'),
   ('Store','11.1','Reduce material rejection at site store due to improper handling and preservation','100%','100%',''),
   ('Store','11.2','Maintain stock level for regularly required items','≥ 90%','100%',''),
   ('Store','11.3','Tools periodic fitness check','100%','100%',''),
   ('Roads','12.1','Compliance with QCS 2014 inspection and testing requirements','≥ 99%','100%','14,044 of 14,044 tests'),
   ('Roads','12.2','Maintain valid Ashghal AVL status through on-time document submission','≥ 99%','100%','37 of 37 listings valid'),
   ('TSS','13.1','OEM partnership continuity for MSA Telecom','100%','Pending','OEM letters & SLAs in place'),
   ('TSS','13.2','Integrated ELV System Proof of Capability + live demo','1 No.','In progress',''),
   ('TSS','13.3','Standardised quality testing template & compliance verification','90%','90%','ITP approved by client'),
   ('Finance','14.1',"Issuance of LCs within target date",'≥ 90%','Annual objective',''),
   ('Camp','15.1','Complaints resolution on time','100%','100%',''),
   ('Camp','15.2','Perform camp inspection','≥ 90%','100%',''),
   ('Safety','16.1','Recording number of observations per week','100%','100%','1,095 observations / week'),
   ('Safety','16.2','Number of recordable incidents','≤ 5 Nos.','1','MTC'),
   ('Safety','16.3','LTI frequency','0 No','0','')]
def status(t,a):
    if a in ('Pending',): return 'Pending data'
    if a in ('In progress',): return 'In progress'
    if a.startswith('Annual'): return 'Annual objective'
    nt=re.findall(r'[\d.]+',t.replace(',','')); na=re.findall(r'-?[\d.]+',a.replace('−','-').replace(',',''))
    if not nt or not na: return 'Achieved' if a==t else 'Review'
    tv=float(nt[0]); av=float(na[0])
    if '≤' in t or '<' in t: return 'Achieved' if av<=tv else 'Not achieved'
    if '≥' in t or '>' in t: return 'Achieved' if av>=tv else 'Not achieved'
    return 'Achieved' if av>=tv else 'Not achieved'
obj=[]
for i,(dep,ref,o,t,a,rem) in enumerate(O):
    st=status(t,a)
    if ref=='3.2': st='Not achieved'
    if ref=='10.2': st='Not achieved'
    if ref=='7.2': st='Achieved'
    if ref=='1.2': st='Review'
    obj.append({'year':2026,'ref':ref,'objective':o,'target':t,'department':dep,'owner':dep,'frequency':'Half-yearly','monthly':{'6':a},'status':st,'remarks':('H1 2026 (MRM 26/02): '+a+('; '+rem if rem else '')),'sort':i+1})
import collections; print(collections.Counter(o['status'] for o in obj))
json.dump(obj,open('/tmp/build/raw/_objectives.json','w'),ensure_ascii=False)
