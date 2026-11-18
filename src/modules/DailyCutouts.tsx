import { useEffect, useMemo, useState } from 'react';
import { Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { csvExport, fmtLongDate } from '../lib/format';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { logAudit } from '../lib/audit';
import { formatDay, formatDayTime, todayLocal, localIsoDate } from '../lib/dates';
import { listReportCrops, lastReportCropAt, dailyCropsRun, reviewVisitCrop, supabaseConfigured, type ReportCrop, type CropRun } from '../lib/supabase';
import { useAuth } from '../lib/auth';
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
// The chip for what is still waiting for a person (0488).
const TO_CHECK = 'To check';

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
  { key: 'review_words', header: 'Decision' },
  { key: 'new_visit_at', header: 'Visit Date after the decision' },
  { key: 'manual_report', header: 'Manual report' },
  { key: 'report_uid', header: 'Visit UID' },
];

export function DailyCutouts() {
  const { can } = useAuth();
  // RUN IT FOR A CHOSEN DAY (the user, 2026-11-18): starts the GitHub job for
  // the visits entered on the day picked, through run-daily-crops; visits
  // already cropped are skipped by the job, so a re-run only adds what is
  // missing. Same key as sending reports to be read.
  const mayRun = can('visitdate.check');
  // CORRECT THE VISIT FROM A CUT-OUT (0488; the user, 2026-11-18: "And how to
  // update the actual entry? Visit Entry??? I dont see any edit Provision."):
  // "RITHI is right", or change the visit's Visit Date to the date on the
  // report -- the day only. Same key as on Haiku Read: visitdate.fix.
  const mayFix = can('visitdate.fix');
  const [fixDate, setFixDate] = useState<Record<number, string>>({});
  const [deciding, setDeciding] = useState<number | null>(null);
  const decide = async (r: ReportCrop, date: string | null) => {
    const ask = date
      ? `Change the Visit Date of ${r.ucn} from ${r.visit_at ? formatDay(r.visit_at) : '(none)'} to ${formatDay(date)}?\n\nOnly the day changes: the time of the visit and its Visit Entry Date stay. This cannot be undone here.`
      : `Mark ${r.ucn} as checked: the Visit Date in RITHI (${r.visit_at ? formatDay(r.visit_at) : 'none'}) matches the report?`;
    if (!window.confirm(ask)) return;
    setDeciding(r.id); setErr(null);
    try { await reviewVisitCrop(r.id, date); setTick((t) => t + 1); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setDeciding(null); }
  };
  const [runs, setRuns] = useState<CropRun[]>([]);
  const [runMsg, setRunMsg] = useState('');
  const [starting, setStarting] = useState(false);
  const [tick, setTick] = useState(0);
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
  }, [day, tick]);

  // The runs GitHub reports; while one is queued or running, look again every
  // 30 seconds and reload the day when it ends.
  const active = runs.some((r) => r.status !== 'completed');
  useEffect(() => {
    if (!mayRun || !supabaseConfigured()) return;
    let alive = true;
    const look = () => dailyCropsRun('status')
      .then((r) => { if (!alive) return; setRuns((prev) => {
        const next = r.runs ?? [];
        if (prev.some((p) => p.status !== 'completed') && next.every((n) => n.status === 'completed')) setTick((t) => t + 1);
        return next;
      }); })
      .catch((e) => { if (alive) setRunMsg(e instanceof Error ? e.message : String(e)); });
    void look();
    const t = active ? setInterval(look, 30000) : undefined;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [mayRun, active]);

  const runDay = async () => {
    if (!window.confirm(`Crop the manual reports of the visits entered on ${formatDay(day)} now?\n\nVisits already cropped are skipped. The reports are opened on GitHub's runner; only the cut-outs are kept.`)) return;
    setStarting(true); setRunMsg('');
    try {
      await dailyCropsRun('run', day);
      setRunMsg(`Started for ${formatDay(day)}. It appears below in a few seconds; this page reloads the day when it finishes.`);
      logAudit({ action: 'report.daily_cutouts.run', meta: { day } });
      setTimeout(() => { void dailyCropsRun('status').then((r) => setRuns(r.runs ?? [])).catch(() => undefined); }, 5000);
    } catch (e) {
      setRunMsg(e instanceof Error ? e.message : String(e));
    } finally { setStarting(false); }
  };
  const runWords = (r: CropRun) => r.status === 'completed'
    ? (r.conclusion === 'success' ? 'finished' : `ended: ${r.conclusion ?? 'unknown'}`)
    : r.status === 'queued' ? 'waiting to start' : 'running';

  const facets = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(STATUS_WORDS[r.status], (m.get(STATUS_WORDS[r.status]) ?? 0) + 1));
    const toCheck = rows.filter((r) => r.status === 'found' && !r.review).length;
    const out = [...m.entries()].map(([key, count]) => ({ key, count }));
    return toCheck ? [{ key: TO_CHECK, count: toCheck }, ...out] : out;
  }, [rows]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!status || (status === TO_CHECK ? r.status === 'found' && !r.review : STATUS_WORDS[r.status] === status))
      && (!s || `${r.ucn} ${r.engineer} ${r.report_uid}`.toLowerCase().includes(s)));
  }, [rows, q, status]);

  const download = (kind: 'xlsx' | 'csv') => {
    if (!visible.length) return;
    const name = `daily-cutouts-${day}`;
    const shaped = visible.map((r) => ({ ...r, status_words: STATUS_WORDS[r.status],
      review_words: r.review === 'corrected' ? 'Changed' : r.review === 'confirmed' ? 'RITHI is right' : r.status === 'found' ? 'To check' : '' })) as unknown as Record<string, unknown>[];
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
        {mayRun && (
          <button className="btn btn-primary btn-sm" disabled={starting || !day} onClick={() => void runDay()}
            title="Crop the manual reports of the visits entered on this day now (those already cropped are skipped)">
            {starting ? 'Starting…' : '▶ Crop this day now'}
          </button>
        )}
      </div>
      {mayRun && (runMsg || runs.length > 0) && (
        <div className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
          {runMsg && <div>{runMsg}</div>}
          {runs.slice(0, 3).map((r) => (
            <div key={r.id}>
              {r.title.replace('Daily cut-outs ', '') === 'scheduled' ? 'Scheduled run' : `Run for ${r.title.replace('Daily cut-outs ', '')}`}
              {' · '}{formatDayTime(r.created_at)} · <b>{runWords(r)}</b>
              {safeUrl(r.url) && <> · <a href={safeUrl(r.url)} target="_blank" rel="noreferrer">details</a></>}
            </div>
          ))}
        </div>
      )}
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
              <thead><tr><th>#</th><th>UCN</th><th>Engineer</th><th>Visit Date in RITHI</th><th>Cut-out from the report</th><th>Decision</th><th>How</th><th>Report</th></tr></thead>
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
                    <td style={{ minWidth: 190 }}>{r.review === 'corrected'
                      ? <span style={{ fontSize: 12.5 }}><b>Changed to {formatDay(r.new_visit_at)}</b><div className="muted" style={{ fontSize: 11 }}>was {r.old_visit_at ? formatDay(r.old_visit_at) : 'none'} · {r.reviewed_at ? formatDayTime(r.reviewed_at) : ''}</div></span>
                      : r.review === 'confirmed'
                        ? <span style={{ fontSize: 12.5 }}><b>✓ RITHI is right</b><div className="muted" style={{ fontSize: 11 }}>{r.reviewed_at ? formatDayTime(r.reviewed_at) : ''}</div></span>
                        : !mayFix || r.status !== 'found' ? <span className="muted">—</span>
                          : (() => {
                            const cur = localIsoDate(r.visit_at ?? '') ?? '';
                            const pick = fixDate[r.id] ?? cur;
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <button className="btn btn-sm" disabled={deciding === r.id} onClick={() => void decide(r, null)}>✓ RITHI is right</button>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <input className="input" type="date" style={{ width: 140 }} value={pick} max={todayLocal()}
                                    onChange={(e) => setFixDate((m) => ({ ...m, [r.id]: e.target.value }))} />
                                  <button className="btn btn-primary btn-sm" disabled={deciding === r.id || !pick || pick === cur}
                                    title="Set the visit's Visit Date to this day (the time of the visit and the Visit Entry Date stay)"
                                    onClick={() => void decide(r, pick)}>Change</button>
                                </div>
                              </div>
                            );
                          })()}</td>
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
