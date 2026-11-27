import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, SectionCard, Toolbar, SearchBox } from '../components/ui/ui';
import { SelectPicker } from '../components/ui/SelectPicker';
import { useAuth } from '../lib/auth';
import { csvExport, fmtLongDate } from '../lib/format';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { logAudit } from '../lib/audit';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import { useUserNames, nameForUserId } from '../lib/userNames';
import { loadFailure } from '../lib/dberror';
import { cappedAt } from '../lib/exportscope';
import { UPLOADS } from '../lib/uploads';
import { Register } from './BulkUploads';
import {
  supabaseConfigured, countTable, callHistorySummary, listCallHistory, allCallHistory,
  type CallHistoryGroup, type CallHistoryFilter,
} from '../lib/supabase';
import './fieldcalls.css';

// ===========================================================================
// CALL HISTORY -- the calls before RITHI (up to 2025), what was loaded and the
// calls themselves, with the upload on the same page (the user, 2026-11-27:
// "Can U add a UI for me (Admin) to see these Uploads and Provision the Upload
// also there itself?"; asked, chose: a summary by year and a browsable list,
// next to Machine History, administrators to begin with).
//
// THE SUMMARY IS COUNTED BY THE DATABASE (call_history_summary, 0495), so its
// numbers are exact however many calls there are -- no "+". The list loads in
// pages, and its total is the database's EXACT count under the same filter, so
// "Load more" and the count do not disagree.
//
// HISTORY ONLY. Nothing here creates a call, a visit or a review; the upload is
// the same one Bulk Uploads carries (one Register, one table), and it still
// needs bulk.upload -- the page key opens the page and writes nothing.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };
const PAGE = 500;
const day = (v: unknown) => (v ? formatDay(v) : '');
const NOT_RECORDED = '(not recorded)';
const def = UPLOADS.find((d) => d.key === 'call_history');

const COLUMNS: Column<Row>[] = [
  { key: 'ucn', header: 'UC No.', width: 130, wrap: false },
  { key: 'call_no', header: 'Call No.', width: 120, wrap: false },
  { key: 'call_at', header: 'Call date', width: 110, render: (r) => day(r.call_at) },
  { key: 'register', header: 'Call Type', width: 100 },
  { key: 'party_name', header: 'Party', width: 220 },
  { key: 'item_name', header: 'Product', width: 150 },
  { key: 'serial', header: 'Serial', width: 110, wrap: false },
  { key: 'engineer', header: 'Engineer', width: 140 },
  { key: 'call_status', header: 'Call status (as in the file)', width: 170 },
  { key: 'solved_at', header: 'Solved', width: 110, render: (r) => day(r.solved_at) },
  { key: 'source', header: 'Source', width: 110 },
  { key: 'record_year', header: 'Year', width: 70 },
  { key: 'duplicate', header: 'Duplicate', width: 90, render: (r) => (r.duplicate ? 'Duplicate' : '') },
];

const EXPORT: { key: string; header: string }[] = [
  { key: 'ucn', header: 'UC No.' }, { key: 'call_no', header: 'Call No.' },
  { key: 'call_at', header: 'Call Date & Time' }, { key: 'register', header: 'Call Type (register)' },
  { key: 'call_type', header: 'Call Type (as in the file)' }, { key: 'party_name', header: 'Party' },
  { key: 'state', header: 'State' }, { key: 'city', header: 'City' }, { key: 'engineer', header: 'Engineer' },
  { key: 'item_code', header: 'Item Code' }, { key: 'item_name', header: 'Item Name' }, { key: 'serial', header: 'Serial' },
  { key: 'standard_complaint', header: 'Standard Complaint' }, { key: 'complaint_reported', header: 'Complaint Reported' },
  { key: 'item_status', header: 'Item Status' }, { key: 'contract_type', header: 'Contract Type' },
  { key: 'call_status', header: 'Call Status' }, { key: 'solved_at', header: 'Call Solved Date & Time' },
  { key: 'source', header: 'Source' }, { key: 'record_year', header: 'Year' }, { key: 'duplicate', header: 'Duplicate' },
  { key: 'loaded_at', header: 'Loaded At' },
];

const groupKey = (g: { record_year: number | null; source: string; register: string }) => `${g.record_year ?? ''}|${g.source}|${g.register}`;

