// ===========================================================================
// THE CALL HISTORY FORMAT -- the F/I Call Register's columns (and Drive Link),
// LESS Engineer Email, Reporting Manager and Regional Manager (the user,
// 2026-11-28: "Removed Email Columns from Source itself"), which no longer
// show anywhere -- list, pop-up or download. A file that still carries them
// keeps them with the call (in `extra`), unshown. in its order
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
  /** Which section of the call's drawer it sits in (HISTORY_SECTIONS). */
  section: HistorySection;
}

// THE DRAWER IN SECTIONS, LIKE THE FIELD CALL FORM (the user, 2026-11-28:
// "Segregate it into Sections like the Field Call Form - In Call History
// also"). The first four are the form's own sections, holding the same fields
// they hold there; the register's status and visit columns have no place on
// the form (they come from the visit), so they get two of their own. The LIST
// and the DOWNLOAD keep the register's own column order -- only the drawer is
// grouped.
export const HISTORY_SECTIONS = ['Registration', 'Customer & Product', 'Warranty & Contract', 'Complaint', 'Call Status', 'Visit & Report'] as const;
export type HistorySection = typeof HISTORY_SECTIONS[number];

export const CALL_HISTORY_FORMAT: FormatColumn[] = [
  { header: 'UC Number', column: 'ucn' , section: 'Registration' },
  { header: 'Call Number', column: 'call_no' , section: 'Registration' },
  // A file loaded before the upload knew this spelling kept the date in `extra`.
  { header: 'Call Registeration Date', column: 'call_at', extra: ['Call Registeration Date'], kind: 'datetime' , section: 'Registration' },
  { header: 'Complaint Date', extra: ['Complaint Date'], kind: 'date' , section: 'Registration' },
  { header: 'Party Name', column: 'party_name' , section: 'Customer & Product' },
  { header: 'City', column: 'city' , section: 'Customer & Product' },
  { header: 'State', column: 'state' , section: 'Customer & Product' },
  { header: 'Product Name', column: 'item_name' , section: 'Customer & Product' },
  { header: 'Product Serial Number', column: 'serial' , section: 'Customer & Product' },
  { header: 'Item Status', column: 'item_status' , section: 'Customer & Product' },
  { header: 'Warranty Number', extra: ['Warranty Number', 'Warranty No', 'Warranty No.'] , section: 'Warranty & Contract' },
  { header: 'Warranty Start Date', column: 'warranty_start', kind: 'date' , section: 'Warranty & Contract' },
  { header: 'Warranty End Date', extra: ['Warranty End Date', 'Warranty End'], kind: 'date' , section: 'Warranty & Contract' },
  { header: 'Contract Number', extra: ['Contract Number', 'Contract No', 'Contract No.'] , section: 'Warranty & Contract' },
  { header: 'Contract Start Date', extra: ['Contract Start Date', 'Contract Start'], kind: 'date' , section: 'Warranty & Contract' },
  { header: 'Contract End Date', extra: ['Contract End Date', 'Contract End'], kind: 'date' , section: 'Warranty & Contract' },
  { header: 'Contract Type', column: 'contract_type' , section: 'Warranty & Contract' },
  { header: 'Call Type', column: 'call_type' , section: 'Registration' },
  { header: 'Standard Complaint', column: 'standard_complaint' , section: 'Complaint' },
  { header: 'Complaint Reported', column: 'complaint_reported' , section: 'Complaint' },
  { header: 'Call Allocated To', column: 'engineer' , section: 'Complaint' },
  { header: 'Breakdown Date', extra: ['Breakdown Date'], kind: 'date' , section: 'Complaint' },
  { header: 'Open/Close', extra: ['Open/Close', 'Open Close'] , section: 'Call Status' },
  { header: 'Call Status', column: 'call_status' , section: 'Call Status' },
  { header: 'Region', extra: ['Region'] , section: 'Customer & Product' },
  { header: 'Visiting Service Engineer', extra: ['Visiting Service Engineer'] , section: 'Visit & Report' },
  { header: 'Visit Date & Time', extra: ['Visit Date & Time', 'Visit Date and Time', 'Visit Date'], kind: 'datetime' , section: 'Visit & Report' },
  { header: 'CALL PENDING REASON', extra: ['CALL PENDING REASON', 'Pending Reason'] , section: 'Call Status' },
  { header: 'Complaint Observation', extra: ['Complaint Observation'] , section: 'Visit & Report' },
  { header: 'Job Done', extra: ['Job Done'] , section: 'Visit & Report' },
  { header: 'Service Report', extra: ['Service Report'] , section: 'Visit & Report' },
  // ONE MORE, BESIDE IT (the user, 2026-11-28: "one more Column for 'Drive
  // Link' - Which should present as a Drive Link"; asked, the files will CARRY
  // it -- no lookup). Service Report is an AppSheet path, not a link; this is
  // the file's own Drive URL, kept in `extra` like the others, opened as a link.
  { header: 'Drive Link', extra: ['Drive Link', 'Drive URL', 'Google Drive Link', 'Drive'], kind: 'link' , section: 'Visit & Report' },
  { header: 'Call Solved Date & Time', column: 'solved_at', kind: 'datetime' , section: 'Call Status' },
  { header: 'Call Canceled Date', extra: ['Call Canceled Date', 'Call Cancelled Date'], kind: 'date' , section: 'Call Status' },
];

