<div align="center">

# 🎯 CV Lens

### See your CV like an ATS does — before the ATS does.

**Paste your CV + a job posting. Get the exact keywords you're missing, what to add, and what to cut — with proof quoted from your own CV.**

[![Live Demo](https://img.shields.io/badge/Live-hajar--benhadj.github.io%2Fats--cv--checker-38bdf8?style=for-the-badge&logo=github&logoColor=white)](https://hajar-benhadj.github.io/ats-cv-checker/)
![License](https://img.shields.io/badge/License-MIT-8b5cf6?style=for-the-badge)
![No signup](https://img.shields.io/badge/No%20signup-No%20tracking-34d399?style=for-the-badge)
![Languages](https://img.shields.io/badge/UI-English%20·%20Français-f472b6?style=for-the-badge)

**English · Français** · works on mobile · free forever

</div>

---

## 💡 The problem

Most companies run CVs through an **ATS (Applicant Tracking System)** before a human ever sees them. One missing keyword — *TypeScript*, *PostgreSQL*, *anglais courant* — and a qualified candidate is silently filtered out. People get rejected by software for formatting they never knew was wrong.

**CV Lens shows you exactly what that filter sees.**

## ✨ What you get

| | |
|---|---|
| 🧾 **Evidence-based keyword table** | Every must-have and nice-to-have from the posting: **FOUND / PARTIAL / MISSING** — each with a short quote from your CV (or an honest "no evidence") |
| 📊 **Match score + 5 sub-scores** | Must-haves · keywords · experience · education · ATS formatting — with an honest verdict, not flattery |
| ✅ **Add** | Concrete additions with suggested wording — always phrased *"only if true for you"* |
| ✏️ **Improve** | Before → after rewrites of your actual lines |
| ❌ **Remove** | What's hurting you for *this* job specifically |
| ⚡ **Rule-based ATS checks** | Contact info, section headings, action verbs, quantified results, single-column layout, dates — deterministic facts, not AI guesses |
| 🔗 **Smart job-link handling** | Paste a job URL and press Analyze — it fetches the posting automatically (server-side, no CORS walls) |
| 📄 **Client-side document parsing** | PDF / DOCX / TXT read locally with pdf.js + mammoth.js — the file never leaves your device |
| 📋🖨️ **Export** | Copy the full report, or print/save as PDF |

![CV Lens — results](docs/screenshot-results.png)

## 🔒 Privacy & security

- **Your CV file never leaves your browser** — parsing happens locally; only plain text you submit goes to the analysis API
- **Nothing is stored or logged** — no accounts, no database, no tracking
- **No keys in the client** — the AI key lives only in a serverless function (Vercel env secret), never in shipped JavaScript
- **Rate-limited API** (10 analyses / hour / IP) to prevent abuse

## ⚙️ How it works

```
 Browser (GitHub Pages)                  Serverless (Vercel, free tier)
 ┌───────────────────────────┐           ┌─────────────────────────────┐
 │ PDF/DOCX parsed locally   │  POST     │ rate limit → OpenRouter AI  │
 │ rule-based ATS checks     │ ────────► │ (key = env secret, never    │
 │ render scores & evidence  │ ◄──────── │  shipped to clients)        │
 └───────────────────────────┘  JSON     │ JSON validated + auto-retry │
                                       └─────────────────────────────┘
```

Hybrid accuracy: **deterministic rules in the browser** + a **strict evidence-based AI prompt** (temperature 0.2, JSON schema, model fallback chain) that is explicitly forbidden from inventing experience.

## 🛠 Tech stack

**Zero-framework vanilla JS** · Tailwind (CDN) · pdf.js · mammoth.js · Vercel serverless functions · OpenRouter AI · EN/FR i18n

## 🚀 Run it locally

```bash
git clone https://github.com/hajar-benhadj/ats-cv-checker.git
cd ats-cv-checker
python -m http.server 8080   # open http://localhost:8080
```

The public API endpoint is already live; to self-host the analysis too, deploy the `api/` functions to your own Vercel and set `OPENROUTER_KEY`.

## 📄 License

MIT © Hajar Benhadj — use it, learn from it, build on it.
