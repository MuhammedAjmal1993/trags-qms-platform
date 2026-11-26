// Dashboard sections loaded per tab (kept out of the main dashboard payload so the overview stays fast).
// Layout follows the TRAGS Looker Studio Quality Dashboard pages.
import { type Env } from '../lib';

export interface Filt { from: string; to: string; won?: string; client?: string; extint?: string }
function extra(f: Filt, args: unknown[], noExt = false): string {
  let s = '';
  if (f.won) { s += ' AND won = ?'; args.push(f.won); }
  if (f.client) { s += ' AND client = ?'; args.push(f.client); }
  if (f.extint && !noExt) { s += ' AND ext_int = ?'; args.push(f.extint); }
  return s;
}
const CLOSED = "LOWER(COALESCE(status,'')) IN ('closed','cancelled')";

// Run a list of [name, sql, args] in one D1 batch and return { name: rows }.
async function batch(env: Env, qs: [string, string, unknown[]][]) {
  const res = await env.DB.batch(qs.map(([, s, a]) => env.DB.prepare(s).bind(...a)));
  return Object.fromEntries(qs.map(([n], i) => [n, res[i].results]));
}
function q(f: Filt, sql: (w: string) => string, noExt = false): [string, unknown[]] {
  const a: unknown[] = [];
  const w = extra(f, a, noExt);
  const s = sql(w);
  // date args first: every section query starts its WHERE with "BETWEEN ? AND ?"
  return [s, s.includes('BETWEEN ? AND ?') ? [f.from, f.to, ...a] : a];
}

