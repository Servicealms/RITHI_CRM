# read-report-box

Report-date check, Phase B. Receives ONE JPEG — the cut-out of the
"Call No/UC No" and "Service Visit Date" rows, cropped on the device — and
returns what Claude Haiku 5.5 and Claude Sonnet 5.5 each read in it, with time
and token use. Callable only by a signed-in user holding `config.manage`.

- Secret: `ANTHROPIC_API_KEY` (Supabase → Edge Functions → Secrets).
- Deployed by `.github/workflows/deploy-functions.yml` on a merge to `main`
  that touches this folder (needs the GitHub secret `SUPABASE_ACCESS_TOKEN`),
  or by hand: Actions → Deploy Edge Functions → Run workflow.
- JWT verification stays ON.
