import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, SectionCard, Toolbar, SearchBox, Drawer } from '../components/ui/ui';
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
import { safeUrl } from '../lib/safeUrl';
import { CALL_HISTORY_FORMAT, formatKey, shapeHistoryRow, driveHref, otherExtra } from '../lib/callHistoryFormat';
import {
  supabaseConfigured, countTable, callHistorySummary, listCallHistory, allCallHistory, callHistoryChoices,
  type CallHistoryGroup, type CallHistoryFilter, type HistoryKind,
} from '../lib/supabase';
import './fieldcalls.css';
import './dccr.css';

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
//
// TWO HISTORIES, TWO TABLES, TWO PAGES (0496; the user, 2026-11-27: "DCCR is
// DCCR History, This is Call History - 2 Separate Database, 2 Separate
// Containers / Schema -- and Same for View as well"). One screen, configured
// twice: Call History reads call_history and carries the Call History upload;
// DCCR History reads dccr_call_history and carries the DCCR Register --
// historical upload. Neither ever reads the other's table.
// ===========================================================================

type Row = Record<string, unknown> & { id: string };
const PAGE = 500;
const day = (v: unknown) => (v ? formatDay(v) : '');
const NOT_RECORDED = '(not recorded)';

interface HistoryConfig {
  title: string; icon: string; subtitle: string; uploadKey: string; summaryMigration: string;
  storageKey: string; fileName: string; sheet: string; report: string; audit: string;
  sources: boolean; duplicates: boolean; summaryNote: string; noSerial: string;
  /** Year tabs and the Field Call register's search row (Call History, 2026-11-28). */
  yearTabs: boolean;
}
const CONFIG: Record<HistoryKind, HistoryConfig> = {
  call: {
    title: 'Call History', icon: '📜', uploadKey: 'call_history', summaryMigration: '0495',
    subtitle: "The calls before RITHI (up to 2025), stored year by year: what has been loaded, and each year's calls on a tab of its own. History only — nothing in RITHI is created from them. Each machine's history is on Machine History. The DCCR register's calls are on DCCR History.",
    // A new key: the old layout's saved columns are not this format's.
    storageKey: 'call-history-format', fileName: 'call-history', sheet: 'Call History',
    report: 'Call History — calls before RITHI (up to 2025)', audit: 'report.call_history',
    sources: true, duplicates: true, yearTabs: true,
    summaryNote: 'Each year is stored on its own: a call in two yearly sheets is counted in each year; two sources of the same year are one call, counted once, and the other is its Duplicate. No serial: stored, but not listed on Machine History, which finds a history call by its serial.',
    noSerial: 'Stored, but Machine History finds a history call by its serial and cannot list these',
  },
  dccr: {
    title: 'DCCR History', icon: '🗂', uploadKey: 'dccr_history', summaryMigration: '0496',
    subtitle: "The old DCCR register's calls (2025 and before), apart from Call History: what has been loaded, by year and call type, and the calls themselves. History only — nothing in RITHI is created from them; each call's review is kept, and the Recent Failure Rate counts its failures.",
    storageKey: 'dccr-history', fileName: 'dccr-history', sheet: 'DCCR History',
    report: 'DCCR History — the old DCCR register\u2019s calls', audit: 'report.dccr_history',
    sources: false, duplicates: false, yearTabs: false,
    summaryNote: 'One record per UC No. + Call No.; a re-load corrects it. No serial: stored, but the Recent Failure Rate matches a failure to its machine by serial, so it cannot count these.',
    noSerial: 'Stored, but the Recent Failure Rate matches a failure to its machine by serial and cannot count these',
  },
};

