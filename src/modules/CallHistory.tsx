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
import { safeUrl } from '../lib/safeUrl';
import { CALL_HISTORY_FORMAT, HISTORY_SECTIONS, formatKey, shapeHistoryRow, driveHref, otherExtra, historyStatusLabel, isLightSolved } from '../lib/callHistoryFormat';
import { StateBadge, HISTORY_SOLVED_LIGHT, stateColour } from '../lib/callstate';
import {
  supabaseConfigured, countTable, callHistorySummary, listCallHistory, allCallHistory, callHistoryChoices,
  listCallHistoryUploads, deleteCallHistoryUpload, type CallHistoryUpload,
  callHistorySpares, type HistorySpare,
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
// 2,000 calls a page, first load and every Load more, on every year tab and on
// DCCR History (the user, 2026-11-28: "Load More should load 2000 in one go").
// listCallHistory reads it in two slices of 1,000 -- PostgREST's cap.
const PAGE = 2000;
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
    storageKey: 'call-history-v3', fileName: 'call-history', sheet: 'Call History',
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
    render: c.header === 'UC Number' ? (r) => <HistoryUcn ucn={r[formatKey(i)]} status={r.call_status} />
      : c.header === 'Call Status' ? (r) => <HistoryStatus status={r.call_status} />
      : c.kind === 'date' ? (r) => day(r[formatKey(i)])
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
];

