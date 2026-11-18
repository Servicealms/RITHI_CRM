import { useEffect, useMemo, useState } from 'react';
import { Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { csvExport, fmtLongDate } from '../lib/format';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { logAudit } from '../lib/audit';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import { listVisitDateCorrections, supabaseConfigured, type VisitDateCorrection } from '../lib/supabase';
import { loadFailure } from '../lib/dberror';
import { Ucn } from '../lib/callstate';
import { COMPLETE } from '../lib/exportscope';
import { safeUrl } from '../lib/safeUrl';

// ===========================================================================
// CORRECTED DATES (0489) -- Reports -> Visit Date Check -> Corrected dates (the
// user, 2026-11-18: "Add a Flag that the Date was Corrected and Present this as
// a Report ... When was it Corrected, What was Present, Was is there at the
// Present, Who did it").
//
// Every Visit Date changed through Visit Date Check -- from a Daily cut-out or
// a Haiku Read -- with when, who, what the date was, what it was set to, and
// what it is now (flagged where it has been changed again since).
//
// NON-AUDITABLE (the user): it is a tab of Visit Date Check so that hiding the
// one hides the other. The hiding itself waits for "Act on Non Auditable
// Backlog" (docs/NON_AUDITABLE_BACKLOG.md).
// ===========================================================================

const AS_SET = 'Still as corrected';
const CHANGED = 'Changed again since';

const EXPORT: { key: string; header: string }[] = [
  { key: 'corrected_at', header: 'Corrected on' },
  { key: 'corrected_by_name', header: 'Corrected by' },
  { key: 'source', header: 'Corrected from' },
  { key: 'ucn', header: 'UCN' },
  { key: 'engineer', header: 'Engineer' },
  { key: 'was_visit_at', header: 'Visit Date before (what was present)' },
  { key: 'set_to_visit_at', header: 'Visit Date set to' },
  { key: 'now_visit_at', header: 'Visit Date now (what is there at present)' },
  { key: 'state', header: 'Now' },
  { key: 'report_uid', header: 'Visit UID' },
  { key: 'manual_report', header: 'Manual report' },
];

export function CorrectedDates() {
  const [rows, setRows] = useState<VisitDateCorrection[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [state, setState] = useState('');

  useEffect(() => {
    if (!supabaseConfigured()) return;
    let alive = true;
    setBusy(true); setErr(null);
    listVisitDateCorrections()
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => { if (alive) setErr(loadFailure(e, { tables: ['visit_date_corrections'], hint: 'This report is not on the project yet -- migration 0489 (supabase/apply/reports.sql).' })); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, []);

  const facets = useMemo(() => {
    const kept = rows.filter((r) => r.still_as_set).length;
    return [{ key: AS_SET, count: kept }, { key: CHANGED, count: rows.length - kept }].filter((f) => f.count);
  }, [rows]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!state || (state === AS_SET ? r.still_as_set : !r.still_as_set))
      && (!s || `${r.ucn} ${r.engineer ?? ''} ${r.corrected_by_name ?? ''} ${r.report_uid}`.toLowerCase().includes(s)));
  }, [rows, q, state]);

  const download = (kind: 'xlsx' | 'csv') => {
    if (!visible.length) return;
    const name = `corrected-visit-dates-${todayLocal()}`;
    const shaped = visible.map((r) => ({ ...r, state: r.still_as_set ? AS_SET : CHANGED })) as unknown as Record<string, unknown>[];
    const scope = [state ? `now: ${state}` : '', q.trim() ? `search: ${q.trim()}` : ''].filter(Boolean).join(' · ') || 'every correction';
    if (kind === 'csv') {
      csvExport(`${name}.csv`, EXPORT, shaped.map((r) => Object.fromEntries(EXPORT.map((c) => [c.key, xlsxText(r[c.key])]))), COMPLETE);
    } else {
      xlsxDownload(`${name}.xlsx`, [
        { name: 'Corrected Visit Dates', columns: EXPORT.map((c) => c.header),
          rows: shaped.map((r) => Object.fromEntries(EXPORT.map((c) => [c.header, xlsxCell(r[c.key])]))) },
        { name: 'About', columns: ['Item', 'Value'], rows: [
          { Item: 'Report', Value: 'Visit Date Check -- Corrected dates' },
          { Item: 'One row is', Value: 'One change of a visit’s Visit Date made through Visit Date Check, from a Daily cut-out or a Haiku Read.' },
          { Item: 'Visit Date before', Value: 'What the visit carried when it was corrected.' },
          { Item: 'Visit Date now', Value: 'What the visit carries today. "Changed again since" means it no longer matches the correction.' },
          { Item: 'Scope of this file', Value: scope },
          { Item: 'Rows', Value: String(visible.length) },
          { Item: 'Taken', Value: fmtLongDate(new Date().toISOString()) },
        ] },
      ], COMPLETE);
    }
    logAudit({ action: 'report.corrected_visit_dates', meta: { rows: visible.length, scope, kind } });
  };

  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>
        Every Visit Date changed through Visit Date Check — from a Daily cut-out or a Haiku Read — with <b>when</b>,
        <b> who</b>, <b>what it was</b>, what it was set to, and <b>what it is now</b>.
      </p>
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="UCN, engineer, who corrected it, visit UID" />
        <button className="btn btn-ghost btn-sm" onClick={() => download('xlsx')} disabled={!visible.length}>⭳ Excel</button>
        <button className="btn btn-ghost btn-sm" onClick={() => download('csv')} disabled={!visible.length}>⭳ CSV</button>
      </Toolbar>
      {/* Every correction is loaded, so the counts are exact. */}
      <FacetChips options={facets} value={state} onChange={setState} more={false} />
      {busy ? <div className="muted" style={{ padding: 12 }}>Loading…</div>
        : !visible.length ? (
          <div className="sheet-banner sheet-banner-ok"><span>{rows.length ? 'Nothing matches.' : 'No Visit Date has been corrected through Visit Date Check yet.'}</span></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="assoc-table" style={{ minWidth: 900 }}>
              <thead><tr><th>Corrected on</th><th>By</th><th>From</th><th>UCN</th><th>Engineer</th><th>Was</th><th>Set to</th><th>Now</th><th>Report</th></tr></thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={`${r.source}-${r.source_id}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.corrected_at ? formatDayTime(r.corrected_at) : '—'}</td>
                    <td>{r.corrected_by_name ?? '—'}</td>
                    <td>{r.source}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><Ucn ucn={r.ucn} /></td>
                    <td>{r.engineer ?? ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.was_visit_at ? formatDay(r.was_visit_at) : 'none'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><b>{r.set_to_visit_at ? formatDay(r.set_to_visit_at) : '—'}</b></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.now_visit_at ? formatDay(r.now_visit_at) : 'none'}
                      {!r.still_as_set && <div style={{ fontSize: 11, fontWeight: 700 }}>changed again since</div>}</td>
                    <td>{safeUrl(r.manual_report ?? '') ? <a href={safeUrl(r.manual_report ?? '')} target="_blank" rel="noreferrer">Open</a> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
