// Register definitions. Seeded into the `registers` table on first run; the admin
// panel edits them afterwards (columns, dropdown lists, numbering). Column labels
// follow the TRAGS Excel headers so imports map by header name, never by position.

export type ColType = 'text' | 'textarea' | 'number' | 'percent' | 'date' | 'select' | 'computed' | 'uid';
export type Role =
  | 'uid' | 'won' | 'client' | 'status' | 'category' | 'sub_category' | 'ext_int'
  | 'finding_type' | 'report_no' | 'process' | 'criticality'
  | 'plan_date' | 'actual_date' | 'close_date' | 'due_date'
  | 'num1' | 'num2' | 'num3' | 'num4' | 'description' | 'finding_no';

export interface Column {
  key: string;          // stable field key in record JSON
  label: string;        // Excel header text (match key for imports)
  type: ColType;
  role?: Role;          // promoted, indexed field used by dashboards and sync rules
  options?: string[];   // dropdown list (Validation sheet equivalent)
  required?: boolean;
  width?: number;
  compute?: string;     // computed columns: month(x) | actual_month(x) | add_days(x,n) | ratio(a,b) | product(a,b)
  aliases?: string[];   // alternative header spellings accepted on import
  hidden?: boolean;     // hidden in grid by default
  inferredFlag?: boolean; // values entered by AI extraction are marked for review
}

export interface RegisterConfig {
  code: string;
  name: string;
  module: string;       // menu group
  sort: number;
  uidCode?: string;     // NNN-<uidCode>-YY
  uidSeries?: string;   // numbering series code
  keyFields: string[];  // duplicate / upsert key (exact match)
  statusOptions?: string[];
  closedStatuses?: string[];
  uncPath?: string;     // TRAGS record folder for the UID hyperlink
  columns: Column[];
  forms?: string[];     // template codes that can be generated from a row
}

