// analyze.js — calls the serverless endpoint (key stays server-side) and normalizes the JSON
(function () {
    'use strict';

    // Filled with the real deployment URL (see README for how to change it)
    const API_URL = 'https://ats-cv-checker-five.vercel.app/api/analyze';

    /**
     * @param {string} cvText
     * @param {string} jobText
     * @param {Array} rulesFailed issues from rules.js
     * @param {string} lang 'en'|'fr'
     * @returns {Promise<object>} normalized result
     */
    async function analyze(cvText, jobText, rulesFailed, lang) {
        const payload = JSON.stringify({ cv: cvText, job: jobText, rulesFailed: (rulesFailed || []).map((f) => f.issue), lang });

        // Free models have variable queue times — retry once automatically.
        let lastErr = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                return await runOnce(payload);
            } catch (e) {
                lastErr = e;
                if (attempt === 1) await new Promise((r) => setTimeout(r, 8000));
            }
        }
        throw lastErr || new Error('Analysis failed.');
    }

    async function runOnce(payload) {
        let res;
        try {
            res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
            });
        } catch (e) {
            throw new Error('Network error — check your connection and retry.');
        }

        let data;
        try { data = await res.json(); } catch (e) { data = {}; }

        if (!res.ok || data.error) {
            throw new Error(data.error || ('HTTP ' + res.status));
        }

        let text = data.result;
        if (!text) throw new Error('Empty response from server');

        text = String(text).replace(/```json|```/g, '').trim();
        const first = Math.min(...['{', '['].map((c) => { const i = text.indexOf(c); return i === -1 ? Infinity : i; }));
        if (first > 0) text = text.slice(first);

        const parsed = JSON.parse(text);
        return {
            job: {
                title: String((parsed.job && parsed.job.title) || ''),
                company: String((parsed.job && parsed.job.company) || ''),
                must_haves: Array.isArray(parsed.job && parsed.job.must_haves) ? parsed.job.must_haves.map(String) : [],
                nice_to_haves: Array.isArray(parsed.job && parsed.job.nice_to_haves) ? parsed.job.nice_to_haves.map(String) : [],
            },
            scores: normScores(parsed.scores),
            keyword_table: (Array.isArray(parsed.keyword_table) ? parsed.keyword_table : []).slice(0, 25).map((k) => ({
                keyword: String(k.keyword || ''),
                importance: k.importance === 'must' ? 'must' : 'nice',
                status: ['found', 'partial', 'missing'].includes(k.status) ? k.status : 'missing',
                evidence: String(k.evidence || ''),
            })),
            add: (Array.isArray(parsed.add) ? parsed.add : []).slice(0, 8).map(normItem),
            remove: (Array.isArray(parsed.remove) ? parsed.remove : []).slice(0, 6).map(normItem),
            improve: (Array.isArray(parsed.improve) ? parsed.improve : []).slice(0, 8).map((i) => ({
                section: String(i.section || ''),
                suggestion: String(i.suggestion || ''),
                before: String(i.before || ''),
                after: String(i.after || ''),
            })),
            summary: String(parsed.summary || ''),
        };
    }

    function normScores(s) {
        const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
        s = s || {};
        return {
            overall: clamp(s.overall),
            must_haves: clamp(s.must_haves),
            keywords: clamp(s.keywords),
            experience: clamp(s.experience),
            education: clamp(s.education),
            format: clamp(s.format),
        };
    }

    function normItem(i) {
        return { what: String(i.what || i.section || ''), why: String(i.why || i.suggestion || ''), example: String(i.example || '') };
    }

    window.CvAnalyze = { analyze };
})();
