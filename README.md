# 🎯 CV Lens — ATS CV Checker

**Paste your CV + a job posting. See exactly which keywords you're missing, what to add, what to cut — with evidence quoted from your own CV.**

**Live:** [hajar-benhadj.github.io/ats-cv-checker](https://hajar-benhadj.github.io/ats-cv-checker/)

## Why it's different

Most "ATS checkers" give you a vague score. CV Lens is built for **accuracy**:

- 🧾 **Evidence-based AI analysis** — every missing/partial/found keyword comes with a short quote from your CV (or an honest "no evidence"). The AI is explicitly instructed never to invent experience and to mark uncertain matches as *partial*.
- ⚡ **Hybrid scoring** — deterministic rule-based checks (contact info, section headings, action verbs, quantified results, single-column layout, dates, length, tone) run *in the browser* on top of the AI analysis, so formatting findings are facts, not hallucinations.
- 🔑 **BYOK — bring your own key** (OpenAI or any compatible provider like OpenRouter). Your key and your CV stay in your browser; there is **no server**.
- 🌍 **English + Français** UI and reports.
- 📄 **PDF / DOCX / TXT parsing in the browser** (pdf.js + mammoth.js) — files never leave your device except as text you send to your own AI provider.

## What you get

1. **Match score** with 5 sub-scores (must-haves, keywords, experience, education, ATS formatting) and an honest verdict
2. **Keyword match table** — every must-have and nice-to-have from the posting: FOUND / PARTIAL / MISSING + where in your CV
3. **✅ Add** — concrete additions with suggested wording (always "only if true for you")
4. **✏️ Improve** — before → after rewrites of your actual lines
5. **❌ Remove** — what's hurting you for *this* job
6. **⚡ Rule-based ATS checks** — the mechanical stuff scanners actually reject on
7. **📋 Copy full report** — one click, plain text, ready to work from

## How to use

1. Open the app
2. ⚙️ **AI Settings** → paste an OpenAI (or OpenRouter) API key — stored only in your browser's localStorage
3. Paste your CV (or drop a PDF/DOCX) + paste the job description (or paste a job URL and press **Fetch** — some sites like LinkedIn block fetching, then copy-paste instead)
4. **Analyze** → work through the list
5. Re-analyze after each edit until the score is where you want it

## Tech

- Zero-framework vanilla JavaScript (ES modules of IIFEs), Tailwind (CDN) for styling
- pdf.js + mammoth.js for client-side document text extraction
- Strict JSON-mode AI prompt (temperature 0.2) with normalization guards
- r.jina.ai as a CORS-open reader for job URLs

## License

MIT © Hajar Benhadj
