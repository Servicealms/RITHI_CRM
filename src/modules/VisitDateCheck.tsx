import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, Toolbar, SearchBox, FacetChips } from '../components/ui/ui';
import { csvExport, fmtLongDate } from '../lib/format';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { logAudit } from '../lib/audit';
import { formatDay, formatDayTime, todayLocal, localIsoDate } from '../lib/dates';
import {
  listVisitDateChecks, resolveVisitDateRead, uncheckedManualReports, supabaseConfigured,
  type VisitDateReading,
} from '../lib/supabase';
import { loadFailure } from '../lib/dberror';
import { useAuth } from '../lib/auth';
import { Ucn } from '../lib/callstate';
import { COMPLETE } from '../lib/exportscope';
import { safeUrl } from '../lib/safeUrl';
import { checkOneVisit, modelWords, OUTCOME_WORDS } from '../lib/visitDateRun';
import { DailyCutouts } from './DailyCutouts';

// ===========================================================================
// VISIT DATE CHECK -- Reports (the user, 2026-11-17: "have a Mechanism to
// store the REsults back in Supabase DB and Add it as a Report under Reports.
// And Also add a Provision for Admin [I will change this later via Roles and
// Permission] to update the Visit Date in the Actual Visit Record.")
//
// Every visit whose manual report has been read: the Service Visit Date a
// model read on the report beside the Visit Date in RITHI. "Check the next N"
// reads visits NOT YET CHECKED (one reading per visit -- "The Same records
// need not be re-run"): the report is opened and cropped ON THIS DEVICE, and
// only the cut-out is sent (Haiku; Sonnet only when Haiku fails).
//
// Where the two differ, a holder of visitdate.fix decides: USE the date read
// (the visit's day moves; its time of day and its Visit Entry Date do not),
// or KEEP RITHI's. Once per reading, recorded with who and when.
//
// THREE KEYS, granted to no role yet: mod:/visit-date-check (this screen),
// visitdate.check (send reports to be read), visitdate.fix (apply / keep).
// An administrator holds all three already; the user grants others on Roles &
// Permissions when it is working (2026-11-17: "i will need to give access to
// Additional roles later, once this is working fine").
// ===========================================================================

type Row = VisitDateReading & { key: string };

const day = (v: unknown) => (v ? formatDay(v) : '');
const OUTCOME_COLOUR: Record<VisitDateReading['outcome'], string> = {
  match: '#1a7f37', mismatch: '#b42318', unreadable: '#9a6700', no_box: '#57606a',
};

const EXPORT: { key: string; header: string }[] = [
  { key: 'checked_at', header: 'Checked at' },
  { key: 'ucn', header: 'UCN' },
  { key: 'engineer', header: 'Engineer' },
  { key: 'recorded_visit_at', header: 'Visit Date in RITHI when checked' },
  { key: 'current_visit_at', header: 'Visit Date in RITHI now' },
  { key: 'read_date', header: 'Date read on the report' },
  { key: 'read_as_written', header: 'As written' },
  { key: 'outcome_words', header: 'Outcome' },
  { key: 'notes', header: 'Reader notes' },
  { key: 'model_words', header: 'Read by' },
  { key: 'cost_usd', header: 'Cost (US$)' },
  { key: 'resolution_words', header: 'Decision' },
  { key: 'resolved_by_name', header: 'Decided by' },
  { key: 'resolved_at', header: 'Decided at' },
  { key: 'report_uid', header: 'Visit UID' },
  { key: 'manual_report', header: 'Manual report' },
];

