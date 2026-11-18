// ===========================================================================
// RUN THE DAILY CUT-OUTS FOR A CHOSEN DAY -- a Supabase Edge Function (Deno).
// The user, 2026-11-18: "Add a provision to run it manually for a choosen
// date" -- chosen: a button in RITHI.
//
// POST { action: 'run', date: 'YYYY-MM-DD' } starts the GitHub workflow
//   daily-report-crops.yml for the visits ENTERED on that India-time day
//   (visits already cropped are skipped by the job itself).
// POST { action: 'status' } lists the latest runs of that workflow -- their
//   title names the day asked for -- so the screen can say when it is done.
//
// WHO: a signed-in holder of visitdate.check (has_perm under the CALLER'S
// token) -- the same key that sends reports to be read; an administrator for
// now. The GitHub token lives ONLY in this function's secrets
// (GITHUB_DISPATCH_TOKEN: a fine-grained token on this one repository with
// Actions: Read and write), never in the app.
// Deployed by .github/workflows/deploy-functions.yml, WITH JWT verification.
// ===========================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GH = Deno.env.get('GITHUB_DISPATCH_TOKEN') ?? '';
const REPO = 'neurolooom-eng/RITHI_CRM';
const WORKFLOW = 'daily-report-crops.yml';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function holds(auth: string, action: string): Promise<boolean> {
  if (!SUPABASE_URL || !ANON || !auth) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_perm`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  return r.ok && (await r.json()) === true;
}

const gh = (path: string, init: RequestInit = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, {
  ...init,
  headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
             'User-Agent': 'rithi-run-daily-crops', ...(init.headers ?? {}) },
});

/** Today in India, YYYY-MM-DD. */
const indiaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!GH) return json({ error: 'GITHUB_DISPATCH_TOKEN is not set on this function (Edge Functions -> Secrets)' }, 503);
  if (!(await holds(req.headers.get('Authorization') ?? '', 'visitdate.check'))) {
    return json({ error: 'Only a holder of Visit Date Check (an administrator for now) may start the cut-outs' }, 403);
  }
  let body: { action?: string; date?: string; force?: boolean };
  try { body = await req.json(); } catch { return json({ error: 'Body must be JSON' }, 400); }

  if (body.action === 'status') {
    const r = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=8`);
    if (!r.ok) return json({ error: `GitHub answered ${r.status}` }, 502);
    const j = await r.json() as { workflow_runs?: Record<string, unknown>[] };
    return json({ runs: (j.workflow_runs ?? []).map((x) => ({
      id: x.id, title: x.display_title, event: x.event, status: x.status, conclusion: x.conclusion,
      created_at: x.created_at, updated_at: x.updated_at, url: x.html_url,
    })) });
  }

  if (body.action === 'run') {
    const date = String(body.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return json({ error: 'date must be YYYY-MM-DD' }, 400);
    if (date > indiaToday()) return json({ error: 'That day has not happened yet' }, 400);
    const r = await gh(`/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // force: crop again, replacing the day's cut-outs not yet decided.
      body: JSON.stringify({ ref: 'main', inputs: { date, force: body.force ? 'true' : 'false' } }),
    });
    if (r.status !== 204) return json({ error: `GitHub did not start it (${r.status}): ${(await r.text()).slice(0, 200)}` }, 502);
    return json({ started: true, date, force: !!body.force });
  }

  return json({ error: "action must be 'run' or 'status'" }, 400);
});
