// Vercel serverless function — AI bullet rewrites (keeps the OpenRouter key server-side).
// Same resilience pattern as analyze.mjs: model fallback chain + JSON validation.
export const maxDuration = 300;

const ALLOWED_ORIGINS = [
    'https://hajar-benhadj.github.io',
    'https://ats-cv-checker-five.vercel.app',
];

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

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (c) => { data += c; });
        req.on('end', () => {
            try { resolve(data ? JSON.parse(data) : {}); }
            catch (e) { reject(new Error('Invalid JSON body.')); }
        });
        req.on('error', reject);
    });
}

export default async function handler(req, res) {
    const origin = (req.headers && (req.headers.origin || '')) || '';
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    res.setHeader('Access-Control-Allow-Origin', allow);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (req.method !== 'POST') {
        res.statusCode = 405;
        return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }

    const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
    if (rateLimited(ip)) {
        res.statusCode = 429;
        return res.end(JSON.stringify({ error: 'Rate limit reached (10/hour). Try again later.' }));
    }

    const key = process.env.OPENROUTER_KEY;
    if (!key) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: 'Server not configured (missing key).' }));
    }

    let body;
    try { body = await readBody(req); }
    catch (e) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: e.message }));
    }

    const cv = String(body.cv || '').slice(0, 12000);
    const job = String(body.job || '').slice(0, 12000);
    const lang = body.lang === 'fr' ? 'fr' : body.lang === 'ar' ? 'ar' : 'en';

    if (cv.length < 100 || job.length < 100) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'CV and job text are required.' }));
    }

    const models = [
        process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash-0731:free',
        'nvidia/nemotron-3-super-120b-a12b:free',
    ];

    try {
        let aiText = null;
        let lastErr = null;
        for (const model of models) {
            for (let attempt = 0; attempt < 2 && aiText === null; attempt++) {
                try {
                    const text = await callOpenRouter(key, model, cv, job, lang);
                    const parsed = JSON.parse(String(text).replace(/```json|```/g, '').trim());
                    if (!parsed || !Array.isArray(parsed.rewrites)) throw new Error('Missing rewrites array');
                    aiText = text;
                } catch (e) {
                    lastErr = e;
                    if (/provider|busy/i.test(String(e.message || ''))) break;
                }
            }
            if (aiText !== null) break;
        }
        if (aiText === null) throw lastErr || new Error('AI returned invalid JSON.');

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 200;
        return res.end(JSON.stringify({ result: aiText }));
    } catch (err) {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 502;
        return res.end(JSON.stringify({ error: err.message || 'AI request failed.' }));
    }
}

async function callOpenRouter(key, model, cv, job, lang) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
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
                temperature: 0.3,
                max_tokens: 3500,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt(lang) },
                    { role: 'user', content: userPrompt(cv, job) },
                ],
            }),
        });

        if (!res.ok) {
            let msg = 'HTTP ' + res.status;
            try {
                const err = await res.json();
                msg = (err.error && (err.error.message || err.error.type)) || msg;
            } catch (e) { /* ignore */ }
            if (/provider returned error|rate limit|429/i.test(String(msg))) {
                throw new Error('The free AI provider is busy right now — please try again.');
            }
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

function systemPrompt(lang) {
    const langLine = lang === 'fr'
        ? 'Write all human-readable strings in FRENCH.'
        : lang === 'ar'
            ? 'Write all human-readable strings in ARABIC (Modern Standard Arabic, professional tone).'
            : 'Write all human-readable strings in English.';
    return [
        'You are an expert CV/résumé writer and ATS specialist.',
        'Given a CV and one job posting, pick the 4–6 weakest experience bullet points — vague, unquantified, generic, or missing the job\u2019s key keywords — and rewrite them.',
        '',
        'ACCURACY RULES (absolute):',
        '- NEVER invent facts, tools, numbers, employers or roles. Only reorganize what the CV already shows and surface job keywords the candidate genuinely demonstrates somewhere in the CV.',
        '- If a number would strengthen a bullet but is unknown, insert a clearly marked placeholder like [X%] or [N users] instead of inventing one.',
        '- Prefer bullets from the Experience section; only touch Skills/Projects lines if there are not enough experience bullets.',
        '- Each rewritten bullet: 1–2 lines max, starts with a strong action verb, keeps technical terms exact.',
        '- "why": one short sentence explaining what changed (verb, keyword, structure, number).',
        '- If the CV genuinely has no improvable bullets, return an empty rewrites array — do not force it.',
        '',
        'OUTPUT ONLY strict JSON, exactly this structure:',
        '{"rewrites":[{"original":string,"rewritten":string,"why":string}]}',
        '',
        langLine,
        'Respond with JSON only.',
    ].join('\n');
}

function userPrompt(cv, job) {
    return '### JOB POSTING\n' + job.trim() + '\n\n### CANDIDATE CV\n' + cv.trim() + '\n\nRewrite the weakest bullets of this CV for this job.';
}