const PRIMARY = ['QMS', 'PROJECT'];
const EXTINT = ['INTERNAL', 'EXTERNAL'];
const SUBCAT_AUDIT = ['Audit', 'Surveillance', 'QWA', 'Inspection'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export { MONTHS };

export const REGISTERS: RegisterConfig[] = [
  {
    code: 'AUD', name: '01 Audit Plan Register', module: 'Audits', sort: 1,
    uidCode: '01', uidSeries: 'UID-01', keyFields: ['report_no'],
    statusOptions: ['Planned', 'Notified', 'Conducted', 'Closed', 'Postponed', 'Cancelled'],
    closedStatuses: ['Closed', 'Cancelled'],
    uncPath: '\\\\172.16.3.208\\Root\\Quality\\UID\\01.0- Audit Plan Record\\{YYYY}\\{UID}',
    columns: [
      { key: 'uid', label: 'UID', type: 'uid', role: 'uid', width: 90 },
      { key: 'primary', label: 'Primary Category', type: 'select', role: 'category', options: PRIMARY, required: true },
      { key: 'sub_category', label: 'Sub Category', type: 'select', role: 'sub_category', options: ['Audit', 'Surveillance', 'QWA'], required: true },
      { key: 'ext_int', label: 'External/Internal', type: 'select', role: 'ext_int', options: EXTINT, required: true },
      { key: 'won', label: 'WON', type: 'text', role: 'won', aliases: ['WO#', 'WO No', 'Work Order'], required: true },
      { key: 'client', label: 'Client', type: 'select', role: 'client', options: [] },
      { key: 'plan_date', label: 'Plan Date', type: 'date', role: 'plan_date', required: true },
      { key: 'report_no', label: 'Audit Report No.', type: 'text', role: 'report_no' },
      { key: 'process', label: 'Department/Process', type: 'select', role: 'process', options: [] },
      { key: 'project', label: 'PROJECT', type: 'text' },
      { key: 'auditor', label: 'Auditor', type: 'select', options: [] },
      { key: 'auditee', label: 'Auditee', type: 'text' },
      { key: 'actual_date', label: 'Actual Date', type: 'date', role: 'actual_date' },
      { key: 'followup_date', label: 'Audit Follow-up Date', type: 'computed', compute: 'add_days(actual_date,30)', role: 'due_date', aliases: ['Follow-up Date', 'Follow up Date'] },
      { key: 'ncr_no', label: 'NCR no.', type: 'number', role: 'num1' },
      { key: 'ncr_status', label: 'NCR status', type: 'text' },
      { key: 'obs_no', label: 'Observation no.', type: 'number', role: 'num2' },
      { key: 'obs_status', label: 'Obs status', type: 'text' },
      { key: 'ofi_no', label: 'OFI no.', type: 'number', role: 'num3' },
      { key: 'ofi_status', label: 'OFI status', type: 'text', aliases: ['OFI action', 'OFI Status'] },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
      { key: 'plan_month', label: 'Month', type: 'computed', compute: 'month(plan_date)' },
      { key: 'actual_month', label: 'Actual Month', type: 'computed', compute: 'actual_month(actual_date)' },
      { key: 'status', label: 'Audit Status', type: 'select', role: 'status', options: ['Planned', 'Notified', 'Conducted', 'Closed', 'Postponed', 'Cancelled'] },
      { key: 'notification_ref', label: 'Notification Ref', type: 'text' },
    ],
  },
  {
    code: 'FND', name: '02 Finding Register', module: 'Findings', sort: 2,
    uidCode: '02', uidSeries: 'UID-02', keyFields: ['report_no', 'finding_no'],
    statusOptions: ['Open', 'Closed', 'Ongoing', 'Cancelled'], closedStatuses: ['Closed', 'Cancelled'],
    uncPath: '\\\\172.16.3.208\\Root\\Quality\\UID\\02.0- Finding Register  Record\\{YYYY}\\{UID}',
    forms: ['F271', 'NCR'],
    columns: [
      { key: 'uid', label: 'UID', type: 'uid', role: 'uid', width: 90 },
      { key: 'primary', label: 'Primary Category', type: 'select', role: 'category', options: PRIMARY, required: true },
      { key: 'sub_category', label: 'Sub Category', type: 'select', role: 'sub_category', options: SUBCAT_AUDIT, required: true },
      { key: 'ext_int', label: 'External/Internal', type: 'select', role: 'ext_int', options: EXTINT, required: true },
      { key: 'won', label: 'WON', type: 'text', role: 'won', aliases: ['WO#', 'Work Order'], required: true },
      { key: 'client', label: 'Client', type: 'select', role: 'client', options: [] },
      { key: 'issue_date', label: 'Issue Date', type: 'date', role: 'plan_date', required: true },
      { key: 'months', label: 'Months', type: 'computed', compute: 'month(issue_date)' },
      { key: 'finding_no', label: 'Finding No', type: 'text', role: 'finding_no', aliases: ['Finding No.'] },
      { key: 'nature', label: 'Finding Nature', type: 'select', options: ['NEGETIVE', 'POSITIVE'], aliases: ['Positive/Negative', 'Nature'] },
      { key: 'finding_type', label: 'Finding Category', type: 'select', role: 'finding_type', options: ['NCR', 'OBSERVATION', 'AFI'], required: true, aliases: ['Category'] },
      { key: 'criticality', label: 'Criticality', type: 'select', role: 'criticality', options: ['High', 'Medium', 'Low'], inferredFlag: true },
      { key: 'report_no', label: 'Report No./Ref No.', type: 'text', role: 'report_no', required: true, aliases: ['Report No', 'Ref No'] },
      { key: 'raised_by', label: 'Raised by', type: 'select', options: ['External (Client Repr.) '] },
      { key: 'process', label: 'Process/Area', type: 'select', role: 'process', options: [], inferredFlag: true },
      { key: 'location', label: 'Location', type: 'select', options: [], inferredFlag: true },
      { key: 'recipient', label: 'Recipient', type: 'select', options: [] },
      { key: 'actionee', label: 'Actionee', type: 'select', options: [], inferredFlag: true },
      { key: 'description', label: 'Description', type: 'textarea', role: 'description', required: true, width: 360 },
      { key: 'correction', label: 'Correction', type: 'textarea' },
      { key: 'root_cause', label: 'Root Cause', type: 'textarea' },
      { key: 'corrective_action', label: 'Corrective Action', type: 'textarea' },
      { key: 'ca_approval_date', label: 'Corrective Action Approval Date', type: 'date', role: 'due_date' },
      { key: 'status', label: 'Status', type: 'select', role: 'status', options: ['Open', 'Closed', 'Ongoing', 'Cancelled'], required: true },
      { key: 'closeout_date', label: 'Closeout Date', type: 'date', role: 'close_date' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    code: 'NFI', name: '21 Inspection Log Register (NFI)', module: 'Inspections', sort: 3,
    keyFields: ['nfi_no'], statusOptions: ['Open', 'Closed', 'Cancelled', 'Rejected'], closedStatuses: ['Closed', 'Cancelled', 'Rejected'],
    columns: [
      { key: 'sl_no', label: 'Sl.NO', type: 'number' },
      { key: 'po_no', label: 'PO Number', type: 'text' },
      { key: 'won', label: 'WON', type: 'text', role: 'won' },
      { key: 'nfi_received', label: 'Subcontractor NFI Received Date', type: 'date', role: 'plan_date' },
      { key: 'nfi_no', label: 'Subcontractor NFI No', type: 'text', role: 'report_no', required: true },
      { key: 'itp_no', label: 'ITP Number', type: 'text' },
      { key: 'itp_activity', label: 'ITP Activity No.', type: 'text' },
      { key: 'itp_desc', label: 'ITP Activity Description', type: 'textarea', role: 'description' },
      { key: 'trags_int', label: 'TRAGS/TPI intervention (H/W/R)', type: 'text' },
      { key: 'required_date', label: 'Required Date of Inspection', type: 'date', role: 'due_date' },
      { key: 'location', label: 'Location of Inspection', type: 'text' },
      { key: 'ir_no', label: 'Inspection Request Serial Number', type: 'text' },
      { key: 'tpi_approval', label: 'TPI Approval Status', type: 'select', options: ['Available', 'To Arrange', 'N/A'] },
      { key: 'tpi_agency', label: 'Name of TPI Agency/Company', type: 'text', role: 'client' },
      { key: 'inspector', label: 'Name Of Inspector', type: 'text' },
      { key: 'cv_status', label: 'CV Status', type: 'select', options: ['Accepted', 'Rejected', 'Awaiting Response', 'N/A'] },
      { key: 'tpi_po', label: 'TPI Agency P.O.', type: 'text' },
      { key: 'planned', label: 'NFI INSPECTION PLANNED', type: 'select', options: ['Yes', 'No', 'Inspection to reschedule'] },
      { key: 'client_int', label: 'CLIENT_TPI intervention (H/W/R)', type: 'text' },
      { key: 'client_notified', label: 'CLIENT IS NOTIFIED', type: 'select', options: ['Yes', 'NO', 'N/A'] },
      { key: 'actual_date', label: 'Actual Date of Inspection', type: 'date', role: 'actual_date' },
      { key: 'tpi_status', label: 'TPI Inspection Status', type: 'select', role: 'sub_category', options: ['Scheduled', 'Ongoing', 'Completed', 'Partially Completed', 'Due', 'Na'] },
      { key: 'flash_status', label: 'TPI Flash Report Status', type: 'select', options: ['Received', 'Not Received', 'N/A'] },
      { key: 'report_received', label: 'TPI Inspection Report Received on date', type: 'date', role: 'close_date' },
      { key: 'tpi_report_no', label: 'TPI Inspection Report No', type: 'text' },
      { key: 'result', label: 'TPI Inspection Result', type: 'select', role: 'finding_type', options: ['Accepted', 'Rejected', 'Accepted with Comment', 'Cancelled'] },
      { key: 'comments', label: 'Comments/Punch', type: 'textarea' },
      { key: 'comment_status', label: 'Status of Comments', type: 'select', options: ['NA', 'Open', 'Closed'] },
      { key: 'irn_no', label: 'TPI FINAL Report NO./IRN No.', type: 'text' },
      { key: 'reviewed_by', label: 'Reviewed By (TRAGS personnel)', type: 'text' },
      { key: 'status', label: 'NFI-STATUS', type: 'select', role: 'status', options: ['Open', 'Closed', 'Cancelled', 'Rejected'] },
      { key: 'man_days', label: 'Number of TPI Man days', type: 'number', role: 'num1' },
      { key: 'performance', label: "Inspector's Performance", type: 'text' },
      { key: 'preferred', label: 'Preferred for Future Inspections', type: 'text' },
      { key: 'order_value', label: 'TPI BOOKED ORDER VALUE', type: 'number', role: 'num2' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    code: 'RFI', name: '08 RFI Register', module: 'Inspections', sort: 4,
    keyFields: ['rfi_no'], statusOptions: ['Approved', 'AWC', 'Rejected', 'Cancelled', 'Open'], closedStatuses: ['Approved', 'AWC', 'Rejected', 'Cancelled'],
    columns: [
      { key: 'rfi_no', label: 'RFINo.', type: 'text', role: 'report_no', required: true, aliases: ['RFI No', 'RFI No.'] },
      { key: 'won', label: 'WON', type: 'text', role: 'won' },
      { key: 'client', label: 'Client', type: 'text', role: 'client' },
      { key: 'rfi_date', label: 'RFI Date', type: 'date', role: 'plan_date' },
      { key: 'inspection_date', label: 'Inspection Date', type: 'date', role: 'actual_date' },
      { key: 'discipline', label: 'Discipline', type: 'text', role: 'process' },
      { key: 'activity', label: 'Inspection Activity', type: 'textarea', role: 'description' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'inspector', label: 'Inspector', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', role: 'status', options: ['Approved', 'AWC', 'Rejected', 'Cancelled', 'Open'] },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    code: 'SRC', name: '21 Source Inspection Register', module: 'Inspections', sort: 5,
    keyFields: ['report_no'], statusOptions: ['Open', 'Closed', 'Cancelled'], closedStatuses: ['Closed', 'Cancelled'],
    columns: [
      { key: 'report_no', label: 'Inspection Report No', type: 'text', role: 'report_no', required: true },
      { key: 'won', label: 'WON', type: 'text', role: 'won' },
      { key: 'po_no', label: 'PO Number', type: 'text' },
      { key: 'vendor', label: 'Vendor', type: 'text', role: 'client' },
      { key: 'item', label: 'Item / Material', type: 'textarea', role: 'description' },
      { key: 'inspection_type', label: 'Inspection Type', type: 'text', role: 'sub_category' },
      { key: 'plan_date', label: 'Planned Date', type: 'date', role: 'plan_date' },
      { key: 'actual_date', label: 'Inspection Date', type: 'date', role: 'actual_date' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'inspector', label: 'Inspector', type: 'text' },
      { key: 'result', label: 'Result', type: 'select', role: 'finding_type', options: ['Accepted', 'Rejected', 'Accepted with Comment'] },
      { key: 'findings', label: 'Inspection Findings', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'select', role: 'status', options: ['Open', 'Closed', 'Cancelled'] },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    code: 'WLD', name: 'Welder Register', module: 'Welding', sort: 6,
    keyFields: ['welder_id'], statusOptions: ['Active', 'Inactive', 'Expired'], closedStatuses: ['Inactive'],
    columns: [
      { key: 'welder_id', label: 'Welder ID', type: 'text', role: 'report_no', required: true, aliases: ['Welder No', 'Welder Number'] },
      { key: 'emp_no', label: 'Emp No', type: 'text' },
      { key: 'name', label: 'Welder Name', type: 'text', role: 'description', required: true, aliases: ['Name'] },
      { key: 'welder_type', label: 'Welder Type', type: 'text', role: 'category' },
      { key: 'won', label: 'WON', type: 'text', role: 'won' },
      { key: 'site', label: 'Site', type: 'text', role: 'process' },
      { key: 'qc', label: 'QC', type: 'text' },
      { key: 'wpq_no', label: 'WPQ No', type: 'text' },
      { key: 'process_qual', label: 'Welding Process', type: 'text', role: 'sub_category' },
      { key: 'positions', label: 'Positions Qualified', type: 'text' },
      { key: 'qual_date', label: 'Qualification Date', type: 'date', role: 'actual_date' },
      { key: 'continuity_date', label: 'Continuity / Expiry Date', type: 'date', role: 'due_date' },
      { key: 'status', label: 'Status', type: 'select', role: 'status', options: ['Active', 'Inactive', 'Expired'] },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    code: 'WRR', name: '07 Welding Monitoring Register (Weld Repair)', module: 'Welding', sort: 7,
    uidCode: '07', keyFields: ['week', 'welder_id', 'won'],
    columns: [
      { key: 'uid', label: 'UID', type: 'text', role: 'uid' },
      { key: 'welder_id', label: 'Welder No', type: 'text', role: 'report_no', aliases: ['Welder ID'] },
      { key: 'emp_no', label: 'Emp No', type: 'text' },
      { key: 'welder_type', label: 'Welder Type', type: 'text', role: 'category' },
      { key: 'welder_name', label: 'Welder Name', type: 'text', role: 'description' },
      { key: 'input_date', label: 'Data Input Date', type: 'date', role: 'actual_date' },
      { key: 'week', label: 'Week', type: 'text', role: 'sub_category' },
      { key: 'won', label: 'WON', type: 'text', role: 'won' },
      { key: 'qc', label: 'QC', type: 'text' },
      { key: 'site', label: 'Site', type: 'text', role: 'process' },
      { key: 'joints_welded', label: 'No. of Joints Welded', type: 'number' },
      { key: 'inch_dia', label: 'Inch Dia', type: 'number' },
      { key: 'joints_rt', label: "No. of Joints RT'd", type: 'number', role: 'num3' },
      { key: 'joints_acc', label: 'No. of Joints Accepted', type: 'number' },
      { key: 'joint_acc_rate', label: 'Joint Acceptance %', type: 'computed', compute: 'ratio(joints_acc,joints_rt)' },
      { key: 'films_rt', label: "No. of Films RT'd", type: 'number', role: 'num1' },
      { key: 'films_rej', label: 'No. of Films Rejected', type: 'number', role: 'num2' },
      { key: 'film_repair_rate', label: 'Repair Rate (Films)', type: 'computed', compute: 'ratio(films_rej,films_rt)' },
      { key: 'circumference', label: 'Circumference RT\'d', type: 'number' },
      { key: 'repair_length', label: 'Repair Length', type: 'number' },
      { key: 'length_rate', label: 'Repair Rate (Length)', type: 'computed', compute: 'ratio(repair_length,circumference)' },
      { key: 'lm_welded', label: 'LM Welded', type: 'number' },
      { key: 'lm_rej', label: 'LM Rejected', type: 'number', role: 'num4' },
      { key: 'lm_rate', label: 'Repair Rate (LM)', type: 'computed', compute: 'ratio(lm_rej,lm_welded)' },
      { key: 'defect_type', label: 'Defect Type', type: 'text', role: 'finding_type' },
      { key: 'defect_size', label: 'Defect Size', type: 'text' },
      { key: 'defect_detail', label: 'Rejected Joint Detail', type: 'text' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
  {
    code: 'TRN', name: '14 Training Register', module: 'Training', sort: 8,
    uidCode: '14', uidSeries: 'UID-14', keyFields: ['uid'],
    statusOptions: ['Planned', 'Conducted', 'Rescheduled', 'Cancelled'], closedStatuses: ['Conducted', 'Cancelled'],
    uncPath: '\\\\172.16.3.208\\Root\\Quality\\UID\\14.0- Training Record\\{YYYY}\\{UID}',
    columns: [
      { key: 'sr_no', label: 'Sr. No.', type: 'number', hidden: true },
      { key: 'uid', label: 'UID', type: 'uid', role: 'uid' },
      { key: 'primary', label: 'Primary Category', type: 'select', role: 'category', options: PRIMARY, required: true },
      { key: 'sub_category', label: 'Sub Category', type: 'select', role: 'sub_category', options: ['Training', 'Awareness'], required: true },
      { key: 'ext_int', label: 'External/Internal', type: 'select', role: 'ext_int', options: EXTINT },
      { key: 'won', label: 'WON', type: 'text', role: 'won', required: true },
      { key: 'plan_doc', label: 'Training plan document no / Project', type: 'text' },
      { key: 'plan_date', label: 'Training Planned Date', type: 'date', role: 'plan_date', required: true },
      { key: 'reason', label: 'Reason / Purpose', type: 'select', options: ['QMS TRAINING PLAN', 'PROJECT TRAINING PLAN', 'STANDBY TRAINING', 'Continual Improvement'] },
      { key: 'process', label: 'Process/Area/Department', type: 'select', role: 'process', options: [] },
      { key: 'subject', label: 'Subject on Awareness Session', type: 'textarea', role: 'description', required: true },
      { key: 'location', label: 'Training Location', type: 'select', options: [] },
      { key: 'actual_date', label: 'Training Actual Date', type: 'date', role: 'actual_date' },
      { key: 'conducted_by', label: 'Conducted By', type: 'select', options: [] },
      { key: 'participants', label: 'Total No. Participants', type: 'number', role: 'num1' },
      { key: 'duration_hrs', label: 'Duration (Hrs)', type: 'number', role: 'num2' },
      { key: 'attendance', label: 'Attendance Sheet', type: 'text' },
      { key: 'evaluation', label: 'Training Evaluation', type: 'text' },
      { key: 'finding_ref', label: 'Observation/NCR ref', type: 'text' },
      { key: 'feedback_pct', label: 'Training Feedback %', type: 'number', role: 'num3' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
      { key: 'planned_month', label: 'Planned Month', type: 'computed', compute: 'month(plan_date)' },
      { key: 'actual_month', label: 'Actual Month', type: 'computed', compute: 'actual_month(actual_date)' },
      { key: 'status', label: 'Training Status', type: 'select', role: 'status', options: ['Planned', 'Conducted', 'Rescheduled', 'Cancelled'] },
    ],
  },
  {
    code: 'CFB', name: '06 Customer Feedback Register', module: 'Customer Feedback', sort: 9,
    uidCode: '06', uidSeries: 'UID-06', keyFields: ['report_no'],
    statusOptions: ['Open', 'Ongoing', 'Closed'], closedStatuses: ['Closed'],
    uncPath: '\\\\172.16.3.208\\Root\\Quality\\UID\\06.0- Customer Feedback Register  Record\\{YYYY}\\{UID}',
    columns: [
      { key: 'uid', label: 'UID', type: 'uid', role: 'uid' },
      { key: 'primary', label: 'Primary', type: 'select', role: 'category', options: PRIMARY, aliases: ['Primary Category'] },
      { key: 'sub_category', label: 'Sub Category', type: 'select', role: 'sub_category', options: ['Achievements', 'Complaint', 'Customer Satisfaction Survey', 'Email Appreciation'], required: true },
      { key: 'ext_int', label: 'Ext/Int', type: 'select', role: 'ext_int', options: EXTINT, aliases: ['External/Internal'] },
      { key: 'won', label: 'WO#', type: 'text', role: 'won', aliases: ['WON'] },
      { key: 'id_date', label: 'Date of Identification', type: 'date', role: 'plan_date', required: true },
      { key: 'client', label: 'Raised by / Client', type: 'select', role: 'client', options: [] },
      { key: 'report_no', label: 'Report No', type: 'text', role: 'report_no' },
      { key: 'process', label: 'Process/Area', type: 'select', role: 'process', options: [] },
      { key: 'contract', label: 'Project/Contract No.', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea', role: 'description', required: true },
      { key: 'root_cause', label: 'Issue / Root Cause', type: 'textarea' },
      { key: 'action', label: 'Corrective / Preventive Action', type: 'textarea' },
      { key: 'responsibility', label: 'Responsibility', type: 'text' },
      { key: 'learning', label: 'Learning', type: 'textarea' },
      ...['Quality', 'Delivery', 'HSE', 'Communication', 'Technical', 'Documentation', 'Responsiveness', 'Resources', 'Cost', 'Overall']
        .map((n, i) => ({ key: `s${i + 1}`, label: `Survey ${i + 1} - ${n}`, type: 'number' as ColType, hidden: true })),
      { key: 'impact_safety', label: 'Safety', type: 'select', options: ['Low', 'Medium', 'High'], hidden: true },
      { key: 'impact_cost', label: 'Cost', type: 'select', options: ['Low', 'Medium', 'High'], hidden: true },
      { key: 'impact_quality', label: 'Quality', type: 'select', options: ['Low', 'Medium', 'High'], hidden: true },
      { key: 'impact_schedule', label: 'Schedule', type: 'select', options: ['Low', 'Medium', 'High'], hidden: true },
      { key: 'rag', label: 'Green/Yellow/Red', type: 'select', role: 'criticality', options: ['Green', 'Yellow', 'Red'] },
      { key: 'status', label: 'Status', type: 'select', role: 'status', options: ['Open', 'Ongoing', 'Closed'] },
      { key: 'close_date', label: 'Date', type: 'date', role: 'close_date', aliases: ['Closure Date'] },
      { key: 'interested_party', label: 'Interested Party', type: 'text', hidden: true },
      { key: 'issues', label: 'Issues', type: 'text', hidden: true },
      { key: 'needs', label: 'Need and Expectations', type: 'text', hidden: true },
      { key: 'impact', label: 'Impact', type: 'text', hidden: true },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
      { key: 'score', label: 'Score', type: 'number', role: 'num1' },
      { key: 'ref', label: 'Ref', type: 'text' },
    ],
  },
  {
    code: 'LLR', name: '05 Lesson Learnt Register', module: 'Findings', sort: 10,
    uidCode: '05', uidSeries: 'UID-05', keyFields: ['uid'],
    statusOptions: ['Open', 'Implemented', 'Closed'], closedStatuses: ['Closed', 'Implemented'],
    columns: [
      { key: 'uid', label: 'UID', type: 'uid', role: 'uid' },
      { key: 'won', label: 'WON', type: 'text', role: 'won' },
      { key: 'date', label: 'Date', type: 'date', role: 'plan_date' },
      { key: 'category', label: 'Category', type: 'text', role: 'category' },
      { key: 'process', label: 'Process/Area', type: 'text', role: 'process' },
      { key: 'source', label: 'Source / Ref', type: 'text', role: 'report_no' },
      { key: 'description', label: 'Lesson Description', type: 'textarea', role: 'description', required: true },
      { key: 'action', label: 'Action / Recommendation', type: 'textarea' },
      { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', role: 'status', options: ['Open', 'Implemented', 'Closed'] },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ],
  },
];

export const NUMBERING_SEED = [
  { code: 'UID-01', label: 'Audit Plan UID', pattern: '{NNN}-01-{YY}', register: 'AUD', field: 'uid', pad: 3 },
  { code: 'UID-02', label: 'Finding Register UID', pattern: '{NNN}-02-{YY}', register: 'FND', field: 'uid', pad: 3 },
  { code: 'UID-05', label: 'Lesson Learnt UID', pattern: '{NNN}-05-{YY}', register: 'LLR', field: 'uid', pad: 3 },
  { code: 'UID-06', label: 'Customer Feedback UID', pattern: '{NNN}-06-{YY}', register: 'CFB', field: 'uid', pad: 3 },
  { code: 'UID-14', label: 'Training UID', pattern: '{NNN}-14-{YY}', register: 'TRN', field: 'uid', pad: 3 },
  { code: 'IAR', label: 'Internal Audit Report No.', pattern: 'IAR-{NN}-{YY}', register: 'AUD', field: 'report_no', pad: 2 },
  { code: 'TRG-QWA', label: 'TRAGS QWA Report No.', pattern: 'TRG-QWA-{NN}-{YY}', register: 'AUD', field: 'report_no', pad: 2 },
  { code: 'TRG-SUR', label: 'TRAGS Surveillance Report No.', pattern: 'TRG-SUR-{NN}-{YY}', register: 'AUD', field: 'report_no', pad: 2 },
  { code: 'NCR', label: 'Internal NCR No.', pattern: '{YY}/NCR/{NNNN}', register: 'FND', field: 'finding_no', pad: 4 },
  { code: 'OBS', label: 'Internal Observation No.', pattern: '{YY}/OBS/{NNNN}', register: 'FND', field: 'finding_no', pad: 4 },
  { code: 'CFR', label: 'Customer Feedback Report No.', pattern: '{NN}-CFR-{YY}', register: 'CFB', field: 'report_no', pad: 2 },
];

// Roles and permission matrix. Modules map to menu groups; actions per module.
export const MODULES = ['dashboard', 'workorders', 'audits', 'findings', 'inspections', 'welding', 'training', 'feedback', 'documents', 'plans', 'reports', 'ingest', 'admin'] as const;
export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approve'] as const;
export type Perms = Record<string, string[]>;

const all = (acts: string[]) => Object.fromEntries(MODULES.map((m) => [m, acts]));
export const ROLE_SEED: { name: string; description: string; permissions: Perms }[] = [
  { name: 'Administrator', description: 'Full access including users, roles and configuration', permissions: all([...ACTIONS]) },
  { name: 'QA/QC Manager', description: 'All quality modules, approvals and sign-off; no user admin', permissions: { ...all(['view', 'create', 'edit', 'delete', 'export', 'approve']), admin: [] } },
  { name: 'QA/QC Engineer', description: 'Create and edit records in all quality modules; export', permissions: { ...all(['view', 'create', 'edit', 'export']), admin: [] } },
  { name: 'Site Inspector', description: 'Enter inspections, findings, weld data and uploads from site', permissions: { dashboard: ['view'], workorders: ['view'], audits: ['view'], findings: ['view', 'create'], inspections: ['view', 'create', 'edit'], welding: ['view', 'create', 'edit'], training: ['view'], feedback: ['view'], documents: ['view'], plans: ['view'], reports: ['view'], ingest: ['view', 'create'], admin: [] } },
  { name: 'General Manager', description: 'Read access to all modules, report export and objectives sign-off', permissions: { ...all(['view', 'export']), plans: ['view', 'export', 'approve'], admin: [] } },
  { name: 'Viewer', description: 'Read-only access', permissions: { ...all(['view']), admin: [] } },
];

export const MODULE_OF_REGISTER: Record<string, string> = {
  AUD: 'audits', FND: 'findings', LLR: 'findings', NFI: 'inspections', RFI: 'inspections', SRC: 'inspections',
  WLD: 'welding', WRR: 'welding', TRN: 'training', CFB: 'feedback',
};
