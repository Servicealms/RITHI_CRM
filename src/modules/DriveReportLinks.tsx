import { useState } from 'react';
import { parseCSV } from '../lib/csv';
import { findHeaderFor } from '../lib/headers';
import { mapReportDriveLinks, type DriveLinkResult } from '../lib/supabase';
import { logAudit } from '../lib/audit';

// ===========================================================================
// DRIVE REPORT LINKS -> LIVE VISITS, BY UID (0505; the user, 2026-11-28: "I
// want to be able to Map Drive Links to the Live calls as well ... I want to
// upload Drive Report Links"). Asked, chose: matched by the VISIT'S UID; a
// visit that already has a report link is KEPT (skipped, named); a UID with no
// visit is HELD BACK (named) -- nothing is ever created, no status moves.
//
// The file needs two columns: the visit's UID and its Drive link. The link is
// what the call's "📄 Service Report" opens.
// ===========================================================================

const UID_ALIASES = ['uid', 'visit uid', 'report uid', 'visit id', 'row id'];
const LINK_ALIASES = ['drive link', 'drive url', 'google drive link', 'report link', 'service report link', 'link', 'manual report', 'service report'];

export function DriveReportLinks() {
  const [rows, setRows] = useState<{ uid: string; link: string }[] | null>(null);
  const [file, setFile] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [res, setRes] = useState<DriveLinkResult | null>(null);

  const pick = async (f: File | null) => {
    setMsg(null); setRes(null); setRows(null);
    if (!f) return;
    try {
      const raw = parseCSV(await f.text(), { aliases: [...UID_ALIASES, ...LINK_ALIASES] });
      const heads = raw.length ? Object.keys(raw[0]) : [];
      const hUid = findHeaderFor(heads, UID_ALIASES);
      const hLink = findHeaderFor(heads, LINK_ALIASES);
      if (!hUid || !hLink) {
        setMsg({ tone: 'error', text: `The file needs a UID column and a Drive Link column. Found: ${heads.join(', ') || 'no headings'}.` });
        return;
      }
      const got = raw.map((r) => ({ uid: String(r[hUid] ?? '').trim(), link: String(r[hLink] ?? '').trim() }))
        .filter((r) => r.uid || r.link);
      if (!got.length) { setMsg({ tone: 'error', text: 'That file has no rows.' }); return; }
      setFile(f.name); setRows(got);
    } catch (e) {
      setMsg({ tone: 'error', text: `Could not read that file: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const run = async () => {
    if (!rows?.length) return;
    if (!confirm(`Map ${rows.length} Drive link${rows.length === 1 ? '' : 's'} to visits by UID?\n\nOnly a visit with no report link is filled. A visit that already has one is kept, and a UID with no visit is held back — both are listed afterwards. No visit is created and no call status changes.`)) return;
    setBusy('Mapping…'); setMsg(null);
    try {
      const r = await mapReportDriveLinks(rows, (d, t) => setBusy(`Mapping ${d} / ${t}…`));
      setRes(r); setRows(null);
      logAudit({ action: 'report.drive_links', meta: { file, rows: r.rows, mapped: r.mapped, already: r.already, not_found: r.not_found, bad_link: r.bad_link } });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(''); }
  };

  const list = (title: string, uids: string[], n: number) => n > 0 && (
    <details style={{ marginTop: 6 }}>
      <summary style={{ cursor: 'pointer' }}>{title} · {n.toLocaleString()}</summary>
      <div className="muted" style={{ fontSize: 12, marginTop: 4, wordBreak: 'break-word' }}>
        {uids.join(', ')}{n > uids.length ? ` … and ${(n - uids.length).toLocaleString()} more` : ''}
      </div>
    </details>
  );

  return (
    <div className="rbac-page-row" style={{ display: 'block', padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ minWidth: 260 }}>Drive Report Links — map to visits by UID</b>
        <input type="file" accept=".csv,text/csv" className="input" style={{ maxWidth: 260 }}
          disabled={!!busy} onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
        {rows && <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void run()}>⤵ Map {rows.length.toLocaleString()} link{rows.length === 1 ? '' : 's'}</button>}
        {busy && <span className="muted">{busy}</span>}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        A CSV with the visit&rsquo;s <b>UID</b> and its <b>Drive Link</b>. Each link goes on the visit with that UID, where the call&rsquo;s 📄 Service Report opens it.
        Only a visit with <b>no report link</b> is filled; one that already has a link is kept. A UID that matches no visit is held back. No visit is created and no call&rsquo;s status changes.
      </div>
      {msg && <div className={`sheet-banner ${msg.tone === 'ok' ? 'sheet-banner-ok' : 'sheet-banner-error'}`} style={{ marginTop: 8 }}><span>{msg.text}</span></div>}
      {res && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <div><b>{res.mapped.toLocaleString()}</b> of {res.rows.toLocaleString()} mapped.
            {res.already ? ` ${res.already.toLocaleString()} already had a link (kept).` : ''}
            {res.not_found ? ` ${res.not_found.toLocaleString()} UID${res.not_found === 1 ? '' : 's'} matched no visit.` : ''}
            {res.bad_link ? ` ${res.bad_link.toLocaleString()} had a value that is not a web link.` : ''}
            {res.blank_uid ? ` ${res.blank_uid.toLocaleString()} had no UID.` : ''}</div>
          {list('Already had a link — kept', res.already_uids, res.already)}
          {list('UID matched no visit — held back', res.not_found_uids, res.not_found)}
          {list('Not a web link — refused', res.bad_link_uids, res.bad_link)}
        </div>
      )}
    </div>
  );
}
