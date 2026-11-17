import { useEffect, useMemo, useState } from 'react';
import { Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { csvExport, fmtLongDate } from '../lib/format';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { logAudit } from '../lib/audit';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import { listReportCrops, lastReportCropAt, supabaseConfigured, type ReportCrop } from '../lib/supabase';
import { loadFailure } from '../lib/dberror';
import { Ucn } from '../lib/callstate';
import { COMPLETE } from '../lib/exportscope';
import { safeUrl } from '../lib/safeUrl';

// ===========================================================================
// DAILY CUT-OUTS (0487) -- Reports -> Visit Date Check -> Daily cut-outs (the
// user, 2026-11-17: "Create a Scheduled task to do this read report and crop
// and present this as Data on a daily basis.. Basically without involving
// Haiku.. just the presentation of data. Say today do this check for all calls
// with report updated yesterday.").
//
// Every morning at 06:00 India time the GitHub workflow daily-report-crops
// crops the Service Visit Date box out of each manual report entered the day
// before (no model reads it) and stores the cut-out here. This view shows one
// day at a time: each visit's cut-out beside its Visit Date in RITHI, for a
// person to compare by eye. Read with visitdate.view (administrators for now).
// ===========================================================================

const STATUS_WORDS: Record<ReportCrop['status'], string> = { found: 'Box found', no_box: 'No box found' };

const yesterday = () => {
  const [y, m, d] = todayLocal().split('-').map(Number);
  const t = new Date(y, m - 1, d - 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

const EXPORT: { key: string; header: string }[] = [
  { key: 'entry_day', header: 'Entered on' },
  { key: 'ucn', header: 'UCN' },
  { key: 'engineer', header: 'Engineer' },
  { key: 'visit_at', header: 'Visit Date in RITHI (when cropped)' },
  { key: 'entry_at', header: 'Visit Entry Date' },
  { key: 'status_words', header: 'Result' },
  { key: 'note', header: 'How it was found' },
  { key: 'manual_report', header: 'Manual report' },
  { key: 'report_uid', header: 'Visit UID' },
];

export function DailyCutouts() {
  const [day, setDay] = useState(yesterday());
  const [rows, setRows] = useState<ReportCrop[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [lastRun, setLastRun] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured() || !day) return;
    let alive = true;
    setBusy(true); setErr(null);
    Promise.all([listReportCrops(day), lastReportCropAt()])
      .then(([r, last]) => { if (alive) { setRows(r); setLastRun(last); } })
      .catch((e) => { if (alive) setErr(loadFailure(e, { tables: ['visit_report_crops'], hint: 'Daily cut-outs are not on the project yet -- migration 0487 (supabase/apply/reports.sql).' })); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [day]);

  const facets = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(STATUS_WORDS[r.status], (m.get(STATUS_WORDS[r.status]) ?? 0) + 1));
    return [...m.entries()].map(([key, count]) => ({ key, count }));
  }, [rows]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!status || STATUS_WORDS[r.status] === status)
      && (!s || `${r.ucn} ${r.engineer} ${r.report_uid}`.toLowerCase().includes(s)));
  }, [rows, q, status]);

  const download = (kind: 'xlsx' | 'csv') => {
    if (!visible.length) return;
    const name = `daily-cutouts-${day}`;
    const shaped = visible.map((r) => ({ ...r, status_words: STATUS_WORDS[r.status] })) as unknown as Record<string, unknown>[];
    const scope = [`entered on ${formatDay(day)}`, status ? `result: ${status}` : '', q.trim() ? `search: ${q.trim()}` : ''].filter(Boolean).join(' · ');
    if (kind === 'csv') {
      csvExport(`${name}.csv`, EXPORT, shaped.map((r) => Object.fromEntries(EXPORT.map((c) => [c.key, xlsxText(r[c.key])]))), COMPLETE);
    } else {
      xlsxDownload(`${name}.xlsx`, [
        { name: 'Daily cut-outs', columns: EXPORT.map((c) => c.header),
          rows: shaped.map((r) => Object.fromEntries(EXPORT.map((c) => [c.header, xlsxCell(r[c.key])]))) },
        { name: 'About', columns: ['Item', 'Value'], rows: [
          { Item: 'Report', Value: 'Visit Date Check -- Daily cut-outs' },
          { Item: 'One row is', Value: 'One visit with a manual report, entered on the day named: the Service Visit Date box cut out of the report (the image is on screen, not in this file) beside the Visit Date in RITHI.' },
          { Item: 'How', Value: 'Cropped every morning at 06:00 India time by the daily job, by the form’s ruled lines or else the printed label. No model reads it: compare by eye.' },
          { Item: 'Scope of this file', Value: scope },
          { Item: 'Rows', Value: String(visible.length) },
          { Item: 'Taken', Value: fmtLongDate(new Date().toISOString()) },
        ] },
      ], COMPLETE);
    }
    logAudit({ action: 'report.daily_cutouts', meta: { rows: visible.length, scope, kind } });
  };

  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>
        Every morning at 06:00 India time the daily job cuts the <b>Service Visit Date</b> box out of each manual report
        entered the day before — no AI reads it — so you can compare it with the Visit Date in RITHI by eye.
        {lastRun ? <> Last run stored a cut-out at <b>{formatDayTime(lastRun)}</b>.</> : ' It has not stored anything yet.'}
      </p>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
        <label className="field" style={{ width: 200 }}><span className="field-label">Visits entered on</span>
          <input className="input" type="date" value={day} max={todayLocal()} onChange={(e) => setDay(e.target.value)} />
        </label>
        <span className="muted" style={{ fontSize: 12.5 }}>{formatDay(day)}</span>
      </div>
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="UCN, engineer or visit UID" />
        <button className="btn btn-ghost btn-sm" onClick={() => download('xlsx')} disabled={!visible.length}>⭳ Excel</button>
        <button className="btn btn-ghost btn-sm" onClick={() => download('csv')} disabled={!visible.length}>⭳ CSV</button>
      </Toolbar>
      {/* One day is loaded whole, so the counts are exact. */}
      <FacetChips options={facets} value={status} onChange={setStatus} more={false} />
      {busy ? <div className="muted" style={{ padding: 12 }}>Loading…</div>
        : !visible.length ? (
          <div className="sheet-banner sheet-banner-ok"><span>
            {rows.length ? 'Nothing matches.' : `No cut-outs for visits entered on ${formatDay(day)} — none was entered with a manual report that day, or the daily job has not run for it yet.`}
          </span></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="assoc-table" style={{ minWidth: 820 }}>
              <thead><tr><th>#</th><th>UCN</th><th>Engineer</th><th>Visit Date in RITHI</th><th>Cut-out from the report</th><th>How</th><th>Report</th></tr></thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><Ucn ucn={r.ucn} /></td>
                    <td>{r.engineer}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><b>{r.visit_at ? formatDay(r.visit_at) : '—'}</b>
                      <div className="muted" style={{ fontSize: 11 }}>entered {r.entry_at ? formatDayTime(r.entry_at) : '—'}</div></td>
                    <td>{r.crop_jpeg
                      ? <img src={r.crop_jpeg} alt={`Service Visit Date box for ${r.ucn}`} style={{ maxWidth: 420, maxHeight: 140, border: '1px solid var(--border, #ccc)' }} />
                      : <span className="muted">{STATUS_WORDS[r.status]}</span>}</td>
                    <td className="muted" style={{ fontSize: 11.5, maxWidth: 200 }}>{r.note}</td>
                    <td>{safeUrl(r.manual_report) ? <a href={safeUrl(r.manual_report)} target="_blank" rel="noreferrer">Open</a> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