const ALL_COLUMNS: Column<Row>[] = [
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

const ALL_EXPORT: { key: string; header: string }[] = [
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

// CALL HISTORY IN THE F/I CALL REGISTER'S FORMAT (the user, 2026-11-28: "I
// need the Call History in this Format"): its 37 columns, in its order and
// under its headings, on the screen and in the download -- then RITHI's own
// four (the Call Type chosen at upload, Source, Year, Duplicate). DCCR History
// keeps its own columns. See callHistoryFormat.ts for where each value is read.
const FORMAT_COLUMNS: Column<Row>[] = [
  ...CALL_HISTORY_FORMAT.map((c, i): Column<Row> => ({
    key: formatKey(i), header: c.header,
    width: c.kind ? 120 : /Party|Complaint|Job|Observation|Report|Reason/.test(c.header) ? 200 : 130,
    wrap: c.header === 'UC Number' ? false : undefined,
    render: c.kind === 'date' ? (r) => day(r[formatKey(i)])
      : c.kind === 'datetime' ? (r) => (r[formatKey(i)] ? formatDayTime(r[formatKey(i)]) : '')
      : c.kind === 'link' ? (r) => {
        const v = String(r[formatKey(i)] ?? '');
        const href = driveHref(v);
        return href
          ? <a href={safeUrl(href)} target="_blank" rel="noopener noreferrer" title={href} onClick={(e) => e.stopPropagation()}>Open in Drive ↗</a>
          : v;
      }
      : undefined,
  })),
  { key: 'register', header: 'Register (chosen at upload)', width: 110 },
  { key: 'source', header: 'Source', width: 110 },
  { key: 'record_year', header: 'Year', width: 70 },
  { key: 'duplicate', header: 'Duplicate', width: 90, render: (r) => (r.duplicate ? 'Duplicate' : '') },
];
const FORMAT_EXPORT: { key: string; header: string }[] = [
  ...CALL_HISTORY_FORMAT.map((c, i) => ({ key: formatKey(i), header: c.header })),
  { key: 'register', header: 'Register (chosen at upload)' }, { key: 'source', header: 'Source' },
  { key: 'record_year', header: 'Year' }, { key: 'duplicate', header: 'Duplicate' },
  { key: 'loaded_at', header: 'Loaded At' },
];

const groupKey = (g: { record_year: number | null; source: string; register: string }) => `${g.record_year ?? ''}|${g.source}|${g.register}`;

export function CallHistory() { return <HistoryScreen kind="call" />; }
export function DccrHistory() { return <HistoryScreen kind="dccr" />; }

function HistoryScreen({ kind }: { kind: HistoryKind }) {
  const cfg = CONFIG[kind];
  const def = UPLOADS.find((d) => d.key === cfg.uploadKey);
  const keep = (k: string) => (cfg.sources || k !== 'source') && (cfg.duplicates || k !== 'duplicate');
  const COLUMNS = cfg.yearTabs ? FORMAT_COLUMNS : ALL_COLUMNS.filter((c) => keep(String(c.key)));
  const EXPORT = cfg.yearTabs ? FORMAT_EXPORT : ALL_EXPORT.filter((c) => keep(c.key));
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
      setGroups(await callHistorySummary(kind));
    } catch (e) {
      setSumErr(loadFailure(e, {
        tables: [kind === 'dccr' ? 'dccr_call_history_summary' : 'call_history_summary'],
        hint: `The summary is not on the project yet — it arrives with migration ${cfg.summaryMigration} (supabase/apply/daily_review.sql). ${kind === 'dccr' ? 'Until then the DCCR register\u2019s calls are still in Call History.' : 'The list and the upload below work without it.'}`,
      }));
    } finally { setSumBusy(false); }
    if (def) countTable(def.table).then(setHeld).catch(() => setHeld(null));
  };

  // ---- the list ------------------------------------------------------------
  const [year, setYear] = useState('');
  const [source, setSource] = useState('');
  const [register, setRegister] = useState('');
  const [dupOnly, setDupOnly] = useState(false);
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  useEffect(() => { const t = setTimeout(() => setQLive(q), 350); return () => clearTimeout(t); }, [q]);
  // CALL HISTORY: A TAB PER YEAR, and the Field Call register's search row (the
  // user, 2026-11-28: "Add Tabs Per year , Field , Installation , PM all can be
  // in the Same List , But Year should be in Different Tabs. For Server Search
  // Filters - Go with these ... Same as Field Call"). Each year is stored in a
  // table of its own (0501). `tab` is a year, 'undated' or 'all'; '' until the
  // summary has said which years there are, and the list waits for it.
  const [tab, setTab] = useState('');
  // TWO TABS ON CALL HISTORY (the user, 2026-11-28: "Keep the Log and Upload
  // option in a Separate Tab in Call History.. Also the Summary goes there";
  // asked, the summary IS the log -- no separate upload log). Calls: the year
  // tabs, the search and the list. Uploads: the upload and "What has been
  // loaded". DCCR History keeps its one page.
  const [view, setView] = useState<'calls' | 'uploads'>('calls');
  const showUploads = !cfg.yearTabs || view === 'uploads';
  const showCalls = !cfg.yearTabs || view === 'calls';
  // THE CALL, OPENED (the user: "When i click on the Row, I want the Inform to
  // come up in a Drawer or Pop Up"): every column of the format, what RITHI
  // recorded about the load, and anything else the file carried.
  const [opened, setOpened] = useState<Row | null>(null);
  const BLANK = { ucn: '', product: '', serial: '', party: '', engineer: '', status: '', q: '' };
  const [hs, setHs] = useState(BLANK);
  const [hsLive, setHsLive] = useState(BLANK);
  useEffect(() => { const t = setTimeout(() => setHsLive(hs), 350); return () => clearTimeout(t); }, [hs]);
  const setHs1 = (k: keyof typeof BLANK, v: string) => setHs((c) => ({ ...c, [k]: v }));
  const [choices, setChoices] = useState<Record<'product' | 'engineer' | 'status', { value: string; calls: number }[]>>({ product: [], engineer: [], status: [] });
  useEffect(() => {
    if (!cfg.yearTabs || !supabaseConfigured()) return;
    callHistoryChoices().then(setChoices).catch(() => { /* no 0500 yet: the dropdowns stay empty */ });
  }, [cfg.yearTabs]);
  const filter: CallHistoryFilter = useMemo(() => (cfg.yearTabs
    ? { year: /^\d+$/.test(tab) ? Number(tab) : null, undated: tab === 'undated', ...hsLive }
    : { year: year ? Number(year) : null, source, register, duplicate: dupOnly, q: qLive }),
  [cfg.yearTabs, tab, hsLive, year, source, register, dupOnly, qLive]);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);
  const load = async (append: boolean) => {
    if (!supabaseConfigured()) return;
    if (cfg.yearTabs && !tab) return;     // which year is not known yet
    const mine = ++seq.current;
    const from = append ? rows.length : 0;
    if (append) setMore(true); else setBusy(true);
    setErr(null);
    try {
      const got = await listCallHistory(kind, filter, from, from + PAGE - 1);
      if (mine !== seq.current) return; // a newer filter has been asked for
      const page = got.rows.map((r) => ({ ...(cfg.yearTabs ? shapeHistoryRow(r) : r), id: String(r.id) } as Row));
      setRows((prev) => (append ? [...prev, ...page] : page));
      setTotal(got.total);
    } catch (e) {
      if (mine !== seq.current) return;
      setErr(loadFailure(e, { tables: [kind === 'dccr' ? 'dccr_call_history' : 'call_history'],
        hint: `${cfg.title} is not on the project yet — it arrives with migration ${kind === 'dccr' ? '0496' : '0429'} (supabase/apply/daily_review.sql).` }));
    } finally { if (mine === seq.current) { setBusy(false); setMore(false); } }
  };
  useEffect(() => { void loadSummary(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(false); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const moreAvailable = total != null && rows.length < total;
  // THE TABS: every year there is a record of, newest first; Undated when a call
  // has no year; All years last, for a call whose year is not known. Opens on
  // the newest year.
  const yearTabs = useMemo(() => {
    const ys = [...new Set(groups.map((g) => g.record_year).filter((y): y is number => y != null))].sort((a, b) => b - a);
    const count = (y: number | null) => groups.filter((g) => g.record_year === y).reduce((n, g) => n + g.calls, 0);
    return [...ys.map((y) => ({ key: String(y), label: String(y), n: count(y) })),
      ...(groups.some((g) => g.record_year == null) ? [{ key: 'undated', label: 'Undated', n: count(null) }] : []),
      { key: 'all', label: 'All years', n: groups.reduce((n, g) => n + g.calls, 0) }];
  }, [groups]);
  useEffect(() => {
    if (!cfg.yearTabs || tab || sumBusy) return;
    if (groups.length || sumErr) setTab(yearTabs[0]?.key ?? 'all');
  }, [cfg.yearTabs, tab, sumBusy, groups, sumErr, yearTabs]);
  const hsSet = Object.values(hs).some((v) => v.trim() !== '');
  const years = useMemo(() => [...new Set(groups.map((g) => g.record_year).filter((y): y is number => y != null))]
    .sort((a, b) => b - a).map(String), [groups]);
  const sources = useMemo(() => [...new Set(groups.map((g) => g.source))].sort(), [groups]);
  const registers = useMemo(() => [...new Set(['Field', 'Installation', 'PM', ...groups.map((g) => g.register)])], [groups]);
  const totals = useMemo(() => groups.reduce((t, g) => ({
    calls: t.calls + g.calls, duplicates: t.duplicates + g.duplicates, without_serial: t.without_serial + g.without_serial,
  }), { calls: 0, duplicates: 0, without_serial: 0 }), [groups]);
  const picked = (g: CallHistoryGroup) => String(g.record_year ?? '') === year && g.source === source && g.register === register;
  const pick = (g: CallHistoryGroup) => {
    if (cfg.yearTabs) { setTab(g.record_year == null ? 'undated' : String(g.record_year)); setView('calls'); return; }
    if (picked(g)) { setYear(''); setSource(''); setRegister(''); return; }
    setYear(g.record_year == null ? '' : String(g.record_year)); setSource(g.source); setRegister(g.register);
  };
  const clearFilters = () => { setYear(''); setSource(''); setRegister(''); setDupOnly(false); setQ(''); };
  const filtered = !!(year || source || register || dupOnly || qLive.trim())
    || (cfg.yearTabs && Object.values(hsLive).some((v) => v.trim() !== ''));

  const scopeText = (cfg.yearTabs
    ? [tab === 'all' ? 'all years' : tab === 'undated' ? 'undated' : `year ${tab}`,
       ...Object.entries(hsLive).filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v.trim()}`)]
    : [year && `year ${year}`, source && `source ${source}`, register && `call type ${register}`,
       dupOnly && 'duplicates only', qLive.trim() && `search: ${qLive.trim()}`]).filter(Boolean).join(' · ') || 'every history call';
  const opt = (k: 'product' | 'engineer' | 'status') =>
    choices[k].map((c) => ({ value: c.value, label: `${c.value} (${c.calls.toLocaleString()})` }));

  const [dl, setDl] = useState(false);
  const download = async (fileKind: 'xlsx' | 'csv') => {
    if (!mayExport) return;
    setDl(true);
    try {
      const cap = 100000;
      const all = await allCallHistory(kind, filter, cap);
      if (!all.length) return;
      const name = `${cfg.fileName}-${todayLocal()}`;
      const shaped = (r: Record<string, unknown>): Record<string, unknown> =>
        ({ ...(cfg.yearTabs ? shapeHistoryRow(r) : r), duplicate: r.duplicate ? 'Duplicate' : '' });
      if (fileKind === 'csv') {
        csvExport(`${name}.csv`, EXPORT, all.map((r) => {
          const s = shaped(r);
          return Object.fromEntries(EXPORT.map((c) => [c.key,
            c.key === 'call_at' || c.key === 'solved_at' || c.key === 'loaded_at' ? (s[c.key] ? formatDayTime(s[c.key]) : '') : xlsxText(s[c.key] ?? '')]));
        }), cappedAt(all.length, cap));
      } else {
        xlsxDownload(`${name}.xlsx`, [
          { name: cfg.sheet, columns: EXPORT.map((c) => c.header),
            rows: all.map((r) => { const s = shaped(r); return Object.fromEntries(EXPORT.map((c) => [c.header, xlsxCell(s[c.key])])); }) },
          { name: 'About', columns: ['Item', 'Value'], rows: [
            { Item: 'Report', Value: cfg.report },
            { Item: 'What it is', Value: 'History only: the call status and solved date are the file’s own, as written. Nothing in RITHI was created from these calls.' },
            { Item: 'Scope of this file', Value: scopeText },
            { Item: 'Rows', Value: String(all.length) },
            { Item: 'Taken', Value: fmtLongDate(new Date().toISOString()) },
          ] },
        ], cappedAt(all.length, cap));
      }
      logAudit({ action: cfg.audit, meta: { rows: all.length, scope: scopeText, kind: fileKind } });
    } catch (e) {
      setErr(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setDl(false); }
  };

  if (!supabaseConfigured()) return <div style={{ padding: 24 }} className="muted">Connect the database in Settings first.</div>;

  return (
    <div>
      <PageHeader
        title={cfg.title} icon={cfg.icon}
        subtitle={cfg.subtitle}
        count={total ?? undefined} countMore={false} moreAvailable={moreAvailable}
        onLoadMore={() => load(true)} loadingMore={more}
        onRefresh={() => { void loadSummary(); void load(false); }} refreshing={busy || sumBusy} />

      {cfg.yearTabs && (
        <div className="dccr-tabs" role="tablist" aria-label="Call History" style={{ marginBottom: 12 }}>
          <button role="tab" aria-selected={view === 'calls'} className={`dccr-tab${view === 'calls' ? ' is-active' : ''}`}
            onClick={() => setView('calls')}>Calls{total != null ? <span className="dccr-tab-count">{total.toLocaleString()}</span> : null}</button>
          <button role="tab" aria-selected={view === 'uploads'} className={`dccr-tab${view === 'uploads' ? ' is-active' : ''}`}
            onClick={() => setView('uploads')}>Uploads &amp; summary</button>
        </div>
      )}

      {showUploads && <>
      <SectionCard title="Upload a file">
        {!def && <div className="sheet-banner sheet-banner-error"><span>The {cfg.title} upload is missing from this build.</span></div>}
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
                  <th>Year</th>{cfg.sources && <th>Source</th>}<th>Call Type</th>
                  <th style={{ textAlign: 'right' }}>Calls</th>
                  {cfg.duplicates && <th style={{ textAlign: 'right' }} title="The same UC No. + Call No. also came from another source or year; the latest year's record is shown">Duplicates</th>}
                  <th style={{ textAlign: 'right' }} title={cfg.noSerial}>No serial</th>
                  <th>First call</th><th>Last call</th><th>Last loaded</th><th>By</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={groupKey(g)} onClick={() => pick(g)} style={{ cursor: 'pointer', ...(picked(g) ? { background: 'var(--text)', color: 'var(--surface)' } : {}) }}
                    title="Show these calls in the list below (click again to clear)">
                    <td>{g.record_year ?? NOT_RECORDED}</td>{cfg.sources && <td>{g.source}</td>}<td>{g.register}</td>
                    <td style={{ textAlign: 'right' }}>{g.calls.toLocaleString()}</td>
                    {cfg.duplicates && <td style={{ textAlign: 'right' }}>{g.duplicates ? g.duplicates.toLocaleString() : ''}</td>}
                    <td style={{ textAlign: 'right' }}>{g.without_serial ? g.without_serial.toLocaleString() : ''}</td>
                    <td>{day(g.first_call_at)}</td><td>{day(g.last_call_at)}</td>
                    <td>{g.last_loaded_at ? formatDayTime(g.last_loaded_at) : ''}</td>
                    <td>{g.last_loaded_by ? nameForUserId(g.last_loaded_by, names) : ''}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 600 }}>
                  <td colSpan={cfg.sources ? 3 : 2}>All</td>
                  <td style={{ textAlign: 'right' }}>{totals.calls.toLocaleString()}</td>
                  {cfg.duplicates && <td style={{ textAlign: 'right' }}>{totals.duplicates.toLocaleString()}</td>}
                  <td style={{ textAlign: 'right' }}>{totals.without_serial.toLocaleString()}</td>
                  <td colSpan={4} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Counted by the database, so every number is exact. {cfg.summaryNote} Click a row to list those calls{cfg.yearTabs ? ' on the Calls tab' : ' below'}.
        </p>
      </SectionCard>
      <div style={{ height: 12 }} />
      </>}

      {showCalls && <>
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
      {cfg.yearTabs && (
        <>
          <div className="dccr-tabs" role="tablist" aria-label="Year">
            {yearTabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key}
                className={`dccr-tab${tab === t.key ? ' is-active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label} <span className="dccr-tab-count">{t.n.toLocaleString()}</span>
              </button>
            ))}
          </div>
          <Toolbar>
            <div className="call-search">
              <input className="input" placeholder="UCN No" value={hs.ucn} onChange={(e) => setHs1('ucn', e.target.value)} />
              <SelectPicker className="call-search-product" value={hs.product} onChange={(v) => setHs1('product', v)}
                placeholder="Product" options={opt('product')} />
              <input className="input" placeholder="Serial" value={hs.serial} onChange={(e) => setHs1('serial', e.target.value)} />
              <input className="input" placeholder="Party" value={hs.party} onChange={(e) => setHs1('party', e.target.value)} />
              <SelectPicker className="call-search-engineer" value={hs.engineer} onChange={(v) => setHs1('engineer', v)}
                placeholder="Engineer" options={opt('engineer')} />
              <SelectPicker className="call-search-status" value={hs.status} onChange={(v) => setHs1('status', v)}
                placeholder="Call Status" options={opt('status')} />
              <input className="input call-search-global" placeholder="🔎 Global" value={hs.q} onChange={(e) => setHs1('q', e.target.value)} />
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => setHs(BLANK)} disabled={!hsSet}
              title="Clear every search on this year">✕ Reset filters</button>
          </Toolbar>
        </>
      )}
      {!cfg.yearTabs && <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="UC No., Call No., party, product or serial" />
        <SelectPicker value={year} onChange={setYear} placeholder="Any year" options={years} />
        {cfg.sources && <SelectPicker value={source} onChange={setSource} placeholder="Any source" options={sources} />}
        <SelectPicker value={register} onChange={setRegister} placeholder="Any call type" options={registers} />
        {cfg.duplicates && (
          <label className="row" style={{ gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={dupOnly} onChange={(e) => setDupOnly(e.target.checked)} /> Duplicates only
          </label>
        )}
        {filtered && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>}
      </Toolbar>}

      <DataTable<Row>
        columns={COLUMNS} rows={rows} getRowId={(r) => r.id}
        storageKey={cfg.storageKey}
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
        onRowClick={cfg.yearTabs ? (r) => setOpened(r) : undefined}
      />
      </>}

      {opened && (
        <Drawer open onClose={() => setOpened(null)} title={`Call History — ${String(opened.ucn ?? '')}`} storeKey="call-history-call" width={640}>
          <CallDetail row={opened} names={names} />
        </Drawer>
      )}
    </div>
  );
}