export function VisitDateCheck() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [outcome, setOutcome] = useState('');
  const [count, setCount] = useState('20');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [deciding, setDeciding] = useState<number | null>(null);
  const stop = useRef(false);
  const mayRun = can('visitdate.check');
  const mayFix = can('visitdate.fix');
  // Two views (0487): the model's readings, and the daily cut-outs for a
  // person to compare by eye.
  const [view, setView] = useState<'readings' | 'daily'>('readings');

  const load = async () => {
    if (!supabaseConfigured()) return;
    setBusy(true); setErr(null);
    try {
      const r = await listVisitDateChecks();
      setRows(r.map((x) => ({ ...x, key: String(x.id) })));
    } catch (e) {
      setErr(loadFailure(e, {
        tables: ['visit_date_check', 'visit_date_reads'],
        functions: ['resolve_visit_date_read'],
        hint: 'This report is not on the project yet -- migration 0486 (supabase/apply/reports.sql).',
      }));
    } finally { setBusy(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const run = async () => {
    const n = Math.max(1, Math.min(200, Math.floor(Number(count) || 20)));
    setRunning(true); stop.current = false; setErr(null);
    const tally = { read: 0, differ: 0, noBox: 0, notOpened: 0, failed: 0 };
    const say = (i: number, total: number) => setProgress(
      `${i} of ${total} · read ${tally.read}${tally.differ ? ` (${tally.differ} differ)` : ''}`
      + `${tally.noBox ? ` · no box ${tally.noBox}` : ''}${tally.notOpened ? ` · could not open ${tally.notOpened}` : ''}`
      + `${tally.failed ? ` · failed ${tally.failed}` : ''}`);
    try {
      setProgress('Finding visits not yet checked…');
      const todo = await uncheckedManualReports(n);
      if (!todo.length) { setProgress('Every visit with a manual report has been checked.'); return; }
      for (let i = 0; i < todo.length; i++) {
        if (stop.current) break;
        say(i, todo.length);
        const r = await checkOneVisit(todo[i]);
        if (r.status === 'read') { tally.read++; if (r.reading?.outcome === 'mismatch') tally.differ++; }
        else if (r.status === 'no box') tally.noBox++;
        else if (r.status === 'not opened') tally.notOpened++;
        else if (r.status === 'failed') { tally.failed++; if (tally.failed === 1) setErr(`Reading failed: ${r.note}`); }
      }
      say(todo.length, todo.length);
      logAudit({ action: 'report.visit_date_check.run', meta: { asked: n, ...tally } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      void load();
    }
  };

  const decide = async (r: Row, apply: boolean) => {
    const what = apply
      ? `Change the Visit Date of ${r.ucn} from ${day(r.current_visit_at) || '(none)'} to ${day(r.read_date)}, the date read on the report?\n\nThe time of the visit and its Visit Entry Date are not changed. This cannot be undone here.`
      : `Keep ${r.ucn}'s Visit Date as ${day(r.current_visit_at) || '(none)'} in RITHI, and mark this reading as decided?`;
    if (!window.confirm(what)) return;
    setDeciding(r.id); setErr(null);
    try {
      await resolveVisitDateRead(r.id, apply);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setDeciding(null); }
  };

  const columns: Column<Row>[] = [
    { key: 'checked_at', header: 'Checked', width: 150, render: (r) => formatDayTime(r.checked_at) },
    { key: 'ucn', header: 'UCN', width: 130, wrap: false, render: (r) => <Ucn ucn={r.ucn} /> },
    { key: 'engineer', header: 'Engineer', width: 140 },
    { key: 'current_visit_at', header: 'Visit Date in RITHI', width: 150,
      render: (r) => (
        <span>{day(r.current_visit_at) || <i className="muted">none</i>}
          {r.recorded_visit_at && localIsoDate(r.recorded_visit_at) !== localIsoDate(r.current_visit_at ?? '')
            && <span className="muted" style={{ fontSize: 11 }}> (was {day(r.recorded_visit_at)})</span>}
        </span>) },
    { key: 'read_date', header: 'Date on the report', width: 170,
      render: (r) => (r.outcome === 'no_box' ? <span className="muted">—</span> : (
        <span>{r.read_date ? <b>{day(r.read_date)}</b> : <i className="muted">unreadable</i>}
          {r.read_as_written && <span className="muted" style={{ fontSize: 11 }}> · written “{r.read_as_written}”</span>}
        </span>)) },
    { key: 'outcome', header: 'Outcome', width: 120,
      render: (r) => <b style={{ color: OUTCOME_COLOUR[r.outcome] }}>{OUTCOME_WORDS[r.outcome]}</b> },
    { key: 'notes', header: 'Notes', width: 220, render: (r) => <span className="muted" style={{ fontSize: 12 }}>{r.notes}</span> },
    { key: 'model', header: 'Read by', width: 150, render: (r) => (r.outcome === 'no_box' ? '' : modelWords(r)) },
    { key: 'cost_usd', header: 'Cost', width: 80, render: (r) => (Number(r.cost_usd) ? `$${Number(r.cost_usd).toFixed(4)}` : '') },
    { key: 'manual_report', header: 'Report', width: 80,
      render: (r) => (safeUrl(r.manual_report) ? <a href={safeUrl(r.manual_report)} target="_blank" rel="noreferrer">Open</a> : '') },
    { key: 'resolution', header: 'Decision', width: 230,
      render: (r) => {
        if (r.resolution) {
          return (
            <span style={{ fontSize: 12.5 }}>
              <b>{r.resolution === 'applied' ? `Changed to ${day(r.new_visit_at)}` : 'Kept as in RITHI'}</b>
              <span className="muted"> · {r.resolved_by_name ?? ''} {r.resolved_at ? formatDayTime(r.resolved_at) : ''}</span>
            </span>);
        }
        if (r.outcome !== 'mismatch') return <span className="muted">—</span>;
        if (!mayFix) return <span className="muted">To decide</span>;
        return (
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" disabled={deciding === r.id || !r.read_date} onClick={() => void decide(r, true)}>
              Use {day(r.read_date)}
            </button>
            <button className="btn btn-sm" disabled={deciding === r.id} onClick={() => void decide(r, false)}>Keep RITHI's</button>
          </span>);
      } },
  ];

  // The chips show their key, so the keys are the words.
  const TO_DECIDE = 'Differs — to decide';
  const facets = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.outcome, (m.get(r.outcome) ?? 0) + 1));
    const toDecide = rows.filter((r) => r.outcome === 'mismatch' && !r.resolution).length;
    const list = (['mismatch', 'match', 'unreadable', 'no_box'] as const)
      .filter((k) => m.get(k)).map((k) => ({ key: OUTCOME_WORDS[k], count: m.get(k) ?? 0 }));
    return toDecide ? [{ key: TO_DECIDE, count: toDecide }, ...list] : list;
  }, [rows]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (outcome === TO_DECIDE) { if (!(r.outcome === 'mismatch' && !r.resolution)) return false; }
      else if (outcome && OUTCOME_WORDS[r.outcome] !== outcome) return false;
      if (!s) return true;
      return `${r.ucn} ${r.engineer ?? ''} ${r.read_as_written ?? ''} ${r.report_uid}`.toLowerCase().includes(s);
    });
  }, [rows, q, outcome]);

  const spent = rows.reduce((t, r) => t + Number(r.cost_usd || 0), 0);

  const download = (kind: 'xlsx' | 'csv') => {
    if (!visible.length) return;
    const name = `visit-date-check-${todayLocal()}`;
    const scope = [outcome ? `outcome: ${outcome}` : '', q.trim() ? `search: ${q.trim()}` : '']
      .filter(Boolean).join(' · ') || 'every row';
    const shaped = visible.map((r) => ({
      ...r,
      outcome_words: OUTCOME_WORDS[r.outcome],
      model_words: r.outcome === 'no_box' ? '' : modelWords(r),
      resolution_words: r.resolution === 'applied' ? `Changed to ${day(r.new_visit_at)}` : r.resolution === 'kept' ? 'Kept as in RITHI'
        : r.outcome === 'mismatch' ? 'To decide' : '',
    })) as unknown as Record<string, unknown>[];
    if (kind === 'csv') {
      csvExport(`${name}.csv`, EXPORT, shaped.map((r) => Object.fromEntries(EXPORT.map((c) => [c.key, xlsxText(r[c.key])]))), COMPLETE);
    } else {
      xlsxDownload(`${name}.xlsx`, [
        { name: 'Visit Date Check',
          columns: EXPORT.map((c) => c.header),
          rows: shaped.map((r) => Object.fromEntries(EXPORT.map((c) => [c.header, xlsxCell(r[c.key])]))) },
        { name: 'About',
          columns: ['Item', 'Value'],
          rows: [
            { Item: 'Report', Value: 'Visit Date Check' },
            { Item: 'One row is', Value: 'One visit whose manual report was read: the Service Visit Date read on the report beside the Visit Date in RITHI.' },
            { Item: 'How it was read', Value: 'The report was cropped on the device to the Call No/UC No + Service Visit Date box and only that cut-out was sent: Claude Haiku first, Claude Sonnet only when Haiku failed (an error, a refusal or no date).' },
            { Item: 'Matches / Differs', Value: 'The date read is / is not the day of the Visit Date in RITHI (India time) when it was checked.' },
            { Item: 'Unreadable', Value: 'Neither model could read a date.' },
            { Item: 'No box found', Value: 'The Service Visit Date box was not found on the report; nothing was sent.' },
            { Item: 'Decision', Value: 'Changed: the visit’s day was moved to the date read (time of day and Visit Entry Date unchanged). Kept: RITHI’s date stands.' },
            { Item: 'Scope of this file', Value: scope },
            { Item: 'Rows', Value: String(visible.length) },
            { Item: 'Taken', Value: fmtLongDate(new Date().toISOString()) },
          ] },
      ], COMPLETE);
    }
    logAudit({ action: 'report.visit_date_check', meta: { rows: visible.length, scope, kind } });
  };

  const tabs = (
    <div className="dccr-tabs" role="tablist" style={{ marginBottom: 8 }}>
      <button role="tab" aria-selected={view === 'readings'} className={`dccr-tab${view === 'readings' ? ' is-on' : ''}`} onClick={() => setView('readings')}>📅 Readings</button>
      <button role="tab" aria-selected={view === 'daily'} className={`dccr-tab${view === 'daily' ? ' is-on' : ''}`} onClick={() => setView('daily')}>🖼️ Daily cut-outs</button>
    </div>
  );
  if (view === 'daily') {
    return (
      <div>
        <PageHeader title="Visit Date Check" icon="📅"
          subtitle="The Service Visit Date box cut out of each manual report every morning, beside the Visit Date in RITHI — compare by eye." />
        {tabs}
        <DailyCutouts />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Visit Date Check" icon="📅"
        subtitle="The Service Visit Date written on each manual report, read by Claude and set beside the Visit Date in RITHI — and corrected where it differs."
        count={visible.length} onRefresh={() => void load()} refreshing={busy} />

      {tabs}

      {mayRun && (
        <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', margin: '4px 0 10px' }}>
          <label className="field" style={{ width: 150 }}><span className="field-label">Visits to check</span>
            <input className="input" inputMode="numeric" value={count} disabled={running}
                   onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} /></label>
          <button className="btn btn-primary" disabled={running} onClick={() => void run()}>
            {running ? 'Checking…' : '▶ Check the next visits not yet checked'}
          </button>
          {running && <button className="btn" onClick={() => { stop.current = true; }}>Stop</button>}
          <span className="muted" style={{ fontSize: 12.5 }}>
            {progress || 'Newest first. A visit already checked is never checked again. Only the cut-out of the date box leaves this device.'}
          </span>
        </div>
      )}

      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}

      {!err && !busy && rows.length === 0 && (
        <div className="sheet-banner sheet-banner-ok"><span>No visit has been checked yet{mayRun ? ' — press Check above to start.' : '.'}</span></div>
      )}

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="UCN, engineer, date as written or visit UID" />
      </Toolbar>

      {/* Every row is loaded (paged to the end), so the counts are exact. */}
      <FacetChips options={facets} value={outcome} onChange={setOutcome} more={false} />

      <DataTable<Row>
        columns={columns} rows={visible} getRowId={(r) => r.key}
        storageKey="visit-date-check"
        toolbar={(
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => download('xlsx')}>⭳ Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={() => download('csv')}>⭳ CSV</button>
            <div className="spacer" />
            <span className="muted">{visible.length} shown · ${spent.toFixed(4)} spent in all</span>
          </>
        )}
        emptyText={busy ? 'Loading…' : 'Nothing to show.'}
      />
    </div>
  );
}

export default VisitDateCheck;
