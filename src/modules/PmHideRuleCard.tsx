import { useEffect, useState } from 'react';
import { SectionCard } from '../components/ui/ui';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { supabaseConfigured, getPmHideUnsolvedMissed, setPmHideUnsolvedMissed } from '../lib/supabase';

// ===========================================================================
// ADMIN CONFIG -> PM CALLS: HIDE UNSOLVED MISSED PM CALLS (the user,
// 2026-11-26: "Add a Provision for ADMIN to hide Calls Added and Flagged as
// Missed PM, Only if they are Unsolved - Basically, I want to Set a Rule to
// Hide Certain Calls in PM. It is ok to Show it in the List if they are
// Solved.").
//
// A Missed PM call is one Added On after the month it is registered for
// (missedPm.ts). With the rule on, the PM Calls register leaves such a call out
// unless it is Solved -- a cancelled one too -- and says how many. It is
// a view rule: no call is changed, and switching it off shows them all again.
// ===========================================================================
export function PmHideRuleCard() {
  const { can } = useAuth();
  const may = can('config.manage');
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) { setMsg({ tone: 'info', text: 'Connect the database to use this.' }); return; }
    getPmHideUnsolvedMissed().then(setOn).catch((e) => setMsg({ tone: 'error', text: `Could not read the setting: ${e instanceof Error ? e.message : String(e)}` }));
  }, []);

  const flip = async (next: boolean) => {
    setBusy(true); setMsg(null);
    const res = await setPmHideUnsolvedMissed(next);
    setBusy(false);
    logAudit({ action: 'config.pm_hide_unsolved_missed', target: next ? 'on' : 'off', status: res.ok ? 'ok' : 'error', error: res.error });
    if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? 'Not saved.' }); return; }
    setOn(next);
    setMsg({ tone: 'ok', text: next
      ? 'On. PM Calls, Pending Calls and search hide Missed PM calls that are not solved, cancelled ones included.'
      : 'Off. The PM Calls register shows every call.' });
  };

  return (
    <SectionCard title="PM Calls — hide unsolved Missed PM calls">
      <p className="muted" style={{ marginTop: 0 }}>
        A <b>Missed PM</b> is a PM call added after the month it is registered for. With this on, the PM Calls
        register, Pending Calls and the search at the top leave out a Missed PM call unless it is <b>solved</b> (a
        cancelled one is left out too), and say how many they left out. Field and Installation calls are never
        affected. No call is changed, and switching this off shows them all.
      </p>
      <label className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={!!on} disabled={!may || busy || on === null} onChange={(e) => void flip(e.target.checked)} />
        <span>Hide unsolved Missed PM calls on the PM Calls register</span>
      </label>
      {!may && <p className="muted" style={{ fontSize: 12 }}>Changing this needs the Admin config permission.</p>}
      {msg && <div className={`sheet-banner sheet-banner-${msg.tone}`} style={{ marginTop: 8 }}><span>{msg.text}</span></div>}
    </SectionCard>
  );
}
