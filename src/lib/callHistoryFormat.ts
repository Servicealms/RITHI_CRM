// ===========================================================================
// THE CALL HISTORY FORMAT -- the F/I Call Register's 37 columns (and Drive Link), in its order
// and under its headings (the user, 2026-11-28, uploading
// "24_v0 - F_I Call Register - Field 24.csv": "I need the Call History in this
// Format").
//
// Sixteen of the 37 are columns of call_history. The other 21 were never given
// columns: the upload keeps every heading it has no column for in `extra`,
// under the heading AS THE FILE WROTE IT. So each one is read back from there,
// matched the way the importer matches headings (squash: letters and digits
// only), so "CALL PENDING REASON" and "Call Pending Reason" are one column.
// Nothing is invented: a file that did not carry a heading shows it blank.
//
// DATES IN `extra` ARE TEXT AS WRITTEN ("29 Dec 23"). They are read day-first,
// the way every import reads them, into a wall-clock ISO value so the screen
// shows dd-MMM-yyyy and the .xlsx gets a real date; one that cannot be read is
// kept exactly as written.
//
// No import.meta here, so a node script can test it (the paging.ts reason).
// ===========================================================================
import { squash } from './headers';
import { parseDateParts } from './dates';

export type FormatKind = 'text' | 'date' | 'datetime' | 'link';
export interface FormatColumn {
  /** The heading, exactly as the register writes it -- misspelling included. */
  header: string;
  /** A call_history column, when there is one. */
  column?: string;
  /** The headings to look for in `extra` (where there is no column, or the
   *  column is empty); the first is the register's own. */
  extra?: string[];
  kind?: FormatKind;
}

export const CALL_HISTORY_FORMAT: FormatColumn[] = [
  { header: 'UC Number', column: 'ucn' },
  { header: 'Call Number', column: 'call_no' },
  // A file loaded before the upload knew this spelling kept the date in `extra`.
  { header: 'Call Registeration Date', column: 'call_at', extra: ['Call Registeration Date'], kind: 'datetime' },
  { header: 'Complaint Date', extra: ['Complaint Date'], kind: 'date' },
  { header: 'Party Name', column: 'party_name' },
  { header: 'City', column: 'city' },
  { header: 'State', column: 'state' },
  { header: 'Product Name', column: 'item_name' },
  { header: 'Product Serial Number', column: 'serial' },
  { header: 'Item Status', column: 'item_status' },
  { header: 'Warranty Number', extra: ['Warranty Number', 'Warranty No', 'Warranty No.'] },
  { header: 'Warranty Start Date', column: 'warranty_start', kind: 'date' },
  { header: 'Warranty End Date', extra: ['Warranty End Date', 'Warranty End'], kind: 'date' },
  { header: 'Contract Number', extra: ['Contract Number', 'Contract No', 'Contract No.'] },
  { header: 'Contract Start Date', extra: ['Contract Start Date', 'Contract Start'], kind: 'date' },
  { header: 'Contract End Date', extra: ['Contract End Date', 'Contract End'], kind: 'date' },
  { header: 'Contract Type', column: 'contract_type' },
  { header: 'Call Type', column: 'call_type' },
  { header: 'Standard Complaint', column: 'standard_complaint' },
  { header: 'Complaint Reported', column: 'complaint_reported' },
  { header: 'Call Allocated To', column: 'engineer' },
  { header: 'Breakdown Date', extra: ['Breakdown Date'], kind: 'date' },
  { header: 'Engineer Email', extra: ['Engineer Email', 'Engineer E-mail', 'Engineer Email ID'] },
  { header: 'Reporting Manager', extra: ['Reporting Manager'] },
  { header: 'Regional Manager', extra: ['Regional Manager'] },
  { header: 'Call Acceptance', extra: ['Call Acceptance'] },
  { header: 'Open/Close', extra: ['Open/Close', 'Open Close'] },
  { header: 'Call Status', column: 'call_status' },
  { header: 'Region', extra: ['Region'] },
  { header: 'Visiting Service Engineer', extra: ['Visiting Service Engineer'] },
  { header: 'Visit Date & Time', extra: ['Visit Date & Time', 'Visit Date and Time', 'Visit Date'], kind: 'datetime' },
  { header: 'CALL PENDING REASON', extra: ['CALL PENDING REASON', 'Pending Reason'] },
  { header: 'Complaint Observation', extra: ['Complaint Observation'] },
  { header: 'Job Done', extra: ['Job Done'] },
  { header: 'Service Report', extra: ['Service Report'] },
  // ONE MORE, BESIDE IT (the user, 2026-11-28: "one more Column for 'Drive
  // Link' - Which should present as a Drive Link"; asked, the files will CARRY
  // it -- no lookup). Service Report is an AppSheet path, not a link; this is
  // the file's own Drive URL, kept in `extra` like the others, opened as a link.
  { header: 'Drive Link', extra: ['Drive Link', 'Drive URL', 'Google Drive Link', 'Drive'], kind: 'link' },
  { header: 'Call Solved Date & Time', column: 'solved_at', kind: 'datetime' },
  { header: 'Call Canceled Date', extra: ['Call Canceled Date', 'Call Cancelled Date'], kind: 'date' },
];

