import { useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { csvExport } from '../lib/format';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import { logAudit } from '../lib/audit';
import { COMPLETE } from '../lib/exportscope';
import { supabaseConfigured, productStatusReport, fixProductStatus, type ProductStatusRow } from '../lib/supabase';

// ===========================================================================
// PRODUCT STATUS CHECK (0506; NAR-031). Every call's Item Status against its
// cover AS IT STOOD WHEN THE CALL WAS REGISTERED -- only a warranty or
// contract entered by then counts -- the mismatches listed with the spare
// requests each would move, a report to take away first, then one update.
// The user, 2026-11-28: "List all Mismatches and Update it - Do this in a
// Separate Screen. Non Auditable ... When i update all Affected Spare Request
// should also show and Update - But i should be able to get this as a Report
// before I update." Hidden in Audit Mode; the database refuses it there too.
// ===========================================================================

type Row = ProductStatusRow & { id: string };

const COLUMNS: { key: keyof ProductStatusRow; header: string; date?: 'day' | 'time' }[] = [
  { key: 'ucn', header: 'UC No.' },
  { key: 'register', header: 'Call Type' },
  { key: 'reg_at', header: 'Registered', date: 'time' },
  { key: 'party_name', header: 'Party' },
  { key: 'product_name', header: 'Product' },
  { key: 'serial', header: 'Serial' },
  { key: 'stored_status', header: 'Status on the call' },
  { key: 'correct_status', header: 'Status at registration' },
  { key: 'cover_ref', header: 'Cover counted (SA / MC No.)' },
  { key: 'late_ref', header: 'Entered after registration (SA / MC No.)' },
  { key: 'late_note', header: 'Note' },
  { key: 'late_entered_at', header: 'Entry time', date: 'time' },
  { key: 'spare_requests', header: 'Spare requests to update' },
  { key: 'spare_request_refs', header: 'Spare requests (OR No.)' },
];

export function ProductStatusCheck() {
  const { can } = useAuth();
  const mayFix = can('calls.edit') || can('calls.edit.customer');
  const mayExport = can('export.data');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [checkedAt, setCheckedAt] = useState('');

  const check = async () => {
    setBusy('Checking every call…'); setMsg(null);
    try {
      const got = await productStatusReport();
      setRows(got.map((r, i) => ({ ...r, id: `${r.ucn}-${i}` })));
      setCheckedAt(new Date().toISOString());
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(''); }
  };

  const totals = useMemo(() => {
    const t = { calls: rows?.length ?? 0, spares: 0, late: 0, moves: new Map<string, number>() };
    (rows ?? []).forEach((r) => {
      t.spares += r.spare_requests; if (r.late_ref) t.late += 1;
      const k = `${r.stored_status || '(blank)'} → ${r.correct_status}`;
      t.moves.set(k, (t.moves.get(k) ?? 0) + 1);
    });
    return t;
  }, [rows]);

  const cols: Column<Row>[] = COLUMNS.map((c) => ({
    key: c.key, header: c.header, width: c.key === 'late_note' ? 260 : c.key === 'party_name' ? 220 : 140,
    render: c.date ? (r: Row) => {
      const v = r[c.key] as string | null;
      return v ? (c.date === 'day' ? formatDay(v) : formatDayTime(v)) : '';
    } : undefined,
  }));

  const download = (kind: 'xlsx' | 'csv') => {
    if (!rows?.length) return;
    const name = `product-status-check-${todayLocal()}`;
    if (kind === 'csv') {
      csvExport(`${name}.csv`, COLUMNS.map((c) => ({ key: String(c.key), header: c.header })),
        rows.map((r) => Object.fromEntries(COLUMNS.map((c) => [c.key, xlsxText(r[c.key] ?? '')]))), COMPLETE);
    } else {
      xlsxDownload(`${name}.xlsx`, [
        { name: 'Mismatches', columns: COLUMNS.map((c) => c.header),
          rows: rows.map((r) => Object.fromEntries(COLUMNS.map((c) => [c.header, xlsxCell(r[c.key] ?? '')]))) },
        { name: 'About', columns: ['Item', 'Value'], rows: [
          { Item: 'Report', Value: 'Product Status Check — each call’s Item Status against its cover at registration' },
          { Item: 'Rule', Value: 'Only a warranty or contract entered by the time the call was registered counts; of those, the one running on the registration date: warranty WGP, else the contract’s cover, else OGP.' },
          { Item: 'Calls', Value: String(rows.length) },
          { Item: 'Spare requests to update', Value: String(totals.spares) },
          { Item: 'Checked', Value: checkedAt ? formatDayTime(checkedAt) : '' },
        ] },
      ], COMPLETE);
    }
    logAudit({ action: 'report.product_status_check', meta: { rows: rows.length, kind } });
  };

  const fixAll = async () => {
    if (!rows?.length || !mayFix) return;
    if (!confirm(`Update ${rows.length.toLocaleString()} call${rows.length === 1 ? '' : 's'} to the status they had at registration?\n\n${totals.spares.toLocaleString()} spare request${totals.spares === 1 ? '' : 's'} on them will follow.\n\nTake the report first if you want a copy of what is about to change.`)) return;
    const ucns = [...new Set(rows.map((r) => r.ucn))];
    let calls = 0; let spares = 0; let notFollowed = 0;
    try {
      for (let i = 0; i < ucns.length; i += 200) {
        setBusy(`Updating ${Math.min(i + 200, ucns.length).toLocaleString()} / ${ucns.length.toLocaleString()}…`);
        const r = await fixProductStatus(ucns.slice(i, i + 200));
        calls += r.calls; spares += r.spare_requests; notFollowed += r.spare_requests_not_followed;
      }
      logAudit({ action: 'product_status.fix', meta: { calls, spares } });
      setMsg({ tone: 'ok', text: `${calls.toLocaleString()} call${calls === 1 ? '' : 's'} and ${spares.toLocaleString()} spare request${spares === 1 ? '' : 's'} updated.${notFollowed ? ` ${notFollowed} spare request${notFollowed === 1 ? '' : 's'} did not follow — the check below lists their calls again.` : ''}` });
    } catch (e) {
      setMsg({ tone: 'error', text: `${e instanceof Error ? e.message : String(e)} (${calls} call${calls === 1 ? '' : 's'} updated before it stopped)` });
    } finally {
      setBusy('');
      await check();
    }
  };

  if (!supabaseConfigured()) return <div style={{ padding: 24 }} className="muted">Connect the database in Settings first.</div>;

  return (
    <div>
      <PageHeader title="Product Status Check" icon="🩺"
        subtitle="Every call’s Item Status against its cover at the moment it was registered — only a warranty or contract entered by then counts. List the mismatches, take the report, then update them and their spare requests." />
      <SectionCard title="Check">
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={!!busy} onClick={() => void check()}>{rows ? '↻ Check again' : '🩺 Check every call'}</button>
          {mayExport && <button className="btn btn-ghost btn-sm" disabled={!rows?.length || !!busy} onClick={() => download('xlsx')}>⭳ Report (Excel)</button>}
          {mayExport && <button className="btn btn-ghost btn-sm" disabled={!rows?.length || !!busy} onClick={() => download('csv')}>⭳ CSV</button>}
          <div className="spacer" />
          {mayFix
            ? <button className="btn btn-danger" disabled={!rows?.length || !!busy} onClick={() => void fixAll()}>✔ Update all {rows?.length ? rows.length.toLocaleString() : ''}</button>
            : <span className="muted" style={{ fontSize: 12 }}>Updating needs Edit call (or Edit customer &amp; product) on Roles &amp; Permissions.</span>}
          {busy && <span className="muted">{busy}</span>}
        </div>
        {msg && <div className={`sheet-banner ${msg.tone === 'ok' ? 'sheet-banner-ok' : 'sheet-banner-error'}`} style={{ marginTop: 10 }}><span>{msg.text}</span></div>}
        {rows && (
          <p style={{ marginBottom: 0, fontSize: 13 }}>
            <b>{totals.calls.toLocaleString()}</b> call{totals.calls === 1 ? '' : 's'} with a different status at registration
            {totals.calls ? <> — {[...totals.moves.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n.toLocaleString()}`).join(' · ')}</> : null}.
            {' '}<b>{totals.spares.toLocaleString()}</b> spare request{totals.spares === 1 ? '' : 's'} would follow.
            {totals.late ? <> {totals.late.toLocaleString()} had a warranty or contract entered after the call was registered.</> : null}
            {checkedAt ? <span className="muted"> Checked {formatDayTime(checkedAt)}.</span> : null}
          </p>
        )}
      </SectionCard>
      <div style={{ height: 12 }} />
      <DataTable<Row> columns={cols} rows={rows ?? []} getRowId={(r) => r.id} storageKey="product-status-check"
        emptyText={busy ? 'Checking…' : rows ? 'Every call’s status matches its cover at registration.' : 'Press “Check every call”.'} />
    </div>
  );
}

export default ProductStatusCheck;