export async function buildSection(env: Env, name: string, f: Filt): Promise<unknown> {
  const W = (n: string, sql: (w: string) => string, noExt = false): [string, string, unknown[]] => { const [s, a] = q(f, sql, noExt); return [n, s, a]; };
  switch (name) {
    case 'welding': {
      const base = "FROM records WHERE register='WRR' AND deleted=0 AND actual_date BETWEEN ? AND ?";
      const cols = `SUM(COALESCE(json_extract(data,'$.joints_welded'),0)) AS joints, SUM(COALESCE(json_extract(data,'$.inch_dia'),0)) AS inch, SUM(COALESCE(num3,0)) AS jrt,
        SUM(COALESCE(json_extract(data,'$.joints_acc'),0)) AS jacc, SUM(COALESCE(num1,0)) AS films, SUM(COALESCE(num2,0)) AS rej,
        SUM(COALESCE(json_extract(data,'$.lm_welded'),0)) AS lm, SUM(COALESCE(json_extract(data,'$.lm_rej'),0)) AS lmrej, COUNT(DISTINCT report_no) AS welders`;
      return batch(env, [
        W('totals', (w) => `SELECT ${cols} ${base} ${w}`, true),
        W('byType', (w) => `SELECT COALESCE(json_extract(data,'$.welder_type'),'(blank)') AS k, ${cols} ${base} ${w} GROUP BY k ORDER BY films DESC`, true),
        W('linear', (w) => `SELECT COALESCE(process,'(blank)') AS k, SUM(COALESCE(json_extract(data,'$.lm_welded'),0)) AS lm, SUM(COALESCE(json_extract(data,'$.lm_rej'),0)) AS lmrej ${base} ${w} GROUP BY k HAVING lm > 0 ORDER BY lm DESC LIMIT 15`, true),
        W('byMonth', (w) => `SELECT substr(actual_date,1,7) AS m, SUM(COALESCE(json_extract(data,'$.joints_welded'),0)) AS joints, SUM(COALESCE(num1,0)) AS films, SUM(COALESCE(num2,0)) AS rej ${base} ${w} GROUP BY m ORDER BY m`, true),
        W('welders', (w) => `SELECT report_no AS id, MAX(json_extract(data,'$.welder_name')) AS name, MAX(json_extract(data,'$.welder_type')) AS type, MAX(process) AS site,
          SUM(COALESCE(json_extract(data,'$.joints_welded'),0)) AS joints, SUM(COALESCE(num1,0)) AS films, SUM(COALESCE(num2,0)) AS rej
          ${base} ${w} GROUP BY id HAVING films > 0 ORDER BY films DESC LIMIT 400`, true),
      ]);
    }
    case 'rfi': {
      const base = "FROM records WHERE register='RFI' AND deleted=0 AND plan_date BETWEEN ? AND ?";
      const cnt = `COUNT(*) AS n, SUM(CASE WHEN UPPER(status) LIKE 'REJECT%' THEN 1 ELSE 0 END) AS rej, SUM(CASE WHEN UPPER(status) LIKE 'CANCEL%' THEN 1 ELSE 0 END) AS canc`;
      return batch(env, [
        W('status', (w) => `SELECT COALESCE(status,'(blank)') AS k, COUNT(*) AS n ${base} ${w} GROUP BY k ORDER BY n DESC`),
        W('byWon', (w) => `SELECT COALESCE(won,'(blank)') AS k, MAX(client) AS client, ${cnt} ${base} ${w} GROUP BY k ORDER BY n DESC LIMIT 15`),
        W('byInspector', (w) => `SELECT COALESCE(NULLIF(TRIM(json_extract(data,'$.inspector')),''),'(blank)') AS k, ${cnt} ${base} ${w} GROUP BY k ORDER BY n DESC LIMIT 15`),
        W('byLocation', (w) => `SELECT COALESCE(NULLIF(TRIM(json_extract(data,'$.location')),''),'(blank)') AS k, ${cnt} ${base} ${w} GROUP BY k ORDER BY n DESC LIMIT 12`),
      ]);
    }
    case 'nfi': {
      const base = "FROM records WHERE register='NFI' AND deleted=0 AND COALESCE(plan_date, actual_date) BETWEEN ? AND ?";
      const cnt = `COUNT(*) AS n, SUM(CASE WHEN status='Open' THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN status='Closed' THEN 1 ELSE 0 END) AS closed`;
      return batch(env, [
        W('status', (w) => `SELECT COALESCE(status,'(blank)') AS k, COUNT(*) AS n ${base} ${w} GROUP BY k`, true),
        W('insp', (w) => `SELECT COALESCE(NULLIF(sub_category,'Na'),'Not stated') AS k, COUNT(*) AS n ${base} ${w} GROUP BY k ORDER BY n DESC`, true),
        W('result', (w) => `SELECT COALESCE(finding_type,'Not stated') AS k, COUNT(*) AS n ${base} ${w} GROUP BY k ORDER BY n DESC`, true),
        W('byPO', (w) => `SELECT COALESCE(json_extract(data,'$.po_no'),'(blank)') AS k, MAX(won) AS won, ${cnt} ${base} ${w} GROUP BY k ORDER BY n DESC LIMIT 15`, true),
        W('byLocation', (w) => `SELECT COALESCE(NULLIF(json_extract(data,'$.location'),''),'(blank)') AS k, ${cnt} ${base} ${w} GROUP BY k ORDER BY n DESC LIMIT 15`, true),
        W('byTPI', (w) => `SELECT COALESCE(NULLIF(json_extract(data,'$.tpi_agency'),''),'Not recorded') AS k, ${cnt} ${base} ${w} GROUP BY k ORDER BY n DESC LIMIT 12`, true),
        W('byMonth', (w) => `SELECT substr(COALESCE(plan_date, actual_date),1,7) AS m, ${cnt} ${base} ${w} GROUP BY m ORDER BY m`, true),
        W('open', (w) => `SELECT id, report_no, won, json_extract(data,'$.po_no') AS po, json_extract(data,'$.itp_desc') AS item, json_extract(data,'$.location') AS location, due_date, sub_category
          ${base} AND status='Open' ${w} ORDER BY due_date LIMIT 30`, true),
      ]);
    }
    case 'training': {
      const base = "FROM records WHERE register='TRN' AND deleted=0 AND plan_date BETWEEN ? AND ?";
      return batch(env, [
        W('matrix', (w) => `SELECT COALESCE(sub_category,'(blank)') AS k, COALESCE(category,'') AS p, COUNT(*) AS planned, SUM(CASE WHEN actual_date IS NOT NULL THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN actual_date IS NULL AND plan_date <= date('now') AND LOWER(COALESCE(status,'')) <> 'cancelled' THEN 1 ELSE 0 END) AS pending, SUM(COALESCE(num1,0)) AS participants ${base} ${w} GROUP BY k, p`),
        W('byLocation', (w) => `SELECT COALESCE(NULLIF(TRIM(json_extract(data,'$.location')),''),'(blank)') AS k, COUNT(*) AS n ${base} AND actual_date IS NOT NULL ${w} GROUP BY k ORDER BY n DESC LIMIT 12`),
        W('byTrainer', (w) => `SELECT COALESCE(NULLIF(TRIM(json_extract(data,'$.conducted_by')),''),'(blank)') AS k, COUNT(*) AS n, SUM(COALESCE(num1,0)) AS p ${base} AND actual_date IS NOT NULL ${w} GROUP BY k ORDER BY n DESC LIMIT 12`),
        W('pending', (w) => `SELECT id, uid, plan_date, sub_category, category, json_extract(data,'$.subject') AS subject, json_extract(data,'$.location') AS location ${base} AND actual_date IS NULL AND plan_date <= date('now') AND LOWER(COALESCE(status,'')) <> 'cancelled' ${w} ORDER BY plan_date LIMIT 40`),
      ]);
    }
    case 'feedback': {
      const base = "FROM records WHERE register='CFB' AND deleted=0 AND plan_date BETWEEN ? AND ?";
      return batch(env, [
        W('bySub', (w) => `SELECT COALESCE(sub_category,'(blank)') AS k, COUNT(*) AS n, SUM(CASE WHEN NOT (${CLOSED}) THEN 1 ELSE 0 END) AS open ${base} ${w} GROUP BY k ORDER BY n DESC`),
        W('byMonth', (w) => `SELECT substr(plan_date,1,7) AS m, COALESCE(sub_category,'(blank)') AS k, COUNT(*) AS n ${base} ${w} GROUP BY m, k ORDER BY m`),
        W('byClient', (w) => `SELECT COALESCE(client,'(blank)') AS k, COUNT(*) AS n, AVG(CASE WHEN sub_category='Customer Satisfaction Survey' THEN num1 END) AS score,
          SUM(CASE WHEN sub_category='Customer Satisfaction Survey' THEN 1 ELSE 0 END) AS surveys ${base} ${w} GROUP BY k ORDER BY n DESC LIMIT 15`),
        W('byProcess', (w) => `SELECT COALESCE(NULLIF(process,''),'(blank)') AS k, COUNT(*) AS n ${base} ${w} GROUP BY k ORDER BY n DESC LIMIT 10`),
        W('list', (w) => `SELECT id, uid, plan_date, sub_category, client, won, status, num1 AS score, substr(COALESCE(json_extract(data,'$.description'), json_extract(data,'$.remarks'), ''),1,160) AS text ${base} ${w} ORDER BY plan_date DESC LIMIT 30`),
      ]);
    }
    case 'awards': {
      const base = "FROM records WHERE register='AWD' AND deleted=0 AND category='Welder of the Month' AND plan_date BETWEEN ? AND ?";
      const sel = "SUM(CASE WHEN status IN ('Selected','Winner','Runner-up') THEN 1 ELSE 0 END)";
      return batch(env, [
        W('totals', (w) => `SELECT COUNT(*) AS nominated, ${sel} AS selected, COUNT(DISTINCT json_extract(data,'$.welder_id')) AS welders ${base} ${w}`, true),
        W('byMonth', (w) => `SELECT substr(plan_date,1,7) AS m, COUNT(*) AS nominated, ${sel} AS selected ${base} ${w} GROUP BY m ORDER BY m`, true),
        W('bySite', (w) => `SELECT COALESCE(process,'(blank)') AS k, COUNT(*) AS nominated, ${sel} AS selected ${base} ${w} GROUP BY k ORDER BY nominated DESC LIMIT 12`, true),
        W('byWon', (w) => `SELECT COALESCE(won,'No data') AS k, COUNT(*) AS nominated, ${sel} AS selected ${base} ${w} GROUP BY k ORDER BY nominated DESC LIMIT 12`, true),
        W('byCraft', (w) => `SELECT COALESCE(sub_category,'(blank)') AS k, COUNT(*) AS nominated, ${sel} AS selected ${base} ${w} GROUP BY k ORDER BY nominated DESC`, true),
        W('top', (w) => `SELECT json_extract(data,'$.welder_id') AS id, MAX(json_extract(data,'$.winner')) AS name, MAX(process) AS site, COUNT(*) AS nominated, ${sel} AS selected, ROUND(AVG(num1),1) AS score
          ${base} ${w} GROUP BY id ORDER BY selected DESC, nominated DESC LIMIT 15`, true),
        ['qpa', "SELECT report_no, plan_date, json_extract(data,'$.winner') AS winner, json_extract(data,'$.criteria') AS criteria FROM records WHERE register='AWD' AND deleted=0 AND category <> 'Welder of the Month' ORDER BY plan_date DESC LIMIT 5", []],
      ]);
    }
    case 'trend': {
      // Five-year view of the Finding Register; the date filter is replaced by the last five calendar years.
      const y = new Date().getUTCFullYear();
      const g: Filt = { ...f, from: `${y - 5}-01-01`, to: `${y}-12-31` };
      const W5 = (n: string, sql: (w: string) => string): [string, string, unknown[]] => { const [s, a] = q(g, sql); return [n, s, a]; };
      const base = "FROM records WHERE register='FND' AND deleted=0 AND plan_date BETWEEN ? AND ?";
      return batch(env, [
        W5('byYear', (w) => `SELECT substr(plan_date,1,4) AS y, UPPER(COALESCE(finding_type,'')) AS t, COUNT(*) AS n, SUM(CASE WHEN ${CLOSED} THEN 1 ELSE 0 END) AS closed ${base} ${w} GROUP BY y, t ORDER BY y`),
        W5('byExt', (w) => `SELECT COALESCE(ext_int,'(blank)') AS e, UPPER(COALESCE(finding_type,'')) AS t, COUNT(*) AS n ${base} ${w} GROUP BY e, t`),
        W5('bySub', (w) => `SELECT COALESCE(sub_category,'(blank)') AS k, UPPER(COALESCE(finding_type,'')) AS t, COUNT(*) AS n ${base} ${w} GROUP BY k, t`),
        W5('byProcess', (w) => `SELECT COALESCE(process,'(blank)') AS k, SUM(CASE WHEN UPPER(finding_type)='NCR' THEN 1 ELSE 0 END) AS ncr, SUM(CASE WHEN UPPER(finding_type)='OBSERVATION' THEN 1 ELSE 0 END) AS obs,
          SUM(CASE WHEN UPPER(finding_type)='AFI' THEN 1 ELSE 0 END) AS afi, COUNT(*) AS n ${base} ${w} GROUP BY k ORDER BY n DESC LIMIT 20`),
        W5('byClient', (w) => `SELECT COALESCE(client,'(blank)') AS k, COUNT(*) AS n, SUM(CASE WHEN UPPER(finding_type)='NCR' THEN 1 ELSE 0 END) AS ncr ${base} ${w} GROUP BY k ORDER BY n DESC LIMIT 12`),
        W5('closeout', (w) => `SELECT substr(plan_date,1,4) AS y, ROUND(AVG(julianday(close_date) - julianday(plan_date)),1) AS days ${base} AND close_date IS NOT NULL AND close_date >= plan_date ${w} GROUP BY y ORDER BY y`),
      ]);
    }
  }
  return null;
}