function DetailRows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <table className="assoc-table" style={{ width: '100%' }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th style={{ width: '40%', textAlign: 'left', verticalAlign: 'top', fontWeight: 600 }}>{k}</th>
            <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{v === '' || v == null ? <span className="muted">—</span> : v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One history call in full: the register's columns in its order, then what
 *  RITHI recorded about the load, then any other column the file carried. */
function CallDetail({ row, names }: { row: Row; names: ReturnType<typeof useUserNames> }) {
  const shown = (i: number): React.ReactNode => {
    const c = CALL_HISTORY_FORMAT[i];
    const v = row[formatKey(i)];
    if (v == null || String(v).trim() === '') return '';
    if (c.kind === 'date') return day(v);
    if (c.kind === 'datetime') return formatDayTime(v);
    if (c.kind === 'link') {
      const href = driveHref(v);
      return href ? <a href={safeUrl(href)} target="_blank" rel="noopener noreferrer">Open in Drive ↗</a> : String(v);
    }
    return String(v);
  };
  const others = otherExtra(row.extra);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section>
        <h4 style={{ margin: '0 0 6px' }}>The call, as in the file</h4>
        <DetailRows rows={CALL_HISTORY_FORMAT.map((c, i) => [c.header, shown(i)] as [string, React.ReactNode])} />
      </section>
      <section>
        <h4 style={{ margin: '0 0 6px' }}>Recorded by RITHI</h4>
        <DetailRows rows={[
          ['Register (chosen at upload)', String(row.register ?? '')],
          ['Source', String(row.source ?? '')],
          ['Year', row.record_year == null ? 'Undated' : String(row.record_year)],
          ['Duplicate', row.duplicate ? 'Duplicate — the same UC No. + Call No. also came from another source this year' : ''],
          ['Loaded at', row.loaded_at ? formatDayTime(row.loaded_at) : ''],
          ['Loaded by', row.loaded_by ? nameForUserId(String(row.loaded_by), names) : ''],
        ]} />
      </section>
      {others.length > 0 && (
        <section>
          <h4 style={{ margin: '0 0 6px' }}>Other columns in the file</h4>
          <DetailRows rows={others} />
        </section>
      )}
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>History only: nothing in RITHI was created from this call. Its status and dates are the file’s own.</p>
    </div>
  );
}

export default CallHistory;