/** A call's row without who loaded it and when -- those live on the summary. */
function withoutLoad<T extends Record<string, unknown>>(r: T): T {
  const { loaded_at: _at, loaded_by: _by, ...rest } = r;
  void _at; void _by;
  return rest as T;
}

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
  const mayDelete = can('call_history.delete');
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
    if (cfg.yearTabs) {
      // THE DROPDOWNS' VALUES ARE ASKED AGAIN WITH THE SUMMARY -- on opening,
      // Refresh, and after every upload or delete. They were asked ONCE, when
      // the page opened, so a page opened while Call History was empty kept
      // empty Product / Engineer / Call Status lists after the files were
      // loaded (reported 2026-11-28), and a failure was swallowed in silence.
      setChoicesBusy(true);
      callHistoryChoices().then(setChoices)
        .catch((e) => setSumErr((prev) => prev ?? `The Product / Engineer / Call Status lists could not be loaded: ${e instanceof Error ? e.message : String(e)}`))
        .finally(() => setChoicesBusy(false));
      listCallHistoryUploads().then((u) => { setUploads(u); setUpErr(null); })
        .catch((e) => setUpErr(loadFailure(e, { tables: ['call_history_uploads'],
          hint: 'The list of uploads arrives with migration 0504 (supabase/apply/daily_review.sql).' })));
    }
  };

  // ---- the uploads, each deletable as a whole (0504) -----------------------
  // The user, 2026-11-28: "Give me a Button to Clear it, Add it to Actions list
  // in Roles & Permission so that i can remove at my Will - the Whole Upload".
  const [uploads, setUploads] = useState<CallHistoryUpload[]>([]);
  const [upErr, setUpErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState('');
  const [upMsg, setUpMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const deleteUpload = async (u: CallHistoryUpload) => {
    if (!mayDelete) return;
    const what = u.upload_batch ? `upload ${u.upload_batch}${u.upload_file ? ` (${u.upload_file})` : ''}` : 'the calls loaded before uploads were numbered';
    if (!confirm(`Delete ${what}?\n\n${u.calls.toLocaleString()} call${u.calls === 1 ? '' : 's'} — ${u.years || 'no year'} · ${u.sources || 'no source'} · ${u.registers || 'no call type'} — will be removed from Call History for good. There is no undo.\n\nA call this upload loaded again from an earlier upload goes too; the earlier version is not brought back.`)) return;
    setDeleting(u.upload_batch); setUpMsg(null);
    try {
      const n = await deleteCallHistoryUpload(u.upload_batch);
      setUpMsg(n
        ? { tone: 'ok', text: `${n.toLocaleString()} call${n === 1 ? '' : 's'} deleted (${what}).` }
        : { tone: 'error', text: `Nothing was deleted — your role may not hold “Delete a Call History upload” on the database yet, or the calls were already gone.` });
      logAudit({ action: 'call_history.delete_upload', meta: { batch: u.upload_batch, calls: n } });
      void loadSummary(); void load(false);
    } catch (e) {
      setUpMsg({ tone: 'error', text: `Could not delete: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setDeleting(''); }
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
  // THE CALL, OPENED -- in a POP-UP (the user, 2026-11-28: "Make it a Pop up
  // window instead of a Drawer"): the format's columns in sections, less the
  // three it hides, and anything else the file carried.
  const [opened, setOpened] = useState<Row | null>(null);
  // THE TABLE'S FILTERS IN THE SEARCH ROW (the user, 2026-11-28: "Move Filters
  // also to the Same Row as other Filters are"): the table renders them here.
  const [filterSlot, setFilterSlot] = useState<HTMLSpanElement | null>(null);
  const BLANK = { ucn: '', product: '', serial: '', party: '', engineer: '', status: '', q: '' };
  const [hs, setHs] = useState(BLANK);
  const [hsLive, setHsLive] = useState(BLANK);
  useEffect(() => { const t = setTimeout(() => setHsLive(hs), 350); return () => clearTimeout(t); }, [hs]);
  const setHs1 = (k: keyof typeof BLANK, v: string) => setHs((c) => ({ ...c, [k]: v }));
  const [choices, setChoices] = useState<Record<'product' | 'engineer' | 'status', { value: string; calls: number }[]>>({ product: [], engineer: [], status: [] });
  const [choicesBusy, setChoicesBusy] = useState(false);
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
      // WHO LOADED IT AND WHEN are not part of a call's view (the user,
      // 2026-11-28: "Dont keep tab of Who Uploaded or When it was Uploaded in
      // the View - Move it to the Summary or Log"): the summary's Last loaded /
      // By carry them, so they are taken off the row here -- the list's column
      // picker, the drawer and the download cannot show them.
      const page = got.rows.map((r) => ({ ...(cfg.yearTabs ? withoutLoad(shapeHistoryRow(r)) : r), id: String(r.id) } as Row));
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
    // ALL YEARS FIRST, then the years newest first (the user, 2026-11-28:
    // "Move All Years as the first tab then go Descending"); Undated last. The
    // page opens on the first tab, All years.
    return [{ key: 'all', label: 'All years', n: groups.reduce((n, g) => n + g.calls, 0) },
      ...ys.map((y) => ({ key: String(y), label: String(y), n: count(y) })),
      ...(groups.some((g) => g.record_year == null) ? [{ key: 'undated', label: 'Undated', n: count(null) }] : [])];
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
    choices[k].map((c) => ({ value: c.value, label: `${k === 'status' ? historyStatusLabel(c.value) : c.value} (${c.calls.toLocaleString()})` }));

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
        ({ ...(cfg.yearTabs ? withoutLoad(shapeHistoryRow(r)) : r), duplicate: r.duplicate ? 'Duplicate' : '' });
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

      {cfg.yearTabs && (
        <>
          <SectionCard title="Uploads">
            {upErr && <div className="sheet-banner sheet-banner-error"><span>{upErr}</span></div>}
            {upMsg && <div className={`sheet-banner ${upMsg.tone === 'ok' ? 'sheet-banner-ok' : 'sheet-banner-error'}`}><span>{upMsg.text}</span></div>}
            {!upErr && uploads.length === 0 && <p className="muted" style={{ margin: 0 }}>No uploads yet.</p>}
            {uploads.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="assoc-table">
                  <thead>
                    <tr>
                      <th>Upload</th><th>File</th><th>Years</th><th>Source</th><th>Call Type</th>
                      <th style={{ textAlign: 'right' }}>Calls</th><th>Loaded</th><th>By</th>{mayDelete && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {uploads.map((u) => (
                      <tr key={u.upload_batch || '(none)'}>
                        <td style={{ whiteSpace: 'nowrap' }}>{u.upload_batch || <span className="muted">Before uploads were numbered</span>}</td>
                        <td>{u.upload_file}</td><td>{u.years}</td><td>{u.sources}</td><td>{u.registers}</td>
                        <td style={{ textAlign: 'right' }}>{u.calls.toLocaleString()}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{u.last_loaded_at ? formatDayTime(u.last_loaded_at) : ''}</td>
                        <td>{u.loaded_by ? nameForUserId(u.loaded_by, names) : ''}</td>
                        {mayDelete && (
                          <td>
                            <button className="btn btn-sm btn-danger" disabled={!!deleting} onClick={() => void deleteUpload(u)}
                              title="Delete every call this upload loaded">
                              {deleting === u.upload_batch ? 'Deleting…' : '🗑 Delete upload'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              Each upload is numbered, and deleting it removes every call it loaded, for good. Loading a file again takes over the calls it names, so they belong to the newer upload.
              {!mayDelete && ' Deleting needs “Delete a Call History upload” on Roles & Permissions.'}
            </p>
          </SectionCard>
          <div style={{ height: 12 }} />
        </>
      )}

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
          {/* THE YEAR ROW CARRIES THE DOWNLOAD (the user, 2026-11-28: "Export
              can be moved to the Row where Year is mentioned"). */}
          <div className="ch-tabs-row">
          <div className="dccr-tabs" role="tablist" aria-label="Year">
            {yearTabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key}
                className={`dccr-tab${tab === t.key ? ' is-active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label} <span className="dccr-tab-count">{t.n.toLocaleString()}</span>
              </button>
            ))}
          </div>
            {mayExport && <button className="btn btn-ghost btn-sm" disabled={dl || !rows.length} onClick={() => void download('xlsx')}>⭳ Excel</button>}
            {mayExport && <button className="btn btn-ghost btn-sm" disabled={dl || !rows.length} onClick={() => void download('csv')}>⭳ CSV</button>}
          </div>
          <Toolbar>
            <div className="call-search ch-search">
              <input className="input" placeholder="UCN No" value={hs.ucn} onChange={(e) => setHs1('ucn', e.target.value)} />
              <SelectPicker className="call-search-product" value={hs.product} onChange={(v) => setHs1('product', v)}
                placeholder="Product" options={opt('product')} loading={choicesBusy} />
              <input className="input" placeholder="Serial" value={hs.serial} onChange={(e) => setHs1('serial', e.target.value)} />
              <input className="input" placeholder="Party" value={hs.party} onChange={(e) => setHs1('party', e.target.value)} />
              <SelectPicker className="call-search-engineer" value={hs.engineer} onChange={(v) => setHs1('engineer', v)}
                placeholder="Engineer" options={opt('engineer')} loading={choicesBusy} />
              <SelectPicker className="call-search-status" value={hs.status} onChange={(v) => setHs1('status', v)}
                placeholder="Call Status" options={opt('status')} loading={choicesBusy} />
              <input className="input call-search-global call-search-global-sm" placeholder="🔎 Global" value={hs.q} onChange={(e) => setHs1('q', e.target.value)} />
              <span className="ch-filter-slot" ref={setFilterSlot} />
              <button className="btn btn-sm btn-ghost" onClick={() => setHs(BLANK)} disabled={!hsSet}
                title="Clear every search on this year">✕ Reset filters</button>
            </div>
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
        controlsSlot={cfg.yearTabs ? filterSlot : undefined}
        toolbar={cfg.yearTabs
          // LOAD MORE ONLY BESIDE THE PAGE NAME (the user, 2026-11-28); the
          // download is on the year row and the Filters in the search row.
          ? <span className="muted">{rows.length.toLocaleString()} shown{total != null ? ` of ${total.toLocaleString()}` : ''}</span>
          : (
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
        <CallDetail row={opened} onClose={() => setOpened(null)} />
      )}
    </div>
  );
}

// THE STATUS COLOUR CODE ON CALL HISTORY (the user, 2026-11-28: "Add the
// Solved / Unsolved Colour Coding"): RITHI's own -- Unattended red, Unsolved
// blue, Report pending pink, Solved green, Cancelled grey -- with a call the
// old system closed without a completed report in LIGHT GREEN.
function HistoryStatus({ status }: { status: unknown }) {
  const text = historyStatusLabel(status);
  if (!text) return <span className="muted">—</span>;
  if (isLightSolved(text)) {
    return <span className="state-chip" style={{ background: HISTORY_SOLVED_LIGHT.bg, color: HISTORY_SOLVED_LIGHT.fg }}
      title={`Closed in the old system without a completed report — ${text}`}>{text}</span>;
  }
  return <StateBadge state={text} label={text} />;
}
/** The UC No., carrying its call's status colour as it does everywhere. */
function HistoryUcn({ ucn, status }: { ucn: unknown; status: unknown }) {
  const text = String(ucn ?? '').trim();
  if (!text) return <span className="muted">—</span>;
  const c = isLightSolved(historyStatusLabel(status)) ? HISTORY_SOLVED_LIGHT : stateColour(status);
  if (!c) return <span className="ucn-plain">{text}</span>;
  return <span className="ucn-chip" style={{ background: c.bg, color: c.fg }} title={`${text} — ${historyStatusLabel(status)}`}>{text}</span>;
}

// NOT SHOWN IN THE OPENED CALL (the user, 2026-11-28: "I want to Hide certain
// fields - Engineer Email, Reporting Manager, Regional Manager"). Kept with the
// call and still in the list's columns and the download; only the pop-up
// leaves them out. "Recorded by RITHI" (Register, Source, Year, Duplicate) is
// gone from it too ("I dont want this").
// (Taken out of the format altogether since -- the user removed them from the source.)
const HIDDEN_IN_POPUP = new Set<string>();

/** One history call in full: the register's columns in its order, then what
 *  RITHI recorded about the load, then any other column the file carried. */
function CallDetail({ row, onClose }: { row: Row; onClose: () => void }) {
  const shown = (i: number): React.ReactNode => {
    const c = CALL_HISTORY_FORMAT[i];
    const v = row[formatKey(i)];
    if (v == null || String(v).trim() === '') return '';
    if (c.header === 'Call Status') return <HistoryStatus status={row.call_status} />;
    if (c.header === 'UC Number') return <HistoryUcn ucn={v} status={row.call_status} />;
    if (c.kind === 'date') return day(v);
    if (c.kind === 'datetime') return formatDayTime(v);
    if (c.kind === 'link') {
      const href = driveHref(v);
      return href ? <a href={safeUrl(href)} target="_blank" rel="noopener noreferrer">Open in Drive ↗</a> : String(v);
    }
    return String(v);
  };
  const others = otherExtra(row.extra);
  // THE SPARES CONSUMED ON THIS CALL, by its UC No. (both consumption tables).
  const [spares, setSpares] = useState<HistorySpare[] | null>(null);
  const [sparesErr, setSparesErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSpares(null); setSparesErr(null);
    callHistorySpares(String(row.ucn ?? ''))
      .then((x) => { if (live) setSpares(x); })
      .catch((e) => { if (live) setSparesErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [row.ucn]);
  // THREE PANES, LIKE PENDING REGISTRATIONS (the user, 2026-11-28: "Split it
  // into 3 Column Screen ... Match the UI with how it looks in Pending
  // Registration"): the same overlay, panes, heads and label-over-value rows
  // (reg-split-3), stacked on a narrow screen. Call Details and Complaint |
  // the Drive Link, then the visit and its outcome | the spares consumed.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const rowsOf = (sec: string, skip?: string) => CALL_HISTORY_FORMAT.flatMap((c, i) =>
    (c.section === sec && c.header !== skip && !HIDDEN_IN_POPUP.has(c.header) ? [[c.header, shown(i)] as [string, React.ReactNode]] : []));
  const group = (title: string, items: [string, React.ReactNode][]) => (
    <div key={title} className="ch-pane-group">
      <div className="rep-sec-title">{title}</div>
      {items.map(([k, v]) => (
        <div className="reg-detail-row" key={k}>
          <div className="reg-detail-k">{k}</div>
          <div className="reg-detail-v">{v === '' || v == null ? <span className="muted">—</span> : v}</div>
        </div>
      ))}
    </div>
  );
  const driveIdx = CALL_HISTORY_FORMAT.findIndex((c) => c.header === 'Drive Link');
  const driveVal = driveIdx >= 0 ? String(row[formatKey(driveIdx)] ?? '').trim() : '';
  const driveUrl = driveHref(driveVal);
  return (
    <div className="reg-overlay" onMouseDown={onClose}>
      <div className="reg-split reg-split-3" onMouseDown={(e) => e.stopPropagation()}
        style={{ gridTemplateColumns: '36% 6px 32% 6px 1fr' }}>
        <aside className="reg-split-left">
          <div className="reg-split-head">
            <span>📄 Call details · <HistoryUcn ucn={row.ucn} status={row.call_status} /></span>
          </div>
          <div className="reg-detail-list">
            {group('Registration', rowsOf('Registration'))}
            {group('Customer & Product', rowsOf('Customer & Product'))}
            {group('Warranty & Contract', rowsOf('Warranty & Contract'))}
            {group('Complaint', rowsOf('Complaint'))}
            {others.length > 0 && group('Other columns in the file', others)}
          </div>
        </aside>
        <div className="reg-gutter" />
        <section className="reg-split-right">
          <div className="reg-split-head"><span>🛠 Visit details</span></div>
          <div className="reg-split-body">
            <div className="ch-drive">
              {driveUrl
                ? <a className="btn btn-sm btn-primary" href={safeUrl(driveUrl)} target="_blank" rel="noopener noreferrer">📎 Open in Drive ↗</a>
                : <span className="muted">{driveVal ? `Drive Link: ${driveVal}` : 'No Drive Link on this call.'}</span>}
            </div>
            {group('Visit & Report', rowsOf('Visit & Report', 'Drive Link'))}
            {group('Call Status', rowsOf('Call Status'))}
          </div>
        </section>
        <div className="reg-gutter" />
        <section className="reg-split-third">
          <div className="reg-split-head">
            <span>🔩 Spare consumption{spares ? ` · ${spares.length}` : ''}</span>
            <button className="btn btn-ghost btn-sm" onClick={onClose} title="Close (Esc)">✕</button>
          </div>
          <div className="reg-split-body">
            {sparesErr && <div className="sheet-banner sheet-banner-error"><span>Could not read the spares: {sparesErr}</span></div>}
            {!sparesErr && spares === null && <p className="muted" style={{ margin: 0 }}>Loading…</p>}
            {spares && spares.length === 0 && <p className="muted" style={{ margin: 0 }}>No spare is recorded against this UC No.</p>}
            {spares && spares.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="assoc-table" style={{ width: '100%' }}>
                  <thead>
                    <tr><th>Part</th><th style={{ textAlign: 'right' }}>Qty</th><th>Date</th><th>Engineer</th></tr>
                  </thead>
                  <tbody>
                    {spares.map((x, i) => (
                      <tr key={i}>
                        {/* No "Recorded as" or "Remarks" (the user, 2026-11-28). */}
                        <td>{x.part}</td>
                        <td style={{ textAlign: 'right' }}>{x.qty ?? ''}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{x.at ? formatDay(x.at) : ''}</td>
                        <td>{x.engineer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default CallHistory;
