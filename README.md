# 🎯 CV Lens — ATS CV Checker

**Paste your CV + a job posting. See exactly which keywords you're missing, what to add, what to cut — with evidence quoted from your own CV.**

**Live:** [hajar-benhadj.github.io/ats-cv-checker](https://hajar-benhadj.github.io/ats-cv-checker/)

Works out of the box — visitors don't configure anything.

## Why it's different

Most "ATS checkers" give you a vague score. CV Lens is built for **accuracy**:

- 🧾 **Evidence-based AI analysis** — every missing/partial/found keyword comes with a short quote from your CV (or an honest "no evidence"). The AI is explicitly instructed never to invent experience and to mark uncertain matches as *partial*.
- ⚡ **Hybrid scoring** — deterministic rule-based checks (contact info, section headings, action verbs, quantified results, single-column layout, dates, length, tone) run *in the browser* on top of the AI analysis, so formatting findings are facts, not hallucinations.
- 🔒 **No keys in the browser** — the AI key lives only in a serverless function (Vercel) with per-IP rate limiting (10 analyses/hour). The API key is never shipped to clients.
- 🌍 **English + Français** UI and reports.
- 📄 **PDF / DOCX / TXT parsing in the browser** (pdf.js + mammoth.js) — files are read locally; only plain text is ever sent to the analysis API. Nothing is stored or logged.

## What you get

1. **Match score** with 5 sub-scores (must-haves, keywords, experience, education, ATS formatting) and an honest verdict
2. **Keyword match table** — every must-have and nice-to-have: FOUND / PARTIAL / MISSING + where in your CV
3. **✅ Add** — concrete additions with suggested wording ("only if true for you")
4. **✏️ Improve** — before → after rewrites of your actual lines
5. **❌ Remove** — what's hurting you for *this* job
6. **⚡ Rule-based ATS checks** — the mechanical stuff scanners actually reject on
7. **📋 Copy report** / **🖨️ Print / save as PDF**

## Architecture

```
Browser (GitHub Pages)                Serverless (Vercel)
┌──────────────────────┐   POST /api/analyze   ┌─────────────────────────┐
│ CV text (parsed      │ ────────────────────► │ rate limit (10/h/IP)    │
│ locally: pdf.js /    │                       │ → OpenRouter            │
│ mammoth.js) + job    │ ◄──────────────────── │   (key = env secret)    │
│ + rule-based checks  │      strict JSON      └─────────────────────────┘
└──────────────────────┘
```

- `api/analyze.js` — Vercel function (60s max, 50s AI abort, CORS restricted to the site origin)
- Default model: a free OpenRouter model; change anytime via the `OPENROUTER_MODEL` env var (e.g. `openai/gpt-4o` after topping up credits — faster and even more accurate)
- `js/rules.js` — deterministic ATS checks
- `js/analyze.js` — endpoint client + JSON normalization guards

### Changing the key or model (site owner only)

Vercel → ats-cv-checker project → Settings → Environment Variables → `OPENROUTER_KEY` / `OPENROUTER_MODEL` → Redeploy.

## License

MIT © Hajar Benhadj
