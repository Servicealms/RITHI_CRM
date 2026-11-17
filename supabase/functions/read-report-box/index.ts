// ===========================================================================
// READ THE VISIT DATE ON A REPORT -- a Supabase Edge Function (Deno).
// Report-date check, Phase B (the user, 2026-11-17: "Crop and send"; then
// "Lets do only Visit Date. Drop the UCN. If Haiku Fails then go to Sonnet.
// And have a Mechanism to store the REsults back in Supabase DB" and "The Same
// records need not be re-run").
//
// WHAT ARRIVES: the visit's uid and one JPEG -- the cut-out of the report's
// "Call No/UC No" and "Service Visit Date" rows, found and cropped on the
// device (src/lib/reportOcr.ts). Never the photo, never the customer's side of
// the form.
//
// WHAT IT DOES:
//   1. Refuses a caller without visitdate.check (has_perm under the CALLER'S
//      token), and a visit already checked (one reading per visit, 0486).
//   2. Asks Claude Haiku 5.5 for the Service Visit Date, blind (not told what
//      RITHI holds). If Haiku FAILS -- an error, a refusal, or no date it can
//      read -- asks Claude Sonnet 5.5 the same.
//   3. Compares the day read with the visit's Visit Date (its day in India
//      time) and STORES the reading in public.visit_date_reads, as the service
//      role -- the table has no write policy, so a reading there is one a
//      model produced. A run where both models ERRED is not stored, so the
//      visit is tried again next time; "neither could read it" is stored, and
//      so is "no box found on the device" (no_box, nothing sent to a model).
//
// Secrets: ANTHROPIC_API_KEY (Edge Functions -> Secrets). SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase and
// never leave this function. Deployed by .github/workflows/deploy-functions.yml
// WITH JWT verification.
// ===========================================================================
import Anthropic from 'npm:@anthropic-ai/sdk@1.5.0';

const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// In the order they are asked: the second only when the first fails.
const MODELS = [
  { which: 'haiku', model: 'claude-haiku-5-5', price: [0.10, 0.50] },
  { which: 'sonnet', model: 'claude-sonnet-5-5', price: [2, 10] },
] as const;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// What the reader must return. Nothing is inferred: an unreadable date is null.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['legible', 'visit_date_as_written', 'visit_date', 'notes'],
  properties: {
    legible: { type: 'boolean' },
    visit_date_as_written: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    visit_date: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    notes: { type: 'string' },
  },
};

const SYSTEM = [
  'You read handwriting on a small cut-out of a printed service report form.',
  'The cut-out shows a row labelled "Service Visit Date" with a handwritten date to the right of the label (other rows may be visible; ignore them).',
  'Read ONLY the handwritten Service Visit Date.',
  '',
  '- visit_date_as_written: the date exactly as written, or null if it cannot be read.',
  '- visit_date: that date as YYYY-MM-DD. Dates are written DAY FIRST (17.11.26 is 2026-11-17). Null if it cannot be read with confidence.',
  '- legible: false when the date cannot be read.',
  '- notes: one short sentence on anything uncertain (a digit that could be two things, a correction); empty if none.',
  '',
  'Never guess a digit you cannot see. A null is a correct and useful answer; a confident wrong date is not.',
].join('\n');