/** The key a shaped row carries a format column's value under. */
export const formatKey = (i: number) => `fmt_${i}`;

const pad = (n: number) => String(n).padStart(2, '0');

/** A date written as text in the file, as a wall-clock ISO value; unreadable stays as written. */
export function extraDate(v: string): string {
  const p = parseDateParts(v);
  if (!p) return v;
  const day = `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
  return p.hasTime ? `${day}T${pad(p.hh)}:${pad(p.mi)}:${pad(p.ss)}` : day;
}

/** The value of a heading kept in `extra`, matched as the importer matches headings. */
export function fromExtra(extra: unknown, aliases: string[]): string {
  if (!extra || typeof extra !== 'object') return '';
  const kept = extra as Record<string, unknown>;
  const keys = Object.keys(kept);
  for (const a of aliases) {
    const want = squash(a);
    const k = keys.find((h) => squash(h) === want);
    if (k !== undefined) {
      const s = String(kept[k] ?? '').trim();
      if (s) return s;
    }
  }
  return '';
}

/** The row with every format column's value under formatKey(i). */
export function shapeHistoryRow<T extends Record<string, unknown>>(r: T): T & Record<string, unknown> {
  const out: Record<string, unknown> = { ...r };
  CALL_HISTORY_FORMAT.forEach((c, i) => {
    const own = c.column ? r[c.column] : null;
    if (c.column && (own != null && String(own).trim() !== '' || !c.extra)) { out[formatKey(i)] = own ?? ''; return; }
    const v = fromExtra(r.extra, c.extra ?? [c.header]);
    out[formatKey(i)] = v && (c.kind === 'date' || c.kind === 'datetime') ? extraDate(v) : v;
  });
  return out as T & Record<string, unknown>;
}

// A bare Drive file id: Google's are 25+ characters of letters, digits, - and _
// (the same test as reportMapping's), with no dot or slash to be a file name.
const DRIVE_ID = /^[A-Za-z0-9_-]{25,}$/;

/** The link a Drive Link cell opens: a web address as given, a bare Drive file
 *  id as its file link, anything else none -- the text still shows. Only
 *  http(s): a stored value never becomes a script or an in-app path. */
export function driveHref(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  if (!s || /[\u0000-\u001f\u007f\s]/.test(s)) return undefined;
  if (/^https?:\/\/[^/]/i.test(s)) return s;
  if (DRIVE_ID.test(s)) return `https://drive.google.com/file/d/${s}/view`;
  return undefined;
}

/** The headings the file carried that no format column shows -- kept with the
 *  call, and shown in its drawer so nothing the file said is out of sight. */
export function otherExtra(extra: unknown): [string, string][] {
  if (!extra || typeof extra !== 'object') return [];
  const shown = new Set(CALL_HISTORY_FORMAT.flatMap((c) => [...(c.extra ?? []), ...(c.column ? [] : [c.header])]).map(squash));
  return Object.entries(extra as Record<string, unknown>)
    .filter(([k, v]) => !shown.has(squash(k)) && String(v ?? '').trim() !== '')
    .map(([k, v]) => [k, String(v)]);
}