// Welder performance card: everything recorded against one welder ID.
export async function welderCard(env: Env, id: string) {
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT substr(actual_date,1,7) AS m, SUM(COALESCE(json_extract(data,'$.joints_welded'),0)) AS joints, SUM(COALESCE(json_extract(data,'$.inch_dia'),0)) AS inch,
      SUM(COALESCE(num3,0)) AS jrt, SUM(COALESCE(num1,0)) AS films, SUM(COALESCE(num2,0)) AS rej, SUM(COALESCE(json_extract(data,'$.lm_welded'),0)) AS lm
      FROM records WHERE register='WRR' AND deleted=0 AND report_no = ? GROUP BY m ORDER BY m`).bind(id),
    env.DB.prepare(`SELECT MAX(json_extract(data,'$.welder_name')) AS name, MAX(json_extract(data,'$.emp_no')) AS emp, MAX(json_extract(data,'$.welder_type')) AS type,
      group_concat(DISTINCT process) AS sites, group_concat(DISTINCT won) AS wons, MIN(actual_date) AS first, MAX(actual_date) AS last
      FROM records WHERE register='WRR' AND deleted=0 AND report_no = ?`).bind(id),
    env.DB.prepare(`SELECT report_no AS period, status, process AS site, num1 AS score, json_extract(data,'$.nominator') AS nominator FROM records
      WHERE register='AWD' AND deleted=0 AND json_extract(data,'$.welder_id') = ? ORDER BY plan_date DESC`).bind(id),
    env.DB.prepare(`SELECT id, report_no, status, due_date, substr(data,1,1500) AS data FROM records WHERE register='WLD' AND deleted=0 AND (report_no = ? OR json_extract(data,'$.welder_id') = ?) LIMIT 5`).bind(id, id),
  ]);
  const months = r[0].results as any[];
  if (!months.length && !(r[2].results as any[]).length && !(r[3].results as any[]).length) return null;
  return { id, info: r[1].results[0], months, awards: r[2].results, qualification: (r[3].results as any[]).map((x) => ({ ...x, data: JSON.parse(x.data.endsWith('}') ? x.data : '{}') })) };
}
