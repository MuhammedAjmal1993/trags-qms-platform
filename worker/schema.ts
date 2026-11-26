// Versioned schema. Each entry runs once, in order, recorded in schema_migrations.
// The worker applies pending migrations on the first request of each isolate,
// so every deploy carries its own database upgrade.
export const MIGRATIONS: { id: number; sql: string[] }[] = [
  {
    id: 1,
    sql: [
      `CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        permissions TEXT NOT NULL DEFAULT '{}',
        is_system INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        title TEXT,
        site TEXT,
        role_id INTEGER NOT NULL REFERENCES roles(id),
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        must_change_pw INTEGER NOT NULL DEFAULT 1,
        failed_logins INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        last_login TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        ip TEXT, ua TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
      `CREATE TABLE IF NOT EXISTS work_orders (
        won TEXT PRIMARY KEY,
        client TEXT, project_no TEXT, contract_no TEXT, title TEXT,
        project_name TEXT, location TEXT, project_manager TEXT, qc_lead TEXT,
        status TEXT DEFAULT 'Active', start_date TEXT, end_date TEXT,
        health_override TEXT, notes TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')), updated_by INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS registers (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        module TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        register TEXT NOT NULL REFERENCES registers(code),
        uid TEXT, row_key TEXT, seq REAL,
        won TEXT, client TEXT, status TEXT,
        category TEXT, sub_category TEXT, ext_int TEXT, finding_type TEXT,
        report_no TEXT, process TEXT, criticality TEXT,
        plan_date TEXT, actual_date TEXT, close_date TEXT, due_date TEXT,
        num1 REAL, num2 REAL, num3 REAL, num4 REAL,
        data TEXT NOT NULL DEFAULT '{}',
        source TEXT, upload_id INTEGER,
        deleted INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by INTEGER, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS ix_records_reg ON records(register, deleted, seq)`,
      `CREATE INDEX IF NOT EXISTS ix_records_won ON records(won, register)`,
      `CREATE INDEX IF NOT EXISTS ix_records_uid ON records(register, uid)`,
      `CREATE INDEX IF NOT EXISTS ix_records_key ON records(register, row_key)`,
      `CREATE INDEX IF NOT EXISTS ix_records_report ON records(report_no)`,
      `CREATE TABLE IF NOT EXISTS record_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id INTEGER NOT NULL, register TEXT NOT NULL,
        action TEXT NOT NULL, changes TEXT, user_id INTEGER, user_name TEXT,
        at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS ix_hist_rec ON record_history(record_id)`,
      `CREATE TABLE IF NOT EXISTS attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id INTEGER, register TEXT, r2_key TEXT NOT NULL, filename TEXT,
        mime TEXT, size INTEGER, uploaded_by INTEGER,
        uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS ix_att_rec ON attachments(record_id)`,
      `CREATE TABLE IF NOT EXISTS numbering_series (
        code TEXT PRIMARY KEY, label TEXT NOT NULL, pattern TEXT NOT NULL,
        register TEXT, field TEXT, reset_yearly INTEGER NOT NULL DEFAULT 1,
        pad INTEGER NOT NULL DEFAULT 3, active INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS counters (
        series TEXT NOT NULL, year INTEGER NOT NULL, last INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (series, year)
      )`,
      `CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT, r2_key TEXT, mime TEXT, size INTEGER,
        kind TEXT, status TEXT NOT NULL DEFAULT 'received',
        target_register TEXT, won TEXT,
        text_content TEXT, extracted TEXT, result TEXT, error TEXT,
        uploaded_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        applied_at TEXT, applied_by INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_no TEXT, title TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 2,
        category TEXT NOT NULL DEFAULT 'Procedure', entity TEXT, owner TEXT,
        status TEXT NOT NULL DEFAULT 'Current', issue_no TEXT,
        expiry_date TEXT, review_date TEXT, notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), created_by INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS document_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        rev TEXT NOT NULL, rev_date TEXT, r2_key TEXT, filename TEXT, mime TEXT, size INTEGER,
        change_summary TEXT, is_current INTEGER NOT NULL DEFAULT 1,
        uploaded_by INTEGER, uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS ix_docrev ON document_revisions(document_id)`,
      `CREATE TABLE IF NOT EXISTS objectives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL, ref TEXT, objective TEXT NOT NULL, kpi TEXT,
        target TEXT, unit TEXT, direction TEXT DEFAULT '>=', frequency TEXT,
        owner TEXT, department TEXT, metric TEXT,
        monthly TEXT NOT NULL DEFAULT '{}', status TEXT, remarks TEXT,
        sort INTEGER DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS signoffs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL, subject_ref TEXT NOT NULL, role TEXT NOT NULL,
        user_id INTEGER, name TEXT, title TEXT, comment TEXT, r2_key TEXT,
        signed_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL, year INTEGER, title TEXT NOT NULL, won TEXT,
        doc_no TEXT, rev TEXT, status TEXT DEFAULT 'Draft',
        r2_key TEXT, filename TEXT, notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), created_by INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER, user_name TEXT, action TEXT NOT NULL,
        entity TEXT, entity_id TEXT, detail TEXT, ip TEXT,
        at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS templates (
        code TEXT PRIMARY KEY, label TEXT NOT NULL, kind TEXT NOT NULL,
        r2_key TEXT, filename TEXT, field_map TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
];
