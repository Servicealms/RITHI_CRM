import { useRef, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { latestManualReports } from '../lib/supabase';
import { fetchAppDocument } from '../lib/sheets';
import { driveFileId } from '../lib/drive';
import { cropReportBox } from '../lib/reportOcr';
import { formatDay } from '../lib/dates';

// ===========================================================================
// REPORT READER TRIAL -- PHASE A (the user, 2026-11-17: "Crop and send", then
// "yes" to building this first).
//
// The question Phase A answers, before any reading service is set up: can the
// app find the "Call No/UC No + Service Visit Date" box on our real report
// photos, and cut out ONLY that box? It takes the latest visits with a manual
// report, opens each photo through the bridge every report viewer already
// uses, finds the printed label on the device and shows the cut-out beside the
// photo -- for a person to judge by eye.
//
// NOTHING IS SENT ANYWHERE. The photo is read and cropped in this browser; the
// reader is served from the app itself. Phase B (sending the crop to be read)
// needs an API key and the user's go-ahead, and is not here.
//
// PDFs: page 1 is drawn in the browser by pdf.js (the first run found 15 of
// the latest 20 reports were PDFs). A photo taken sideways is tried turned.
// v0.10.254: the box is found FIRST by the form's ruled lines, and by the
// printed label only when the lines give nothing; each result says which.
// ===========================================================================

interface Row {
  n: number; ucn: string; visit: string; status: 'waiting' | 'reading' | 'found' | 'not found' | 'failed';
  note: string; crop: string; thumb: string; anchor: string; ms: number;
}

export function ReportReaderTrialCard() {
  const { can } = useAuth();
  const [count, setCount] = useState('20');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const stop = useRef(false);
  if (!can('config.manage')) return null;

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const run = async () => {
    setErr(''); setBusy(true); stop.current = false;
    try {
      const n = Math.max(1, Math.min(200, Math.floor(Number(count) || 20)));
      const visits = await latestManualReports(n);
      const start: Row[] = visits.map((v, i) => ({
        n: i + 1, ucn: v.ucn, visit: v.visit_at ? formatDay(v.visit_at) : '', status: 'waiting',
        note: '', crop: '', thumb: '', anchor: '', ms: 0,
      }));
      setRows(start);
      for (let i = 0; i < visits.length; i++) {
        if (stop.current) break;
        set(i, { status: 'reading' });
        const id = driveFileId(visits[i].manual_report);
        if (!id) { set(i, { status: 'failed', note: 'no Drive file id in the link' }); continue; }
        const got = await fetchAppDocument(id);
        if (!got.ok || !got.doc) { set(i, { status: 'failed', note: got.error ?? 'could not open the file' }); continue; }
        const mime = got.doc.mimeType || '';
        if (!/^image\//i.test(mime) && !/pdf/i.test(mime)) { set(i, { status: 'failed', note: `not a photo or PDF (${mime || 'unknown type'})` }); continue; }
        try {
          const bytes = Uint8Array.from(atob(got.doc.dataBase64), (ch) => ch.charCodeAt(0));
          const r = await cropReportBox(new Blob([bytes], { type: mime }));
          set(i, {
            status: r.box ? 'found' : 'not found',
            note: (r.source === 'pdf' ? 'PDF page 1 · ' : 'photo · ')
              + (r.box ? `${r.method === 'lines' ? `by the ruled lines, label read as "${r.box.label}"` : `by the printed label "${r.box.label}"`}${r.turned ? `, turned ${r.turned}°` : ''}${r.skew ? `, levelled ${r.skew}°` : ''}` : r.why),
            crop: r.crop, thumb: r.thumb, anchor: r.box?.anchor ?? '', ms: r.ms,
          });
        } catch (e) {
          set(i, { status: 'failed', note: `could not read the photo: ${e instanceof Error ? e.message : String(e)}` });
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const tally = (s: Row['status']) => rows.filter((r) => r.status === s).length;

  return (
    <SectionCard title="Report reader trial — Phase A (crop only)">
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Finds the <b>Call No/UC No + Service Visit Date</b> box on the latest manual report photos and shows the cut-out,
        so you can check by eye that it is the right box and holds nothing else. The box is found by the form's ruled lines
        (the label column and its rows), and by the printed label only when the lines give nothing. Everything happens in this browser:
        the photo (or page 1 of a PDF) is read and cropped here and <b>nothing is sent anywhere</b>. A sideways photo is tried turned.
        The first run downloads the reader (about 7 MB) from this app; a report takes a few seconds, longer when it has to be turned.
      </p>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field" style={{ width: 140 }}><span className="field-label">Latest reports</span>
          <input className="input" inputMode="numeric" value={count} disabled={busy} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} /></label>
        <button className="btn btn-primary" disabled={busy} onClick={() => void run()}>{busy ? 'Reading…' : '▶ Run the trial'}</button>
        {busy && <button className="btn" onClick={() => { stop.current = true; }}>Stop</button>}
      </div>
      {err && <div className="sheet-banner sheet-banner-error" style={{ marginTop: 8 }}><span>{err}</span></div>}
      {rows.length > 0 && (
        <p style={{ fontSize: 13, margin: '10px 0 6px' }}>
          <b>{rows.length}</b> reports · box found <b>{tally('found')}</b>
          {tally('found') > 0 && <> (by lines {rows.filter((r) => r.status === 'found' && r.note.includes('ruled lines')).length})</>} · not found <b>{tally('not found')}</b> ·
          could not open <b>{tally('failed')}</b>
          {busy && <> · reading…</>}
        </p>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="assoc-table" style={{ minWidth: 760 }}>
            <thead><tr><th>#</th><th>UCN</th><th>Visit Date</th><th>Result</th><th>Cut-out (what would be sent)</th><th>Photo</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.n}>
                  <td>{r.n}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.ucn}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.visit}</td>
                  <td style={{ minWidth: 160 }}>
                    <b>{r.status === 'found' ? 'Box found' : r.status === 'not found' ? 'Not found' : r.status === 'failed' ? 'Could not open' : r.status === 'reading' ? 'Reading…' : 'Waiting'}</b>
                    {r.note && <div className="muted" style={{ fontSize: 11.5 }}>{r.note}</div>}
                    {r.ms > 0 && <div className="muted" style={{ fontSize: 11 }}>{(r.ms / 1000).toFixed(1)} s</div>}
                  </td>
                  <td>{r.crop ? <img src={r.crop} alt={`Cut-out for ${r.ucn}`} style={{ maxWidth: 320, maxHeight: 160, border: '1px solid var(--border, #ccc)' }} /> : <span className="muted">—</span>}</td>
                  <td>{r.thumb ? <img src={r.thumb} alt={`Report photo for ${r.ucn}`} style={{ maxWidth: 180, maxHeight: 140 }} /> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