async function holds(auth: string, action: string): Promise<boolean> {
  if (!SUPABASE_URL || !ANON || !auth) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_perm`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  return r.ok && (await r.json()) === true;
}

type Read = {
  model: string; ok: boolean; error?: string; ms: number; input_tokens: number; output_tokens: number; cost: number;
  result?: { legible: boolean; visit_date_as_written: string | null; visit_date: string | null; notes: string };
};

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

async function readWith(client: Anthropic, m: (typeof MODELS)[number], image: string): Promise<Read> {
  const t0 = performance.now();
  const content: Anthropic.MessageParam['content'] = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
    { type: 'text', text: 'Read the handwritten Service Visit Date.' },
  ];
  const tally = (u?: { input_tokens?: number; output_tokens?: number }) => {
    const i = u?.input_tokens ?? 0, o = u?.output_tokens ?? 0;
    return { input_tokens: i, output_tokens: o, cost: (i * m.price[0] + o * m.price[1]) / 1e6 };
  };
  try {
    // Sonnet: the server-side refusal fallback, routed by the API itself.
    const res = m.which === 'sonnet'
      ? await client.beta.messages.create({
          model: m.model, max_tokens: 4000, system: SYSTEM,
          betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
          messages: [{ role: 'user', content }],
        })
      : await client.messages.create({
          model: m.model, max_tokens: 4000, system: SYSTEM,
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
          messages: [{ role: 'user', content }],
        });
    const r = res as unknown as Anthropic.Message;
    const base = { model: r.model, ms: Math.round(performance.now() - t0), ...tally(r.usage) };
    if (r.stop_reason === 'refusal') return { ...base, ok: false, error: 'declined to read it' };
    const text = r.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return { ...base, ok: true, result: JSON.parse(text) };
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `API ${e.status}: ${e.message}` : e instanceof Error ? e.message : String(e);
    return { model: m.model, ok: false, error: msg.slice(0, 300), ms: Math.round(performance.now() - t0), input_tokens: 0, output_tokens: 0, cost: 0 };
  }
}

/** PostgREST as the service role -- server side only. */
async function rest(path: string, init: RequestInit = {}) {
  return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

/** The day a timestamp falls on in India, YYYY-MM-DD. */
const indiaDay = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(+d) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!KEY) return json({ error: 'ANTHROPIC_API_KEY is not set on this function (Edge Functions -> Secrets)' }, 503);
  if (!SERVICE) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not available to this function' }, 503);
  const auth = req.headers.get('Authorization') ?? '';
  if (!(await holds(auth, 'visitdate.check'))) return json({ error: 'Only a holder of Visit Date Check (an administrator for now) may send reports to be read' }, 403);

  let body: { image?: string; report_uid?: string; no_box?: string };
  try { body = await req.json(); } catch { return json({ error: 'Body must be JSON' }, 400); }
  const uid = String(body.report_uid ?? '').trim();
  if (!uid) return json({ error: 'report_uid is required' }, 400);
  const noBox = typeof body.no_box === 'string' ? body.no_box.trim().slice(0, 300) || 'no box found' : '';
  const image = String(body.image ?? '').replace(/^data:image\/jpeg;base64,/, '');
  // A cut-out is tens of kilobytes; anything near a whole page is not a
  // cut-out and is refused rather than sent.
  if (!noBox && (!/^[A-Za-z0-9+/=]+$/.test(image) || image.length < 200)) return json({ error: 'image must be a base64 JPEG' }, 400);
  if (!noBox && image.length > 700_000) return json({ error: 'image too large to be the cut-out -- not sent' }, 413);

  // "The same records need not be re-run": one reading per visit.
  const seen = await rest(`visit_date_reads?select=id,outcome,read_date&report_uid=eq.${encodeURIComponent(uid)}`);
  const seenRows = seen.ok ? await seen.json() : [];
  if (seenRows.length) return json({ skipped: true, reading: seenRows[0] });

  const rep = await rest(`reports?select=uid,ucn,visit_at&uid=eq.${encodeURIComponent(uid)}`);
  const report = rep.ok ? (await rep.json())[0] : null;
  if (!report) return json({ error: `No visit ${uid}` }, 404);

  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
  const readBy = who.ok ? (await who.json())?.id ?? null : null;

  const store = async (row: Record<string, unknown>) => {
    const ins = await rest('visit_date_reads?on_conflict=report_uid', {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
      body: JSON.stringify(row),
    });
    if (!ins.ok) return json({ error: `Not stored: ${(await ins.text()).slice(0, 300)}`, row }, 500);
    return json({ reading: (await ins.json())[0] ?? row, recorded_day: indiaDay(report.visit_at) });
  };

  // No box on the device: nothing is sent to a model; the visit is recorded
  // as checked so it is not tried again.
  if (noBox) {
    return await store({ report_uid: uid, ucn: report.ucn ?? '', recorded_visit_at: report.visit_at,
                         outcome: 'no_box', notes: noBox, read_by: readBy });
  }

  // Haiku first; Sonnet only when Haiku fails.
  const client = new Anthropic({ apiKey: KEY });
  const tried: Read[] = [];
  for (const m of MODELS) {
    const r = await readWith(client, m, image);
    tried.push(r);
    if (r.ok && r.result && isDay(r.result.visit_date)) break;
  }
  const last = tried[tried.length - 1];
  if (tried.every((r) => !r.ok)) {
    // Both erred: nothing worth keeping; the visit is tried again next time.
    return json({ error: `Neither model answered: ${tried.map((r) => r.error).join(' / ')}`, tried }, 502);
  }
  const good = tried.find((r) => r.ok && r.result && isDay(r.result.visit_date));
  const shown = good ?? [...tried].reverse().find((r) => r.ok) ?? last;
  const recorded = indiaDay(report.visit_at);
  const readDate = good ? good.result!.visit_date! : null;
  const outcome = !readDate ? 'unreadable' : readDate === recorded ? 'match' : 'mismatch';

  const row = {
    report_uid: uid,
    ucn: report.ucn ?? '',
    recorded_visit_at: report.visit_at,
    read_date: readDate,
    read_as_written: shown.result?.visit_date_as_written ?? null,
    notes: (shown.result?.notes ?? '').slice(0, 500),
    outcome,
    model: shown.model,
    tried: tried.map((r) => r.model),
    first_error: tried[0].ok ? (tried.length > 1 ? 'no date read' : '') : (tried[0].error ?? ''),
    ms: tried.reduce((t, r) => t + r.ms, 0),
    input_tokens: tried.reduce((t, r) => t + r.input_tokens, 0),
    output_tokens: tried.reduce((t, r) => t + r.output_tokens, 0),
    cost_usd: Number(tried.reduce((t, r) => t + r.cost, 0).toFixed(6)),
    read_by: readBy,
  };
  return await store(row);
});
