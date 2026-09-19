// Vercel serverless function — keeps the OpenRouter key server-side.
// The public site calls this endpoint; visitors never see any key or settings.
export const maxDuration = 60;

const ALLOWED_ORIGINS = [
    'https://hajar-benhadj.github.io',
    'https://ats-cv-checker.vercel.app',
];

// best-effort in-memory rate limit (per warm instance)
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 10;
const hits = new Map();

function rateLimited(ip) {
    const now = Date.now();
    for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    const cur = hits.get(ip) || { count: 0, reset: now + WINDOW_MS };
    cur.count += 1;
    hits.set(ip, cur);
    return cur.count > MAX_PER_HOUR;
}

function corsHeaders(req) {
    const origin = req.headers.get('origin') || '';
    return {
        'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin',
    };
}

export default async function handler(req) {
    const headers = { 'Content-Type': 'application/json', ...corsHeaders(req) };

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    if (rateLimited(ip)) {
        return new Response(JSON.stringify({ error: 'Rate limit reached (10/hour). Try again later.' }), { status: 429, headers });
    }

    const key = process.env.OPENROUTER_KEY;
    if (!key) {
        return new Response(JSON.stringify({ error: 'Server not configured (missing key).' }), { status: 500, headers });
    }

    let body;
    try { body = await req.json(); } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), { status: 400, headers });
    }

    const cv = String(body.cv || '').slice(0, 12000);
    const job = String(body.job || '').slice(0, 12000);
    const lang = body.lang === 'fr' ? 'fr' : 'en';
    const rulesFailed = Array.isArray(body.rulesFailed) ? body.rulesFailed.slice(0, 12) : [];

    if (cv.length < 100 || job.length < 100) {
        return new Response(JSON.stringify({ error: 'CV and job text are required.' }), { status: 400, headers });
    }

    const model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash-0731:free';

    try {
        const aiText = await callOpenRouter(key, model, cv, job, lang, rulesFailed);
        return new Response(JSON.stringify({ result: aiText }), {
            status: 200,
            headers: { ...headers, 'Cache-Control': 'no-store' },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'AI request failed.' }), {
            status: 502,
            headers,
        });
    }
}

async function callOpenRouter(key, model, cv, job, lang, rulesFailed) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50000);
    try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + key,
                'HTTP-Referer': 'https://hajar-benhadj.github.io/ats-cv-checker/',
                'X-Title': 'CV Lens',
            },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                max_tokens: 3500,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt(lang) },
                    { role: 'user', content: userPrompt(cv, job, rulesFailed) },
                ],
            }),
        });

        if (!res.ok) {
            let msg = 'HTTP ' + res.status;
            try {
                const err = await res.json();
                msg = (err.error && (err.error.message || err.error.type)) || msg;
            } catch (e) { /* ignore */ }
            throw new Error('AI provider: ' + msg);
        }

        const data = await res.json();
        const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!text) throw new Error('Empty AI response');
        return String(text);
    } finally {
        clearTimeout(timer);
    }
}

// The same strict evidence-based prompt used by the client previously.
function systemPrompt(lang) {
    const fr = lang === 'fr';
    return [
        'You are a meticulous ATS (Applicant Tracking System) analyst and senior technical recruiter.',
        'You compare a candidate CV against ONE job posting and output ONLY strict JSON (no markdown fences, no commentary).',
        '',
        'ACCURACY RULES (absolute):',
        '- Every claim must be grounded in the provided texts. Quote short evidence from the CV (\u226412 words) or write "".',
        '- NEVER invent experience, tools or keywords the candidate may not have. Suggestions must be conditional ("if you have used X, add\u2026").',
        '- keyword status: "found" ONLY if the requirement is explicitly present in the CV; "partial" if a closely related skill/experience exists (say how); "missing" otherwise. When unsure, prefer "partial" with an honest note.',
        '- importance: "must" only for requirements the posting calls required/mandatory or lists first; otherwise "nice".',
        '- Do not penalize synonyms twice: if CV says "JS" and job says "JavaScript", that is "found".',
        '- Be strict but fair: scoring 90+ only for near-perfect must-have coverage.',
        '',
        'OUTPUT JSON SCHEMA (respond with exactly this structure):',
        '{',
        '  "job": { "title": string, "company": string, "must_haves": string[], "nice_to_haves": string[] },',
        '  "scores": { "overall": 0-100, "must_haves": 0-100, "keywords": 0-100, "experience": 0-100, "education": 0-100, "format": 0-100 },',
        '  "keyword_table": [ { "keyword": string, "importance": "must"|"nice", "status": "found"|"partial"|"missing", "evidence": string } ],',
        '  "add": [ { "what": string, "why": string, "example": string } ],',
        '  "remove": [ { "what": string, "why": string } ],',
        '  "improve": [ { "section": string, "suggestion": string, "before": string, "after": string } ],',
        '  "summary": string',
        '}',
        '',
        fr ? 'Write all human-readable strings in FRENCH. Keywords stay in their original language.' : 'Write all human-readable strings in English. Keep keywords in their original language.',
        'Respond with JSON only.',
    ].join('\n');
}

function userPrompt(cv, job, rulesFailed) {
    const rulesNote = rulesFailed && rulesFailed.length
        ? '\n\nRule-based formatting issues already detected automatically (factor them into the "format" score): ' + rulesFailed.join('; ')
        : '';
    return '### JOB POSTING\n' + job.trim() + '\n\n### CANDIDATE CV\n' + cv.trim() + rulesNote + '\n\nAnalyze this CV against this job posting. Be precise and evidence-based.';
}