/** The key a shaped row carries a format column's value under -- NAMED FROM
 *  THE HEADING, never its position: the table remembers each person's column
 *  order by key, and a positional key moved every later column whenever one
 *  was added or taken out (Drive Link, added at 35, came up FIRST on a layout
 *  saved before it). */
export const formatKey = (i: number) => `fmt_${squash(CALL_HISTORY_FORMAT[i].header)}`;

const pad = (n: number) => String(n).padStart(2, '0');

/** How a Call History status reads: a bare "Solved" is "Solved In Winmax". */
export function historyStatusLabel(v: unknown): string {
  const s = String(v ?? '').trim();
  return /^solved$/i.test(s) ? 'Solved In Winmax' : s;
}
/** Is this a solved call the old system closed without a completed report --
 *  shown light green rather than the full green of "Report Completed"? */
export function isLightSolved(v: unknown): boolean {
  const s = String(v ?? '').trim();
  return /^solved$/i.test(s) || /^solved in winmax$/i.test(s) || /waiting\s*for\s*manual\s*report/i.test(s);
}

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
    // A PLAIN "Solved" READS "Solved In Winmax" (the user, 2026-11-28) -- on the
    // list, in the pop-up and in the download. Stored as the file had it.
    if (c.column === 'call_status') { out[formatKey(i)] = historyStatusLabel(r.call_status); return; }
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

/** Headings taken out of the format and never shown, even if a file carries them. */
// Call Acceptance too (the user, 2026-11-28: "Call Acceptance - Field has been
// removed in the upload").
export const NOT_SHOWN = ['Call Acceptance', 'Engineer Email', 'Engineer E-mail', 'Engineer Email ID', 'Reporting Manager', 'Reporting Manager Email',
  'Regional Manager', 'Regional Manager Email'];

/** The headings the file carried that no format column shows -- kept with the
 *  call, and shown in its drawer so nothing the file said is out of sight. */
export function otherExtra(extra: unknown): [string, string][] {
  if (!extra || typeof extra !== 'object') return [];
  const shown = new Set([...CALL_HISTORY_FORMAT.flatMap((c) => [...(c.extra ?? []), ...(c.column ? [] : [c.header])]), ...NOT_SHOWN].map(squash));
  return Object.entries(extra as Record<string, unknown>)
    .filter(([k, v]) => !shown.has(squash(k)) && String(v ?? '').trim() !== '')
    .map(([k, v]) => [k, String(v)]);
}
