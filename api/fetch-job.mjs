// Vercel function — server-side job posting fetcher (no CORS limits, no third-party proxy).
// GET /api/fetch-job?url=https://…
export const maxDuration = 30;

const ALLOWED_ORIGINS = [
    'https://hajar-benhadj.github.io',
    'https://ats-cv-checker-five.vercel.app',
];

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 20;
const hits = new Map();

function rateLimited(ip) {
    const now = Date.now();
    for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    const cur = hits.get(ip) || { count: 0, reset: now + WINDOW_MS };
    cur.count += 1;
    hits.set(ip, cur);
    return cur.count > MAX_PER_HOUR;
}

function htmlToText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
        .replace(/<(br|hr)\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
}

export default async function handler(req, res) {
    const origin = (req.headers && (req.headers.origin || '')) || '';
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    res.setHeader('Access-Control-Allow-Origin', allow);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }

    const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
    if (rateLimited(ip)) {
        res.statusCode = 429;
        return res.end(JSON.stringify({ error: 'Rate limit reached (20/hour).' }));
    }

    let url = String((req.query && req.query.url) || '');
    if (!url && req.url) {
        try { url = new URL(req.url, 'https://x').searchParams.get('url') || ''; } catch (e) { /* ignore */ }
    }
    if (!/^https?:\/\//i.test(url)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Provide a valid http(s) URL.' }));
    }
    // block obvious non-job hosts we can never read (login walls)
    if (/linkedin\.com|indeed\.com/i.test(url)) {
        res.statusCode = 451;
        return res.end(JSON.stringify({ error: 'This site requires a login — open the posting and paste the text.' }));
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        const r = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en,fr;q=0.8',
            },
        });
        clearTimeout(timer);
        if (!r.ok) throw new Error('Target site returned HTTP ' + r.status);

        const type = r.headers.get('content-type') || '';
        if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
            throw new Error('Target did not return an HTML page');
        }

        const raw = await r.text();
        const text = htmlToText(raw).slice(0, 15000);
        if (text.split(/\s+/).filter(Boolean).length < 40) throw new Error('Page contained too little text (JavaScript-rendered?)');

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 200;
        return res.end(JSON.stringify({ text }));
    } catch (err) {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 502;
        return res.end(JSON.stringify({ error: err.message || 'Fetch failed' }));
    }
}
