import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { supabaseConfigured, getPmHideRules, setPmHideRule, PM_HIDE_ALL_MISSED_KEY, PM_HIDE_UNSOLVED_MISSED_KEY, PM_HIDE_CANCELLED_MISSED_KEY, type PmHideRuleKey } from '../lib/supabase';
import type { PmHideRules } from '../lib/missedPm';

// ===========================================================================
// ADMIN CONFIG -> PM CALLS: THE MISSED PM HIDE RULES -- three tick boxes, any
// of them on (the user, 2026-11-27: "Hide All PM Calls with Flag Missed PM,
// Hide All Unsolved PM Calls with Flag Missed PM, Hide All Canceled PM Calls
// with Flag Missed PM. It is multiple tick box."). The unsolved box is the
// 2026-11-26 rule ("hide ... Missed PM, Only if they are Unsolved"), which hid
// cancelled calls too until cancelled got a box of its own.
//
// A Missed PM call is one Added On after the month it is registered for
// (missedPm.ts). Either rule applies to the PM Calls register, Pending Calls
// and the search at the top; no line there says how many (the user, 2026-11-27:
// "Remove the line"). View rules
// only: no call is changed, and switching them off shows the calls again.
// ===========================================================================
const RULES: { key: PmHideRuleKey; field: keyof PmHideRules; label: string; on: string }[] = [
  { key: PM_HIDE_ALL_MISSED_KEY, field: 'all',
    label: 'Hide all PM calls flagged Missed PM',
    on: 'On. Every Missed PM call is hidden, solved ones too.' },
  { key: PM_HIDE_UNSOLVED_MISSED_KEY, field: 'unsolved',
    label: 'Hide all unsolved PM calls flagged Missed PM',
    on: 'On. Missed PM calls that are not solved (open, report pending or reopened) are hidden.' },
  { key: PM_HIDE_CANCELLED_MISSED_KEY, field: 'cancelled',
    label: 'Hide all cancelled PM calls flagged Missed PM',
    on: 'On. Cancelled Missed PM calls are hidden.' },
];

export function PmHideRuleCard() {
  const { can } = useAuth();
  const may = can('config.manage');
  const [rules, setRules] = useState<PmHideRules | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) { setMsg({ tone: 'info', text: 'Connect the database to use this.' }); return; }
    getPmHideRules().then(setRules)
      .catch((e: unknown) => setMsg({ tone: 'error', text: `Could not read the settings: ${e instanceof Error ? e.message : String(e)}` }));
  }, []);

  const flip = async (r: typeof RULES[number], next: boolean) => {
    if (!rules) return;
    setBusy(true); setMsg(null);
    const res = await setPmHideRule(r.key, next);
    setBusy(false);
    logAudit({ action: `config.${r.key.replace('pm.', 'pm_')}`, target: next ? 'on' : 'off', status: res.ok ? 'ok' : 'error', error: res.error });
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Not saved.' }); return; }
    const now = { ...rules, [r.field]: next };
    setRules(now);
    setMsg({ tone: 'ok', text: next ? r.on
      : now.all || now.unsolved || now.cancelled ? 'Off. The other ticked rules still apply.' : 'Off. The PM Calls register shows every call.' });
  };

  return (
    <SectionCard title="PM Calls — hide Missed PM calls">
      <p className="muted" style={{ marginTop: 0 }}>
        A <b>Missed PM</b> is a PM call added after the month it is registered for. Tick any of these: the PM Calls
        register, Pending Calls and the search at the top leave out the Missed PM calls each ticked rule names.
        No note on those screens says calls were left out. Field and Installation calls are never affected. No call is changed, and unticking
        a rule shows its calls again.
      </p>
      {RULES.map((r) => (
        <label key={r.key} className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input type="checkbox" checked={!!rules?.[r.field]} disabled={!may || busy || rules === null}
            onChange={(e) => void flip(r, e.target.checked)} />
          <span>{r.label}</span>
        </label>
      ))}
      {!may && <p className="muted" style={{ fontSize: 12 }}>Changing these needs the Admin config permission.</p>}
      {msg && <div className={`sheet-banner sheet-banner-${msg.tone}`} style={{ marginTop: 8 }}><span>{msg.text}</span></div>}
    </SectionCard>
  );
}
