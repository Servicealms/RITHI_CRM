import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { supabaseConfigured, getFfrCapaNoneLabel, setFfrCapaNoneLabel } from '../lib/supabase';

// ===========================================================================
// ADMIN CONFIG -> FIELD FAILURE REPORT: THE "NO CAPA" WORDS (0494, the user,
// 2026-11-26: "Reword "CAPA Not Required" to "No", add a Provision in Admin
// Config to Change this and Apply it to all Records").
//
// The first choice of CAPA (if reqd) Responsibility. Saving new words stores
// them AND rewrites every report reading the old ones (or any earlier wording)
// in the same call -- a setting that changed the picker and left the records
// would leave two wordings for one answer. Each report's change is in its own
// history; its last-updated date is left as it was. Changing it asks
// config.manage, as the database does.
// ===========================================================================
export function FfrCapaLabelCard() {
  const { can } = useAuth();
  const may = can('config.manage');
  const [current, setCurrent] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) { setMsg({ tone: 'info', text: 'Connect the database to use this.' }); return; }
    getFfrCapaNoneLabel()
      .then((w) => { setCurrent(w); setDraft(w); })
      .catch((e) => setMsg({ tone: 'error', text: `Could not read the setting: ${e instanceof Error ? e.message : String(e)}` }));
  }, []);

  const save = async () => {
    const words = draft.trim();
    if (!words) { setMsg({ tone: 'error', text: 'Give the words -- they cannot be blank.' }); return; }
    if (!window.confirm(`Change "${current}" to "${words}"?\n\nEvery Field Failure Report reading "${current}" (or an earlier wording of it) will read "${words}". Each change is kept in the report's history.`)) return;
    setBusy(true); setMsg(null);
    const res = await setFfrCapaNoneLabel(words);
    setBusy(false);
    logAudit({ action: 'config.ffr_capa_none_label', target: words, status: res.ok ? 'ok' : 'error', error: res.error, meta: { from: current, changed: res.changed } });
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Not saved.' }); return; }
    setCurrent(words);
    setMsg({ tone: 'ok', text: `Saved. ${res.changed ?? 0} report${res.changed === 1 ? '' : 's'} now read "${words}".` });
  };

  return (
    <SectionCard title="Field Failure Report — CAPA (if reqd) Responsibility">
      <p className="muted" style={{ marginTop: 0 }}>
        The first choice in CAPA (if reqd) Responsibility, for a report that needs no CAPA. Changing it changes it on
        every report that reads it, and a file or sheet still carrying an earlier wording is saved with this one.
      </p>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field" style={{ minWidth: 240 }}>
          <span className="field-label">Words for "no CAPA"</span>
          <input className="input" value={draft} disabled={!may || busy} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={!may || busy || !draft.trim() || draft.trim() === current}
          onClick={() => void save()}>{busy ? 'Applying…' : 'Save and apply to all reports'}</button>
      </div>
      {!may && <p className="muted" style={{ fontSize: 12 }}>Changing this needs the Admin config permission.</p>}
      {msg && <div className={`sheet-banner sheet-banner-${msg.tone}`} style={{ marginTop: 8 }}><span>{msg.text}</span></div>}
    </SectionCard>
  );
}
