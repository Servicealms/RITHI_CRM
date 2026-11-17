// ===========================================================================
// READ THE REPORT BOX -- a Supabase Edge Function (Deno). Report-date check,
// Phase B (the user, 2026-11-17: "Crop and send", Haiku and Sonnet to be
// trialled side by side; API key added as an Edge Function secret).
//
// WHAT ARRIVES: one JPEG -- the cut-out of the "Call No/UC No" and "Service
// Visit Date" rows that the browser found and cropped on the device
// (src/lib/reportOcr.ts). Never the photo, never the customer's side of the
// form: the user's rule is that customer details do not leave our systems,
// and this function is given nothing else to send.
//
// WHAT IT DOES: asks Claude Haiku 5.5 and Claude Sonnet 5.5 to read the two
// handwritten values, both at once, and returns each one's reading, time and
// token use. The models are NOT told what RITHI holds -- a blind read is the
// only honest way to compare them with the record.
//
// WHO MAY CALL IT: a signed-in user holding `config.manage` (the trial is on
// Admin Config). Checked here against the database with the CALLER'S token,
// so a stolen anon key alone gets nothing, and nobody else can spend the key.
//
// Secrets: ANTHROPIC_API_KEY (Edge Functions -> Secrets). SUPABASE_URL and
// SUPABASE_ANON_KEY are provided by Supabase. Deployed by
// .github/workflows/deploy-functions.yml, WITH JWT verification.
// ===========================================================================
import Anthropic from 'npm:@anthropic-ai/sdk@1.5.0';

const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5' } as const;
type Which = keyof typeof MODELS;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// What the reader must return. Nothing is inferred: an unreadable value is
// null, and `ucns` holds only what is written (a PM report lists several).
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['legible', 'ucn_as_written', 'ucns', 'visit_date_as_written', 'visit_date', 'notes'],
  properties: {
    legible: { type: 'boolean' },
    ucn_as_written: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    ucns: { type: 'array', items: { type: 'string' } },
    visit_date_as_written: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    visit_date: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    notes: { type: 'string' },
  },
};

const SYSTEM = [
  'You read handwriting on a small cut-out of a printed service report form.',
  'The cut-out shows two rows: "Call No/UC No" and "Service Visit Date", each with a handwritten value to the right of its printed label.',
  'Read ONLY those two handwritten values.',
  '',
  '- ucn_as_written: the Call No/UC No exactly as written (letters and digits, e.g. 26K13F0017), or null if it cannot be read.',
  '- ucns: every call number the cell holds, written out in full. A cell may list several, the later ones shortened after a "/",',
  '  e.g. "26K04P0256/262/267" holds 26K04P0256, 26K04P0262 and 26K04P0267. Empty if none can be read.',
  '- visit_date_as_written: the Service Visit Date exactly as written, or null.',
  '- visit_date: that date as YYYY-MM-DD. Dates are written DAY FIRST (17.11.26 is 2026-11-17). Null if it cannot be read with confidence.',
  '- legible: false when neither value can be read.',
  '- notes: one short sentence on anything uncertain (a character that could be two things, a value crossed out); empty if none.',
  '',
  'Never guess a character you cannot see. A null is a correct and useful answer; a confident wrong value is not.',
].join('\n');

async function holdsConfig(auth: string): Promise<boolean> {
  if (!SUPABASE_URL || !ANON || !auth) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_perm`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'config.manage' }),
  });
  return r.ok && (await r.json()) === true;
}

async function readWith(client: Anthropic, which: Which, image: string) {
  const model = MODELS[which];
  const t0 = performance.now();
  const content: Anthropic.MessageParam['content'] = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
    { type: 'text', text: 'Read the two handwritten values.' },
  ];
  try {
    // Sonnet: the server-side refusal fallback, routed by the API itself.
    // Haiku has none.
    const res = which === 'sonnet'
      ? await client.beta.messages.create({
          model, max_tokens: 4000, system: SYSTEM,
          betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
          messages: [{ role: 'user', content }],
        })
      : await client.messages.create({
          model, max_tokens: 4000, system: SYSTEM,
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
          messages: [{ role: 'user', content }],
        });
    const r = res as unknown as Anthropic.Message;
    const ms = Math.round(performance.now() - t0);
    const usage = { input_tokens: r.usage?.input_tokens ?? 0, output_tokens: r.usage?.output_tokens ?? 0 };
    if (r.stop_reason === 'refusal') return { which, model: r.model, ok: false, error: 'declined to read it', ms, usage };
    const text = r.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return { which, model: r.model, ok: true, result: JSON.parse(text), ms, usage };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    const msg = e instanceof Anthropic.APIError ? `API ${e.status}: ${e.message}` : e instanceof Error ? e.message : String(e);
    return { which, model, ok: false, error: msg.slice(0, 300), ms, usage: { input_tokens: 0, output_tokens: 0 } };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!KEY) return json({ error: 'ANTHROPIC_API_KEY is not set on this function (Edge Functions -> Secrets)' }, 503);
  if (!(await holdsConfig(req.headers.get('Authorization') ?? ''))) return json({ error: 'Only a holder of Admin config may use the report reader' }, 403);

  let body: { image?: string; models?: string[] };
  try { body = await req.json(); } catch { return json({ error: 'Body must be JSON' }, 400); }
  const image = String(body.image ?? '').replace(/^data:image\/jpeg;base64,/, '');
  // A cut-out of two rows is tens of kilobytes; anything near a whole page is
  // not a cut-out and is refused rather than sent.
  if (!/^[A-Za-z0-9+/=]+$/.test(image) || image.length < 200) return json({ error: 'image must be a base64 JPEG' }, 400);
  if (image.length > 700_000) return json({ error: 'image too large to be the cut-out -- not sent' }, 413);
  const which = (body.models?.length ? body.models : ['haiku', 'sonnet']).filter((m): m is Which => m in MODELS);

  const client = new Anthropic({ apiKey: KEY });
  const reads = await Promise.all(which.map((w) => readWith(client, w, image)));
  return json({ reads });
});