export function CallHistory() {
  const { can } = useAuth();
  const mayUpload = can('bulk.upload');
  const mayExport = can('export.data');
  const names = useUserNames();

  // ---- the summary ---------------------------------------------------------
  const [groups, setGroups] = useState<CallHistoryGroup[]>([]);
  const [sumErr, setSumErr] = useState<string | null>(null);
  const [sumBusy, setSumBusy] = useState(false);
  const [held, setHeld] = useState<number | null>(null);
  const loadSummary = async () => {
    if (!supabaseConfigured()) return;
    setSumBusy(true); setSumErr(null);
    try {
      setGroups(await callHistorySummary());
    } catch (e) {
      setSumErr(loadFailure(e, {
        tables: ['call_history_summary'],
        hint: 'The summary is not on the project yet — it arrives with migration 0495 (supabase/apply/daily_review.sql). The list and the upload below work without it.',
      }));
    } finally { setSumBusy(false); }
    countTable('call_history').then(setHeld).catch(() => setHeld(null));
  };

  // ---- the list ------------------------------------------------------------
  const [year, setYear] = useState('');
  const [source, setSource] = useState('');
  const [register, setRegister] = useState('');
  const [dupOnly, setDupOnly] = useState(false);
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  useEffect(() => { const t = setTimeout(() => setQLive(q), 350); return () => clearTimeout(t); }, [q]);
  const filter: CallHistoryFilter = useMemo(() => ({
    year: year ? Number(year) : null, source, register, duplicate: dupOnly, q: qLive,
  }), [year, source, register, dupOnly, qLive]);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);
  const load = async (append: boolean) => {
    if (!supabaseConfigured()) return;
    const mine = ++seq.current;
    const from = append ? rows.length : 0;
    if (append) setMore(true); else setBusy(true);
    setErr(null);
    try {
      const got = await listCallHistory(filter, from, from + PAGE - 1);
      if (mine !== seq.current) return; // a newer filter has been asked for
      const page = got.rows.map((r) => ({ ...r, id: String(r.id) } as Row));
      setRows((prev) => (append ? [...prev, ...page] : page));
      setTotal(got.total);
    } catch (e) {
      if (mine !== seq.current) return;
      setErr(loadFailure(e, { tables: ['call_history'], hint: 'Call History is not on the project yet — it arrives with migration 0429 (supabase/apply/daily_review.sql).' }));
    } finally { if (mine === seq.current) { setBusy(false); setMore(false); } }
  };
  useEffect(() => { void loadSummary(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(false); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const moreAvailable = total != null && rows.length < total;
  const years = useMemo(() => [...new Set(groups.map((g) => g.record_year).filter((y): y is number => y != null))]
    .sort((a, b) => b - a).map(String), [groups]);
  const sources = useMemo(() => [...new Set(groups.map((g) => g.source))].sort(), [groups]);
  const registers = useMemo(() => [...new Set(['Field', 'Installation', 'PM', ...groups.map((g) => g.register)])], [groups]);
  const totals = useMemo(() => groups.reduce((t, g) => ({
    calls: t.calls + g.calls, duplicates: t.duplicates + g.duplicates, without_serial: t.without_serial + g.without_serial,
  }), { calls: 0, duplicates: 0, without_serial: 0 }), [groups]);
  const picked = (g: CallHistoryGroup) => String(g.record_year ?? '') === year && g.source === source && g.register === register;
  const pick = (g: CallHistoryGroup) => {
    if (picked(g)) { setYear(''); setSource(''); setRegister(''); return; }
    setYear(g.record_year == null ? '' : String(g.record_year)); setSource(g.source); setRegister(g.register);
  };
  const clearFilters = () => { setYear(''); setSource(''); setRegister(''); setDupOnly(false); setQ(''); };
  const filtered = !!(year || source || register || dupOnly || qLive.trim());

  const scopeText = [year && `year ${year}`, source && `source ${source}`, register && `call type ${register}`,
    dupOnly && 'duplicates only', qLive.trim() && `search: ${qLive.trim()}`].filter(Boolean).join(' · ') || 'every history call';

  const [dl, setDl] = useState(false);
  const download = async (kind: 'xlsx' | 'csv') => {
    if (!mayExport) return;
    setDl(true);
    try {
      const cap = 100000;
      const all = await allCallHistory(filter, cap);
      if (!all.length) return;
      const name = `call-history-${todayLocal()}`;
      const shaped = (r: Record<string, unknown>): Record<string, unknown> => ({ ...r, duplicate: r.duplicate ? 'Duplicate' : '' });
      if (kind === 'csv') {
        csvExport(`${name}.csv`, EXPORT, all.map((r) => {
          const s = shaped(r);
          return Object.fromEntries(EXPORT.map((c) => [c.key,
            c.key === 'call_at' || c.key === 'solved_at' || c.key === 'loaded_at' ? (s[c.key] ? formatDayTime(s[c.key]) : '') : xlsxText(s[c.key])]));
        }), cappedAt(all.length, cap));
      } else {
        xlsxDownload(`${name}.xlsx`, [
          { name: 'Call History', columns: EXPORT.map((c) => c.header),
            rows: all.map((r) => { const s = shaped(r); return Object.fromEntries(EXPORT.map((c) => [c.header, xlsxCell(s[c.key])])); }) },
          { name: 'About', columns: ['Item', 'Value'], rows: [
            { Item: 'Report', Value: 'Call History — calls before RITHI (up to 2025)' },
            { Item: 'What it is', Value: 'History only: the call status and solved date are the file’s own, as written. Nothing in RITHI was created from these calls.' },
            { Item: 'Scope of this file', Value: scopeText },
            { Item: 'Rows', Value: String(all.length) },
            { Item: 'Taken', Value: fmtLongDate(new Date().toISOString()) },
          ] },
        ], cappedAt(all.length, cap));
      }
      logAudit({ action: 'report.call_history', meta: { rows: all.length, scope: scopeText, kind } });
    } catch (e) {
      setErr(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setDl(false); }
  };

  if (!supabaseConfigured()) return <div style={{ padding: 24 }} className="muted">Connect the database in Settings first.</div>;

  return (
    <div>
      <PageHeader
        title="Call History" icon="📜"
        subtitle="The calls before RITHI (up to 2025): what has been loaded, by year, source and call type, and the calls themselves. History only — nothing in RITHI is created from them. Each machine's history is on Machine History."
        count={total ?? undefined} countMore={false} moreAvailable={moreAvailable}
        onLoadMore={() => load(true)} loadingMore={more}
        onRefresh={() => { void loadSummary(); void load(false); }} refreshing={busy || sumBusy} />

      <SectionCard title="Upload a file">
        {!def && <div className="sheet-banner sheet-banner-error"><span>The Call History upload is missing from this build.</span></div>}
        {def && mayUpload && (
          <Register def={def} count={held} onDone={() => { void loadSummary(); void load(false); }} />
        )}
        {def && !mayUpload && (
          <p className="muted" style={{ margin: 0 }}>Uploading needs “Load registers in bulk” on Roles &amp; Permissions. You can still read what has been loaded.</p>
        )}
      </SectionCard>
      <div style={{ height: 12 }} />

      <SectionCard title="What has been loaded">
        {sumErr && <div className="sheet-banner sheet-banner-error"><span>{sumErr}</span></div>}
        {!sumErr && !sumBusy && groups.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>No history calls have been loaded yet.</p>
        )}
        {groups.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="assoc-table">
              <thead>
                <tr>
                  <th>Year</th><th>Source</th><th>Call Type</th>
                  <th style={{ textAlign: 'right' }}>Calls</th>
                  <th style={{ textAlign: 'right' }} title="The same UC No. + Call No. also came from another source or year; the latest year's record is shown">Duplicates</th>
                  <th style={{ textAlign: 'right' }} title="Stored, but Machine History finds a history call by its serial and cannot list these">No serial</th>
                  <th>First call</th><th>Last call</th><th>Last loaded</th><th>By</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={groupKey(g)} onClick={() => pick(g)} style={{ cursor: 'pointer', ...(picked(g) ? { background: 'var(--text)', color: 'var(--surface)' } : {}) }}
                    title="Show these calls in the list below (click again to clear)">
                    <td>{g.record_year ?? NOT_RECORDED}</td><td>{g.source}</td><td>{g.register}</td>
                    <td style={{ textAlign: 'right' }}>{g.calls.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{g.duplicates ? g.duplicates.toLocaleString() : ''}</td>
                    <td style={{ textAlign: 'right' }}>{g.without_serial ? g.without_serial.toLocaleString() : ''}</td>
                    <td>{day(g.first_call_at)}</td><td>{day(g.last_call_at)}</td>
                    <td>{g.last_loaded_at ? formatDayTime(g.last_loaded_at) : ''}</td>
                    <td>{g.last_loaded_by ? nameForUserId(g.last_loaded_by, names) : ''}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 600 }}>
                  <td colSpan={3}>All</td>
                  <td style={{ textAlign: 'right' }}>{totals.calls.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{totals.duplicates.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{totals.without_serial.toLocaleString()}</td>
                  <td colSpan={4} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Counted by the database, so every number is exact. A call that came from two sources or years is counted once,
          under the year it is shown with. <b>No serial</b>: stored, but not listed on Machine History, which finds a history
          call by its serial. Click a row to list those calls below.
        </p>
      </SectionCard>
      <div style={{ height: 12 }} />

      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="UC No., Call No., party, product or serial" />
        <SelectPicker value={year} onChange={setYear} placeholder="Any year" options={years} />
        <SelectPicker value={source} onChange={setSource} placeholder="Any source" options={sources} />
        <SelectPicker value={register} onChange={setRegister} placeholder="Any call type" options={registers} />
        <label className="row" style={{ gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={dupOnly} onChange={(e) => setDupOnly(e.target.checked)} /> Duplicates only
        </label>
        {filtered && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>}
      </Toolbar>

      <DataTable<Row>
        columns={COLUMNS} rows={rows} getRowId={(r) => r.id}
        storageKey="call-history"
        toolbar={(
          <>
            {mayExport && <button className="btn btn-ghost btn-sm" disabled={dl || !rows.length} onClick={() => void download('xlsx')}>⭳ Excel</button>}
            {mayExport && <button className="btn btn-ghost btn-sm" disabled={dl || !rows.length} onClick={() => void download('csv')}>⭳ CSV</button>}
            <div className="spacer" />
            <span className="muted">
              {rows.length.toLocaleString()} shown{total != null ? ` of ${total.toLocaleString()}` : ''}
            </span>
            {moreAvailable && <button className="btn btn-sm" disabled={more} onClick={() => void load(true)}>{more ? 'Loading…' : 'Load more'}</button>}
          </>
        )}
        emptyText={busy ? 'Loading…' : filtered ? 'No history call matches.' : 'No history calls have been loaded yet.'}
      />
    </div>
  );
}

export default CallHistory;
