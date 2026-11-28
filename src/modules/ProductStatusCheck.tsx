import { useMemo, useState } from 'react';
import { DataTable, type Column } from '../components/table/DataTable';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { csvExport } from '../lib/format';
import { xlsxDownload, xlsxCell, xlsxText } from '../lib/xlsx';
import { formatDay, formatDayTime, todayLocal } from '../lib/dates';
import { logAudit } from '../lib/audit';
import { COMPLETE } from '../lib/exportscope';
import { financialImpact } from '../lib/productStatus';
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

type Row = ProductStatusRow & {
  id: string; group: string; charge: string; impact: boolean; impact_note: string;
};
// THE FINANCIAL RULE (the user, 2026-11-28) -- productStatus.ts, tested in check:ui.
const shape = (r: ProductStatusRow, i: number): Row => {
  const j = financialImpact(r.stored_status, r.correct_status, r.spares_requested ?? 0, r.spares_consumed ?? 0);
  return {
    ...r, id: `${r.ucn}-${i}`,
    group: `${r.stored_status || '(blank)'} → ${r.correct_status}`,
    charge: j.charge, impact: j.impact, impact_note: j.note,
  };
};

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
  { key: 'spares_requested', header: 'Spares requested on the call' },
  { key: 'spares_consumed', header: 'Spares consumed on the call' },
  { key: 'charge' as keyof ProductStatusRow, header: 'Spare charging (now → at registration)' },
  { key: 'impact_note' as keyof ProductStatusRow, header: 'Financial impact' },
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
  // WHICH CALLS TO CHANGE: groups narrow the list, ticks choose the calls.
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [impactView, setImpactView] = useState<'all' | 'none' | 'impact'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const check = async () => {
    setBusy('Checking every call…'); setMsg(null);
    try {
      const got = await productStatusReport();
      setRows(got.map(shape)); setPicked(new Set());
      setCheckedAt(new Date().toISOString());
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(''); }
  };

  const shown = useMemo(() => (rows ?? []).filter((r) =>
    (groups.size === 0 || groups.has(r.group))
    && (impactView === 'all' || (impactView === 'impact' ? r.impact : !r.impact))), [rows, groups, impactView]);
  const groupCounts = useMemo(() => {
    const m = new Map<string, { n: number; free: number }>();
    (rows ?? []).forEach((r) => { const g = m.get(r.group) ?? { n: 0, free: 0 }; g.n += 1; if (!r.impact) g.free += 1; m.set(r.group, g); });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [rows]);
  const pickedRows = useMemo(() => (rows ?? []).filter((r) => picked.has(r.id)), [rows, picked]);
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
    key: c.key as string, header: c.header, width: c.key === 'late_note' ? 260 : c.key === 'party_name' ? 220 : 140,
    render: c.date ? (r: Row) => {
      const v = r[c.key] as string | null;
      return v ? (c.date === 'day' ? formatDay(v) : formatDayTime(v)) : '';
    } : undefined,
  }));

  // THE REPORT IS WHAT IS SHOWN -- the groups and impact filter applied.
  const download = (kind: 'xlsx' | 'csv') => {
    const rows = shown;
    if (!rows.length) return;
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
          { Item: 'Spare requests to update', Value: String(rows.reduce((n, r) => n + r.spare_requests, 0)) },
          { Item: 'Scope', Value: [groups.size ? `groups: ${[...groups].join('; ')}` : 'every group', impactView === 'all' ? '' : impactView === 'none' ? 'no financial impact only' : 'financial impact only'].filter(Boolean).join(' · ') },
          { Item: 'Financial impact', Value: 'Spares are free under WGP and CMC and charged under OGP and AMC. Impact: the call read free (WGP / CMC) and the correct status is charged (OGP / AMC) -- CMC to OGP, CMC to AMC, WGP to OGP, WGP to AMC -- unless no spare was requested or consumed on the call. Every other change (e.g. OGP to CMC, OGP to AMC, WGP to CMC) has none.' },
          { Item: 'Checked', Value: checkedAt ? formatDayTime(checkedAt) : '' },
        ] },
      ], COMPLETE);
    }
    logAudit({ action: 'report.product_status_check', meta: { rows: rows.length, kind } });
  };

  // ONLY THE TICKED CALLS (the user, 2026-11-28: "Give me option to Change only
  // Specific Calls").
  const fixPicked = async () => {
    const chosen = pickedRows;
    if (!chosen.length || !mayFix) return;
    const sp = chosen.reduce((n, r) => n + r.spare_requests, 0);
    const imp = chosen.filter((r) => r.impact).length;
    if (!confirm(`Update ${chosen.length.toLocaleString()} selected call${chosen.length === 1 ? '' : 's'} to the status they had at registration?\n\n${sp.toLocaleString()} spare request${sp === 1 ? '' : 's'} on them will follow.${imp ? `\n\n⚠ ${imp} of them change spare charging on a call with a spare request — a financial impact.` : '\n\nNone of them has a financial impact.'}\n\nTake the report first if you want a copy of what is about to change.`)) return;
    const ucns = [...new Set(chosen.map((r) => r.ucn))];
    let calls = 0; let spares = 0; let notFollowed = 0;
    try {
      for (let i = 0; i < ucns.length; i += 200) {
        setBusy(`Updating ${Math.min(i + 200, ucns.length).toLocaleString()} / ${ucns.length.toLocaleString()}…`);
        const r = await fixProductStatus(ucns.slice(i, i + 200));
        calls += r.calls; spares += r.spare_requests; notFollowed += r.spare_requests_not_followed;
      }
      logAudit({ action: 'product_status.fix', meta: { calls, spares, chosen: ucns.length } });
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
            ? <button className="btn btn-danger" disabled={!pickedRows.length || !!busy} onClick={() => void fixPicked()}>✔ Update selected {pickedRows.length ? pickedRows.length.toLocaleString() : ''}</button>
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
        {rows && rows.length > 0 && (
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12 }}>Groups:</span>
              {groupCounts.map(([g, c]) => (
                <button key={g} className={`chip ${groups.has(g) ? 'chip-on' : ''}`}
                  title={`${c.n} call${c.n === 1 ? '' : 's'}, ${c.free} with no financial impact`}
                  onClick={() => setGroups((s0) => { const n = new Set(s0); if (n.has(g)) n.delete(g); else n.add(g); return n; })}>
                  {g} <b>{c.n.toLocaleString()}</b>
                </button>
              ))}
              {groups.size > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setGroups(new Set())}>✕ All groups</button>}
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12 }}>Financial impact:</span>
              {([['all', 'All'], ['none', 'No financial impact'], ['impact', 'Financial impact']] as const).map(([k, l]) => (
                <button key={k} className={`chip ${impactView === k ? 'chip-on' : ''}`} onClick={() => setImpactView(k)}>
                  {l} <b>{(k === 'all' ? rows.length : rows.filter((r) => (k === 'impact' ? r.impact : !r.impact)).length).toLocaleString()}</b>
                </button>
              ))}
              <div className="spacer" />
              <button className="btn btn-sm" disabled={!shown.length} onClick={() => setPicked(new Set(shown.map((r) => r.id)))}>☑ Select all shown ({shown.length.toLocaleString()})</button>
              <button className="btn btn-sm" disabled={!shown.some((r) => !r.impact)}
                onClick={() => setPicked(new Set(shown.filter((r) => !r.impact).map((r) => r.id)))}>☑ Select shown with no financial impact</button>
              <button className="btn btn-ghost btn-sm" disabled={!picked.size} onClick={() => setPicked(new Set())}>Clear selection</button>
              <span className="muted" style={{ fontSize: 12 }}>{picked.size.toLocaleString()} selected</span>
            </div>
          </div>
        )}
      </SectionCard>
      <div style={{ height: 12 }} />
      <DataTable<Row> columns={cols} rows={shown} getRowId={(r) => r.id} storageKey="product-status-check"
        selectable={mayFix} selected={picked} onSelectedChange={setPicked}
        emptyText={busy ? 'Checking…' : rows ? 'Every call’s status matches its cover at registration.' : 'Press “Check every call”.'} />
    </div>
  );
}

export default ProductStatusCheck;
