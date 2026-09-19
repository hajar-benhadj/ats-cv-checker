// analyze.js — AI analysis: strict evidence-based JSON output
(function () {
    'use strict';

    function systemPrompt(lang) {
        const fr = lang === 'fr';
        return [
            'You are a meticulous ATS (Applicant Tracking System) analyst and senior technical recruiter.',
            'You compare a candidate CV against ONE job posting and output ONLY strict JSON (no markdown fences, no commentary).',
            '',
            'ACCURACY RULES (absolute):',
            '- Every claim must be grounded in the provided texts. Quote short evidence from the CV (≤12 words) or write "".',
            '- NEVER invent experience, tools or keywords the candidate may not have. Suggestions must be conditional ("if you have used X, add…").',
            '- keyword status: "found" ONLY if the requirement is explicitly present in the CV; "partial" if a closely related skill/experience exists (say how); "missing" otherwise. When unsure, prefer "partial" with an honest note.',
            '- importance: "must" only for requirements the posting calls required/mandatory or lists first; otherwise "nice".',
            '- Do not penalize synonyms twice: if CV says "JS" and job says "JavaScript", that is "found".',
            '- Be strict but fair: scoring 90+ only for near-perfect must-have coverage.',
            '',
            'OUTPUT JSON SCHEMA (respond with exactly this structure):',
            '{',
            '  "job": { "title": string, "company": string, "must_haves": string[], "nice_to_haves": string[] },',
            '  "scores": { "overall": 0-100, "must_haves": 0-100, "keywords": 0-100, "experience": 0-100, "education": 0-100, "format": 0-100 },',
            '  "keyword_table": [ { "keyword": string, "importance": "must"|"nice", "status": "found"|"partial"|"missing", "evidence": string } ],  // 12-20 rows, cover ALL must-haves first',
            '  "add": [ { "what": string, "why": string, "example": string } ],      // 3-6 concrete additions, examples only as suggestions',
            '  "remove": [ { "what": string, "why": string } ],                      // 0-4 items, only clearly irrelevant or risky content',
            '  "improve": [ { "section": string, "suggestion": string, "before": string, "after": string } ],  // 2-5 rewrites quoting the CV ("before")',
            '  "summary": string                                                       // 2-3 sentences, direct and honest',
            '}',
            '',
            fr ? 'Write all human-readable strings (summary, what, why, suggestion, example, before/after) in FRENCH. Keywords stay in their original language.' : 'Write all human-readable strings in English. Keep keywords in their original language.',
            'Respond with JSON only.',
        ].join('\n');
    }

    function userPrompt(cvText, jobText, rulesFailed) {
        const rulesNote = rulesFailed && rulesFailed.length
            ? '\n\nRule-based formatting issues already detected automatically (factor them into the "format" score): ' +
              rulesFailed.map((f) => f.issue).join('; ')
            : '';
        return [
            '### JOB POSTING\n' + jobText.trim().slice(0, 12000),
            '\n### CANDIDATE CV\n' + cvText.trim().slice(0, 12000),
            rulesNote,
            '\nAnalyze this CV against this job posting. Be precise and evidence-based.',
        ].join('\n');
    }

    /**
     * @param {object} cfg {key, baseUrl, model}
     * @param {string} cvText
     * @param {string} jobText
     * @param {Array} rulesFailed
     * @param {string} lang 'en'|'fr'
     */
    async function analyze(cfg, cvText, jobText, rulesFailed, lang) {
        const res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + cfg.key,
            },
            body: JSON.stringify({
                model: cfg.model,
                temperature: 0.2,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt(lang) },
                    { role: 'user', content: userPrompt(cvText, jobText, rulesFailed) },
                ],
            }),
        });

        if (!res.ok) {
            let msg = 'HTTP ' + res.status;
            try {
                const err = await res.json();
                msg = (err.error && (err.error.message || err.error.type)) || msg;
            } catch (e) { /* ignore */ }
            throw new Error(msg);
        }

        const data = await res.json();
        let text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!text) throw new Error('Empty AI response');

        text = String(text).replace(/```json|```/g, '').trim();
        const first = Math.min(...['{', '['].map((c) => { const i = text.indexOf(c); return i === -1 ? Infinity : i; }));
        if (first > 0) text = text.slice(first);

        const parsed = JSON.parse(text);
        // normalize / guard every field so rendering never crashes
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
