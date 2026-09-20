// app.js — UI wiring (no settings: analysis runs server-side, ready out of the box)
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const t = (k) => window.I18N.t(k);
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // current analysis context (used by rewrite / PDF / share / history)
    let currentCtx = null;
    let currentResult = null;
    let currentRules = null;
    let lastMeta = {}; // PDF structure info from the last uploaded file

    // ---------- CV input ----------
    function initCvInput() {
        const zone = $('cv-drop'), input = $('inp-cv-file'), area = $('inp-cv');
        zone.addEventListener('click', () => input.click());
        $('btn-cv-browse').addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
        ['dragover', 'dragenter'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
        ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
        zone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
        input.addEventListener('change', () => { if (input.files.length) handleFile(input.files[0]); });
        area.addEventListener('input', () => { updateStats(); lastMeta = {}; });

        async function handleFile(file) {
            try {
                setStatus('analyze-status', '⏳ ' + esc(file.name) + ' …');
                const text = await window.CvExtract.extractFile(file);
                lastMeta = Object.assign({}, (window.CvExtract && window.CvExtract.meta) || {});
                const words = text.split(/\s+/).filter(Boolean).length;
                if (!text || words < 30) {
                    setStatus('analyze-status', '⚠️ ' + esc(file.name) + ': ' + t('scannedPdfAdvice'));
                    $('inp-cv').focus();
                    return;
                }
                area.value = text;
                updateStats();
                setStatus('analyze-status', '✅ ' + esc(file.name) + ' — ' + words + ' ' + t('words'));
            } catch (err) {
                setStatus('analyze-status', '⚠️ ' + esc(err.message) + ' — ' + t('scannedPdfAdvice'));
            }
        }
    }

    function updateStats() {
        $('cv-stats').textContent = $('inp-cv').value.split(/\s+/).filter(Boolean).length;
    }

    // ---------- job fetch ----------
    function initJobFetch() {
        $('btn-fetch-job').addEventListener('click', fetchJob);
    }

    // fetch chain — our serverless fetcher first (no CORS limits), r.jina.ai as
    // fallback (renders JavaScript, rate-limited sometimes)
    const PROXIES = [
        { name: 'ours', build: (u) => 'https://ats-cv-checker-five.vercel.app/api/fetch-job?url=' + encodeURIComponent(u), json: true },
        { name: 'jina', build: (u) => 'https://r.jina.ai/' + u, json: false, clean: stripReaderHeaders },
    ];

    function stripReaderHeaders(text) {
        return text.replace(/^(Title|URL Source|Published Time|Warning|Markdown Content):.*\n+/gm, '').trim();
    }

    async function fetchJob() {
        const url = $('inp-job-url').value.trim();
        if (!url) return;
        const text = await fetchJobText(url);
        if (text) $('inp-job').value = text;
    }

    // Returns fetched job text, or null (fetch-status explains why).
    async function fetchJobText(url) {
        const st = $('fetch-status');
        st.className = 'text-xs mt-1';
        st.classList.remove('hidden');

        for (let i = 0; i < PROXIES.length; i++) {
            st.textContent = '⏳ ' + t('fetching') + ' (' + (i + 1) + '/' + PROXIES.length + ')…';
            try {
                const res = await fetch(PROXIES[i].build(url));
                if (!res.ok) {
                    let msg = '';
                    try { msg = (await res.json()).error || ''; } catch (e) { /* not json */ }
                    // login-walled sites: stop trying, tell the user immediately
                    if (res.status === 451 || /login/i.test(msg)) { st.textContent = '🔒 ' + t('linkedinWarn'); return null; }
                    throw new Error('HTTP ' + res.status);
                }
                let text = PROXIES[i].json ? (await res.json()).text : (await res.text());
                if (PROXIES[i].clean) text = PROXIES[i].clean(String(text).trim());
                text = String(text || '').trim();
                if (text.split(/\s+/).filter(Boolean).length < 40) throw new Error('too short');
                st.textContent = '✅ ' + t('fetchOk');
                return text.slice(0, 15000);
            } catch (e) { /* try next */ }
        }
        st.textContent = '⚠️ ' + t('fetchFail');
        return null;
    }

    // ---------- analyze ----------
    function initAnalyze() {
        $('btn-analyze').addEventListener('click', runAnalysis);
    }

    function setStatus(id, msg) { $(id).textContent = msg || ''; }

    let elapsedTimer = null;
    const STEPS = ['stepReading', 'stepKeywords', 'stepMatching', 'stepScoring', 'stepWriting'];

    // elapsed timer + rotating stage messages (free models are slow — this keeps the wait honest)
    function startElapsed(labelKey, useSteps) {
        const t0 = Date.now();
        let step = 0;
        stopElapsed();
        elapsedTimer = setInterval(() => {
            const s = Math.round((Date.now() - t0) / 1000);
            if (useSteps && s > 6 && step < STEPS.length - 1 && s % 9 === 0) step++;
            const label = useSteps ? t(STEPS[step]) : t(labelKey);
            setStatus('analyze-status', '🧠 ' + label + ' (' + s + 's)');
        }, 1000);
        setStatus('analyze-status', '🧠 ' + t(useSteps ? STEPS[0] : labelKey) + ' (0s)');
    }
    function stopElapsed() { if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; } }

    async function runAnalysis() {
        const btn = $('btn-analyze');
        const cv = $('inp-cv').value.trim();
        let job = $('inp-job').value.trim();
        const urlField = $('inp-job-url').value.trim();
        const jobIsUrl = /^https?:\/\/\S{5,}$/i.test(job);

        // Smart link handling: if the job text is missing but a link was given
        // (in the URL field or pasted as the description), fetch it automatically.
        if ((job.length < 100 && urlField) || jobIsUrl) {
            const url = jobIsUrl ? job : urlField;
            btn.disabled = true;
            setStatus('analyze-status', '🔗 ' + t('autoFetching'));
            const text = await fetchJobText(url);
            btn.disabled = false;
            if (text) {
                job = text;
                $('inp-job').value = text;
            } else {
                setStatus('analyze-status', '');
                return; // fetch-status already explains what happened
            }
        }

        if (cv.length < 100 && job.length < 100) { setStatus('analyze-status', '⚠️ ' + t('needBoth')); return; }
        if (cv.length < 100) { setStatus('analyze-status', '⚠️ ' + t('needCv')); return; }
        if (job.length < 100) { setStatus('analyze-status', '⚠️ ' + t('needJob')); return; }

        const rules = window.CvRules.runRules(cv, window.I18N.get(), lastMeta);
        btn.disabled = true;
        startElapsed(null, true);
        $('results').classList.add('hidden');

        try {
            const result = await window.CvAnalyze.analyze(cv, job, rules.failed, window.I18N.get());
            currentCtx = { cv, job };
            currentResult = result;
            currentRules = rules;
            render(result, rules, currentCtx);
            stopElapsed();
            setStatus('analyze-status', '');
            $('results').classList.remove('hidden');
            $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });

            // remember for before/after + history (only on real analyses)
            try { localStorage.setItem('cvlens_last', JSON.stringify({ score: result.scores.overall, ts: Date.now() })); } catch (e) { /* full */ }
            pushHistory({
                id: String(Date.now()),
                when: new Date().toLocaleString(),
                title: result.job.title || (job.split('\n')[0] || '').slice(0, 60),
                score: result.scores.overall,
                cv, job, result, rules,
            });
        } catch (err) {
            stopElapsed();
            setStatus('analyze-status', '❌ ' + t('errorPrefix') + esc(err.message));
        } finally {
            btn.disabled = false;
        }
    }

    // ---------- AI bullet rewrites ----------
    async function runRewrite() {
        if (!currentCtx || !currentCtx.cv) return;
        const btnR = $('btn-rewrite');
        btnR.disabled = true;
        startElapsed('rewriting', false);
        try {
            const rewrites = await window.CvAnalyze.rewrite(currentCtx.cv, currentCtx.job, window.I18N.get());
            stopElapsed();
            setStatus('analyze-status', '');
            const box = $('rewrites-box');
            if (!rewrites.length) {
                setStatus('analyze-status', 'ℹ️ ' + t('rewriteEmpty'));
                return;
            }
            box.innerHTML = '<div class="card"><h2 class="card-title">✨ ' + esc(t('rewritesTitle')) +
                ' <span class="badge-count" style="background:#f3effd;color:#7c5cd6;">' + rewrites.length + '</span></h2>' +
                '<div class="grid gap-3">' + rewrites.map((r, i) =>
                    '<div class="item-card rewrite-card">' +
                    '<div class="rw-orig"><span class="rw-label">' + esc(t('originalLabel')) + '</span>' + esc(r.original) + '</div>' +
                    '<div class="rw-better"><span class="rw-label ok">' + esc(t('improvedLabel')) + '</span>' + esc(r.rewritten) +
                    '<button class="btn-secondary rw-copy" data-rw="' + i + '">📋 ' + esc(t('copyBullet')) + '</button></div>' +
                    '<div class="why">💡 ' + esc(r.why) + '</div>' +
                    '</div>').join('') + '</div></div>';
            box.querySelectorAll('.rw-copy').forEach((b) => b.addEventListener('click', () => {
                const i = +b.getAttribute('data-rw');
                navigator.clipboard.writeText(rewrites[i].rewritten).then(() => {
                    b.textContent = '✅ ' + t('copied');
                    setTimeout(() => { b.textContent = '📋 ' + t('copyBullet'); }, 1600);
                }).catch(() => {});
            }));
            box.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (err) {
            stopElapsed();
            setStatus('analyze-status', '❌ ' + t('errorPrefix') + esc(err.message));
        } finally {
            btnR.disabled = false;
        }
    }

    // ---------- history (localStorage only — nothing leaves the device) ----------
    function loadHistory() {
        try { return JSON.parse(localStorage.getItem('cvlens_history') || '[]'); } catch (e) { return []; }
    }
    function saveHistory(a) {
        try { localStorage.setItem('cvlens_history', JSON.stringify(a.slice(0, 10))); } catch (e) { /* storage full */ }
    }
    function pushHistory(entry) {
        const a = loadHistory();
        a.unshift(entry);
        saveHistory(a);
        renderHistory();
    }
    function scoreColor(score) { return score >= 70 ? '#12855f' : score >= 45 ? '#d99a1e' : '#cf3a5a'; }
    function renderHistory() {
        const box = $('history');
        if (!box) return;
        const a = loadHistory();
        if (!a.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
        box.classList.remove('hidden');
        box.innerHTML = '<div class="card"><div class="flex items-center justify-between mb-3 gap-2">' +
            '<h2 class="card-title" style="margin-bottom:0">🕘 ' + esc(t('historyTitle')) + '</h2>' +
            '<button id="btn-hist-clear" class="link text-xs">' + esc(t('historyClear')) + '</button></div>' +
            a.map((e) =>
                '<div class="hist-row">' +
                '<div class="flex-1 min-w-0"><div class="font-semibold text-sm truncate">' + esc(e.title || '—') + '</div>' +
                '<div class="text-xs opacity-60">' + esc(e.when || '') + '</div></div>' +
                '<span class="badge-count" style="background:' + scoreColor(e.score) + '22;color:' + scoreColor(e.score) + ';">' + e.score + '</span>' +
                '<button class="btn-secondary text-xs shrink-0" data-hist-open="' + esc(e.id) + '">' + esc(t('historyOpen')) + '</button>' +
                '<button class="hist-del" data-hist-del="' + esc(e.id) + '" aria-label="delete">✕</button>' +
                '</div>').join('') + '</div>';

        $('btn-hist-clear').addEventListener('click', () => { saveHistory([]); renderHistory(); });
        box.querySelectorAll('[data-hist-open]').forEach((b) => b.addEventListener('click', () => {
            const e = loadHistory().find((x) => String(x.id) === b.getAttribute('data-hist-open'));
            if (!e) return;
            $('inp-cv').value = e.cv || '';
            $('inp-job').value = e.job || '';
            updateStats();
            lastMeta = {};
            currentCtx = { cv: e.cv || '', job: e.job || '' };
            currentResult = e.result;
            currentRules = e.rules;
            render(e.result, e.rules, currentCtx);
            $('results').classList.remove('hidden');
            $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
        box.querySelectorAll('[data-hist-del]').forEach((b) => b.addEventListener('click', () => {
            saveHistory(loadHistory().filter((x) => String(x.id) !== b.getAttribute('data-hist-del')));
            renderHistory();
        }));
    }

    // ---------- rendering ----------
    function ring(score) {
        const r = 56, c = 2 * Math.PI * r, off = c * (1 - score / 100);
        const color = score >= 70 ? '#12855f' : score >= 45 ? '#d99a1e' : '#cf3a5a';
        return '<div class="score-ring"><svg width="130" height="130" viewBox="0 0 130 130">' +
            '<circle cx="65" cy="65" r="' + r + '" fill="none" stroke="rgba(0,0,0,.07)" stroke-width="9"/>' +
            '<circle cx="65" cy="65" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '"/>' +
            '</svg><div class="num">' + score + '<small>' + esc(t('overall')) + '</small></div></div>';
    }

    function subscore(label, val) {
        return '<div class="subscore"><div class="flex justify-between text-xs font-semibold"><span class="opacity-80">' + esc(label) + '</span><span>' + val + '</span></div><div class="bar"><div style="width:' + val + '%"></div></div></div>';
    }

    function chip(status) { return '<span class="chip ' + status + '">' + esc(t(status)) + '</span>'; }

    // one numbered recommendation row (add / improve / remove)
    function secItem(it, color, idx) {
        let html = '<div class="sec-item">' +
            '<span class="num-chip" style="background:' + color + '1e;color:' + color + ';">' + (idx + 1) + '</span>' +
            '<div class="sec-body"><div class="sec-head">' + esc(it.head) + '</div>';
        if (it.body) html += '<div class="sec-why">' + esc(it.body) + '</div>';
        if (it.ex) html += '<div class="example">💡 ' + esc(t('exampleLabel')) + ': ' + esc(it.ex) + '</div>';
        if (it.before || it.after) {
            html += '<div class="diff">' +
                '<div class="diff-row before"><span class="diff-label">' + esc(t('beforeLabel')) + '</span><span class="diff-text">' + esc(it.before || '…') + '</span></div>' +
                '<div class="diff-row after"><span class="diff-label">' + esc(t('afterLabel')) + '</span><span class="diff-text">' + esc(it.after || '…') + '</span></div>' +
                '</div>';
        }
        return html + '</div></div>';
    }

    // where in the CV the keyword actually lives (deterministic, client-side)
    function whereTag(k) {
        if (!k.where) return '';
        if (k.where === 'experience' || k.where === 'projects')
            return ' <span class="where-tag ok">' + esc(t(k.where === 'experience' ? 'inExperience' : 'inProjects')) + '</span>';
        if (k.where === 'skills')
            return ' <span class="where-tag warn">' + esc(t('skillsOnly')) + '</span>';
        return '';
    }

    function render(result, rules, ctx) {
        const s = result.scores;
        const verdict = s.overall >= 70 ? 'strong' : s.overall >= 45 ? 'possible' : 'weak';

        // attach keyword placement + sort: must-haves first, worst statuses on top
        const sections = window.CvRules.splitSections((ctx && ctx.cv) || '');
        result.keyword_table.forEach((k) => {
            k.where = k.status !== 'missing' ? window.CvRules.locateKeyword(k.keyword, sections) : '';
        });
        const sev = { missing: 0, partial: 1, found: 2 };
        const kws = result.keyword_table.slice().sort((a, b) =>
            a.importance === b.importance ? sev[a.status] - sev[b.status] : (a.importance === 'must' ? -1 : 1));
        const mustKw = kws.filter((k) => k.importance === 'must');
        const mustFound = mustKw.filter((k) => k.status !== 'missing').length;

        // before/after delta vs the previous analysis (this device)
        let deltaHtml = '';
        try {
            const last = JSON.parse(localStorage.getItem('cvlens_last') || 'null');
            if (last && typeof last.score === 'number' && last.score !== s.overall) {
                const d = s.overall - last.score;
                deltaHtml = '<span class="delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲ +' + d : '▼ ' + d) + ' ' + esc(t(d > 0 ? 'deltaUp' : 'deltaDown')) + '</span>';
            }
        } catch (e) { /* ignore */ }

        let html = '';

        // 1 — score card (numbers only, no prose)
        html += '<div class="card"><div class="score-wrap">' + ring(s.overall) +
            '<div class="flex-1 min-w-[250px]">' +
            '<div class="flex items-center gap-3 flex-wrap mb-3">' +
            '<span class="verdict ' + verdict + '">' + esc(t('verdict')[verdict]) + '</span>' + deltaHtml +
            (result.job.title ? '<span class="text-sm opacity-70">' + esc(t('jobDetected')) + ': <strong>' + esc(result.job.title) + (result.job.company ? ' — ' + esc(result.job.company) : '') + '</strong></span>' : '') +
            '</div>' +
            '<div class="subscores">' +
            subscore(t('subMust'), s.must_haves) + subscore(t('subKw'), s.keywords) +
            subscore(t('subExp'), s.experience) + subscore(t('subEdu'), s.education) + subscore(t('subFmt'), s.format) +
            '</div></div></div></div>';

        // 2 — summary in its own quote-style card
        if (result.summary) {
            html += '<div class="card"><h2 class="card-title">🧾 ' + esc(t('summary')) + '</h2>' +
                '<p class="sum-text">' + esc(result.summary) + '</p></div>';
        }

        // 3 — keyword table
        if (kws.length) {
            html += '<div class="card"><h2 class="card-title">🔑 ' + esc(t('keywordTable')) + '</h2>' +
                (mustKw.length ? '<p class="text-xs opacity-70 mb-2">' + esc(String(t('mustSummary')).replace('{found}', mustFound).replace('{total}', mustKw.length)) + '</p>' : '') +
                '<div class="overflow-x-auto"><table class="kw">' +
                '<thead><tr><th>' + esc(t('kwCol')) + '</th><th>' + esc(t('importanceCol')) + '</th><th>' + esc(t('statusCol')) + '</th><th>' + esc(t('evidenceCol')) + '</th></tr></thead><tbody>';
            kws.forEach((k) => {
                html += '<tr><td class="font-semibold">' + esc(k.keyword) + '</td>' +
                    '<td><span class="chip ' + k.importance + '">' + esc(t(k.importance === 'must' ? 'mustLabel' : 'niceLabel')) + '</span></td>' +
                    '<td>' + chip(k.status) + '</td>' +
                    '<td class="opacity-75">' + esc(k.evidence || t('noEvidence')) + whereTag(k) + '</td></tr>';
            });
            html += '</tbody></table></div></div>';
        }

        // 4 — one clearly-typed card per action: add / improve / remove
        const actionCards = [
            { key: 'addTitle', icon: '✅', cls: 'add', color: '#12855f', items: result.add.map((a) => ({ head: a.what, body: a.why, ex: a.example || '' })) },
            { key: 'improveTitle', icon: '✏️', cls: 'improve', color: '#b97a10', items: result.improve.map((i) => ({ head: i.section + ' — ' + i.suggestion, before: i.before, after: i.after })) },
            { key: 'removeTitle', icon: '❌', cls: 'remove', color: '#cf3a5a', items: result.remove.map((r) => ({ head: r.what, body: r.why })) },
        ];
        actionCards.forEach((sec) => {
            if (!sec.items.length) return;
            html += '<div class="card sec-card ' + sec.cls + '"><h2 class="card-title">' + sec.icon + ' ' + esc(t(sec.key)) +
                ' <span class="badge-count" style="background:' + sec.color + '1e;color:' + sec.color + ';">' + sec.items.length + '</span></h2>' +
                '<div class="sec-items">' + sec.items.map((it, i) => secItem(it, sec.color, i)).join('') + '</div></div>';
        });

        // AI rewrites land here (✨ button below) — empty until used
        html += '<div id="rewrites-box"></div>';

        // rule-based checks
        html += '<div class="card"><h2 class="card-title">⚡ ' + esc(t('rulesTitle')) + ' <span class="badge-count"' + (rules.failed.length ? ' style="background:#fdf0f2;color:#cf3a5a;"' : ' style="background:#eefaf3;color:#12855f;"') + '>' + rules.failed.length + '</span></h2>';
        if (rules.failed.length) {
            html += '<div class="grid gap-3 md:grid-cols-2">' + rules.failed.map((f) =>
                '<div class="item-card"><div class="font-semibold">⚠️ ' + esc(f.issue) + '</div><div class="why">→ ' + esc(f.fix) + '</div></div>').join('') + '</div>';
        }
        if (rules.passed.length) {
            html += '<div class="flex flex-wrap gap-2 mt-3">' + rules.passed.map((p) => '<span class="chip found">✓ ' + esc(p) + '</span>').join('') + '</div>';
        }
        html += '</div>';

        // actions
        html += '<div class="flex gap-3 justify-center flex-wrap no-print">' +
            '<button id="btn-rewrite" class="btn-primary text-sm px-5 py-2.5">✨ ' + esc(t('improveBullets')) + '</button>' +
            '<button id="btn-copy" class="btn-secondary">📋 ' + esc(t('copyReport')) + '</button>' +
            '<button id="btn-pdf" class="btn-secondary">' + esc(t('downloadPdf')) + '</button>' +
            '<button id="btn-print" class="btn-secondary">🖨️ ' + esc(t('printReport')) + '</button>' +
            '<button id="btn-share" class="btn-secondary">' + esc(t('shareScore')) + '</button>' +
            '<button id="btn-again" class="btn-secondary">🔁 ' + esc(t('reanalyze')) + '</button></div>';

        $('results').innerHTML = html;
        $('btn-copy').addEventListener('click', () => copyReport(result, rules));
        $('btn-pdf').addEventListener('click', downloadReport);
        $('btn-print').addEventListener('click', () => window.print());
        $('btn-share').addEventListener('click', shareScore);
        $('btn-again').addEventListener('click', runAnalysis);
        $('btn-rewrite').addEventListener('click', runRewrite);
    }

    // ---------- PDF export ----------
    // jsPDF cannot shape Arabic glyphs — in Arabic the browser's own
    // Print → Save as PDF handles it perfectly, so we route there instead.
    // The built-in helvetica font only covers Latin-1: normalize symbols
    // (arrows, emoji, smart quotes) before drawing, or they print as garbage.
    function pdfSafe(str) {
        return String(str ?? '')
            .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, '-').replace(/\u2192|\u21D2/g, '->')
            .replace(/[\u2022\u25CF\u00B7]/g, '-').replace(/\u26A0\uFE0F?/g, '!')
            .replace(/[\u2713\u2714]\uFE0F?/g, 'v').replace(/\u2026/g, '...')
            .replace(/\s+/g, ' ')
            .replace(/[^\u0000-\u00FF]/g, '').trim();
    }

    function downloadReport() {
        const result = currentResult, rules = currentRules;
        if (!result || !rules) return;
        if (window.I18N.get() === 'ar' || !window.jspdf || !window.jspdf.jsPDF) { window.print(); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const W = 210, M = 16, CW = W - M * 2;
        const TOP = 20, BOTTOM = 280;
        let y = 0;

        const INK = [51, 48, 46], MUTED = [120, 112, 99], ROSE = [224, 85, 140];
        const GREEN = [18, 133, 95], AMBER = [199, 122, 16], RED = [207, 58, 90];
        const scoreCol = (v) => (v >= 70 ? GREEN : v >= 45 ? AMBER : RED);
        const tint = (rgb, f) => rgb.map((c) => Math.round(c + (255 - c) * f));
        const setFont = (style, size, color) => {
            doc.setFont('helvetica', style); doc.setFontSize(size);
            doc.setTextColor(color[0], color[1], color[2]);
        };
        const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = TOP; } };

        // section title + right-aligned count pill + thin rule
        const section = (title, count, color) => {
            ensure(18);
            y += 4;
            setFont('bold', 12, INK);
            doc.text(pdfSafe(title), M, y);
            if (count != null) {
                const label = String(count);
                setFont('bold', 9.5, color || ROSE);
                const tw = doc.getTextWidth(label);
                const bw = tw + 7;
                const bg = tint(color || ROSE, 0.88);
                doc.setFillColor(bg[0], bg[1], bg[2]);
                doc.roundedRect(W - M - bw, y - 4.4, bw, 6, 3, 3, 'F');
                doc.text(label, W - M - bw / 2, y, { align: 'center' });
            }
            y += 2.4;
            doc.setDrawColor(239, 234, 228); doc.setLineWidth(0.4);
            doc.line(M, y, W - M, y);
            y += 5.5;
        };

        // ---- hero band ----
        doc.setFillColor(ROSE[0], ROSE[1], ROSE[2]);
        doc.rect(0, 0, W, 27, 'F');
        setFont('bold', 16, [255, 255, 255]);
        doc.text('CV Lens', M, 12);
        setFont('normal', 9, [255, 235, 244]);
        doc.text(pdfSafe(t('resultsTitle')), M, 19);
        setFont('normal', 8, [255, 235, 244]);
        let meta = new Date().toLocaleDateString();
        if (result.job.title) meta += '   |   ' + result.job.title;
        const metaLines = doc.splitTextToSize(pdfSafe(meta), 96);
        doc.text(metaLines[0] + (metaLines.length > 1 ? '...' : ''), W - M, 19, { align: 'right' });
        y = 40;

        // ---- score + verdict pill ----
        const s = result.scores;
        const sc = scoreCol(s.overall);
        setFont('bold', 34, sc);
        doc.text(String(s.overall), M, y);
        const scoreW = doc.getTextWidth(String(s.overall));
        setFont('bold', 12, MUTED);
        doc.text('/100', M + scoreW + 1.5, y);
        const verdict = s.overall >= 70 ? 'strong' : s.overall >= 45 ? 'possible' : 'weak';
        const vLabel = pdfSafe(t('verdict')[verdict]);
        setFont('bold', 11, sc);
        const vw = doc.getTextWidth(vLabel);
        const vx = M + scoreW + 16;
        const vbg = tint(sc, 0.88);
        doc.setFillColor(vbg[0], vbg[1], vbg[2]);
        doc.roundedRect(vx, y - 6.2, vw + 8, 8, 4, 4, 'F');
        doc.text(vLabel, vx + 4, y);

        // ---- subscore bars ----
        const subs = [[t('subMust'), s.must_haves], [t('subKw'), s.keywords], [t('subExp'), s.experience], [t('subEdu'), s.education], [t('subFmt'), s.format]];
        subs.forEach((p) => {
            y += 7.5;
            ensure(9);
            setFont('normal', 9, MUTED);
            doc.text(pdfSafe(p[0]), M, y);
            const bx = M + 92, bw = W - M - 11 - bx;
            doc.setFillColor(240, 234, 226);
            doc.roundedRect(bx, y - 3, bw, 3.2, 1.6, 1.6, 'F');
            const col = scoreCol(p[1]);
            doc.setFillColor(col[0], col[1], col[2]);
            const fillW = bw * p[1] / 100;
            if (fillW > 0.5) doc.roundedRect(bx, y - 3, fillW, 3.2, 1.6, 1.6, 'F');
            setFont('bold', 9, INK);
            doc.text(String(p[1]), W - M, y, { align: 'right' });
        });
        y += 2;

        // ---- summary in a soft accent box ----
        if (result.summary) {
            section(t('summary'));
            setFont('normal', 9.5, INK);
            const lines = doc.splitTextToSize(pdfSafe(result.summary), CW - 12);
            const lh = 4.6;
            const boxH = lines.length * lh + 7;
            ensure(boxH + 3);
            doc.setFillColor(250, 248, 245);
            doc.roundedRect(M, y - 4, CW, boxH, 3, 3, 'F');
            doc.setFillColor(ROSE[0], ROSE[1], ROSE[2]);
            doc.roundedRect(M, y - 4, 1.6, boxH, 0.8, 0.8, 'F');
            lines.forEach((ln, i) => doc.text(ln, M + 7, y + 1.5 + i * lh));
            y += boxH + 4;
        }

        // ---- keyword table (measured columns, page-break safe) ----
        if (result.keyword_table.length) {
            const sev = { missing: 0, partial: 1, found: 2 };
            const kws = result.keyword_table.slice().sort((a, b) =>
                a.importance === b.importance ? sev[a.status] - sev[b.status] : (a.importance === 'must' ? -1 : 1));
            const missing = kws.filter((k) => k.status === 'missing').length;
            section(t('keywordTable'), missing, missing ? RED : GREEN);
            const c0 = M, w0 = 50;
            const c1 = c0 + w0 + 4, w1 = 24;
            const c2 = c1 + w1 + 4, w2 = 21;
            const c3 = c2 + w2 + 4, w3 = W - M - c3;
            const clip = (str, size, width, style, color) => {
                setFont(style, size, color);
                const lines = doc.splitTextToSize(pdfSafe(str), width);
                return lines.length > 1 ? lines[0] + '...' : (lines[0] || '');
            };
            const drawHead = () => {
                doc.setFillColor(250, 248, 245);
                doc.rect(M, y - 3.2, CW, 5.8, 'F');
                setFont('bold', 7.5, MUTED);
                doc.text(pdfSafe(t('kwCol')), c0 + 1.5, y);
                doc.text(pdfSafe(t('importanceCol')), c1, y);
                doc.text(pdfSafe(t('statusCol')), c2, y);
                doc.text(pdfSafe(t('evidenceCol')), c3, y);
                y += 6;
            };
            drawHead();
            kws.forEach((k) => {
                setFont('bold', 8.5, INK);
                const kw = doc.splitTextToSize(pdfSafe(k.keyword), w0);
                const imp = clip(t(k.importance === 'must' ? 'mustLabel' : 'niceLabel'), 8, w1, 'normal', MUTED);
                const stCol = { found: GREEN, partial: AMBER, missing: RED }[k.status] || MUTED;
                const st = clip(t(k.status), 8, w2, 'bold', stCol);
                setFont('normal', 7.5, MUTED);
                const ev = k.evidence ? doc.splitTextToSize(pdfSafe(k.evidence), w3).slice(0, 2) : [];
                const lh = 3.7;
                const rowH = Math.max(kw.length, ev.length, 1) * lh + 2.8;
                if (y + rowH > BOTTOM) { doc.addPage(); y = TOP; drawHead(); }
                setFont('bold', 8.5, INK);
                kw.forEach((ln, i) => doc.text(ln, c0 + 1.5, y + i * lh));
                setFont('normal', 8, MUTED);
                doc.text(imp, c1, y);
                setFont('bold', 8, stCol);
                doc.text(st, c2, y);
                setFont('normal', 7.5, MUTED);
                ev.forEach((ln, i) => doc.text(ln, c3, y + i * lh));
                y += rowH;
                doc.setDrawColor(242, 238, 233); doc.setLineWidth(0.3);
                doc.line(M, y - 1.4, W - M, y - 1.4);
            });
            y += 3;
        }

        // ---- add / improve / remove as numbered lists ----
        const lists = [
            { title: t('addTitle'), color: GREEN, items: result.add.map((a) => ({ head: a.what, body: a.why, ex: a.example || '' })) },
            { title: t('improveTitle'), color: AMBER, items: result.improve.map((i) => ({ head: i.section + ' - ' + i.suggestion, body: (i.before || i.after) ? '"' + (i.before || '...') + '"  ->  "' + (i.after || '...') + '"' : '', ex: '' })) },
            { title: t('removeTitle'), color: RED, items: result.remove.map((r) => ({ head: r.what, body: r.why, ex: '' })) },
        ];
        lists.forEach((sec) => {
            if (!sec.items.length) return;
            section(sec.title, sec.items.length, sec.color);
            sec.items.forEach((it, idx) => {
                setFont('bold', 9, INK);
                const head = doc.splitTextToSize(pdfSafe(it.head), CW - 9);
                setFont('normal', 8.5, MUTED);
                const body = it.body ? doc.splitTextToSize(pdfSafe(it.body), CW - 9) : [];
                setFont('italic', 7.5, MUTED);
                const ex = it.ex ? doc.splitTextToSize(pdfSafe(t('exampleLabel') + ': ' + it.ex), CW - 9) : [];
                const hl = 4.2, bl = 3.9, el = 3.5;
                const h = head.length * hl + body.length * bl + ex.length * el + 4;
                ensure(h + 2);
                const bg = tint(sec.color, 0.9);
                doc.setFillColor(bg[0], bg[1], bg[2]);
                doc.circle(M + 2, y - 1.3, 2.3, 'F');
                setFont('bold', 8, sec.color);
                doc.text(String(idx + 1), M + 2, y, { align: 'center' });
                setFont('bold', 9, INK);
                head.forEach((ln, i) => doc.text(ln, M + 8, y + i * hl));
                let yy = y + head.length * hl;
                setFont('normal', 8.5, MUTED);
                body.forEach((ln, i) => doc.text(ln, M + 8, yy + i * bl));
                yy += body.length * bl;
                setFont('italic', 7.5, MUTED);
                ex.forEach((ln, i) => doc.text(ln, M + 8, yy + i * el));
                y += h + 1.5;
            });
        });

        // ---- rule-based checks ----
        section(t('rulesTitle'), rules.failed.length, rules.failed.length ? RED : GREEN);
        rules.failed.forEach((f) => {
            setFont('bold', 9, INK);
            const head = doc.splitTextToSize('! ' + pdfSafe(f.issue), CW - 9);
            setFont('normal', 8.5, MUTED);
            const body = doc.splitTextToSize(pdfSafe(f.fix), CW - 9);
            const h = head.length * 4.2 + body.length * 3.9 + 3.5;
            ensure(h + 2);
            doc.setFillColor(253, 240, 242);
            doc.circle(M + 2, y - 1.3, 2.3, 'F');
            setFont('bold', 8, RED);
            doc.text('!', M + 2, y, { align: 'center' });
            setFont('bold', 9, INK);
            head.forEach((ln, i) => doc.text(ln, M + 8, y + i * 4.2));
            let yy = y + head.length * 4.2;
            setFont('normal', 8.5, MUTED);
            body.forEach((ln, i) => doc.text(ln, M + 8, yy + i * 3.9));
            y += h + 1.5;
        });
        if (rules.passed.length) {
            ensure(8);
            setFont('normal', 8.5, GREEN);
            doc.text(doc.splitTextToSize(pdfSafe('v  ' + rules.passed.join('   ·   ')), CW), M, y);
        }

        // ---- footer on every page ----
        const pages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            setFont('normal', 8, [168, 160, 146]);
            doc.text('CV Lens  -  hajar-benhadj.github.io/ats-cv-checker', M, 291);
            doc.text(i + ' / ' + pages, W - M, 291, { align: 'right' });
        }
        doc.save('cv-lens-report.pdf');
    }

    // ---------- shareable score card (canvas PNG) ----------
    function shareScore() {
        const result = currentResult;
        if (!result) return;
        const s = result.scores;
        const canvas = document.createElement('canvas');
        canvas.width = 1200; canvas.height = 630;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#fdfcfa';
        ctx.fillRect(0, 0, 1200, 630);
        const blob = (x, y, r, color) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
        };
        blob(150, 110, 320, 'rgba(236,114,182,.22)');
        blob(1060, 540, 340, 'rgba(196,181,253,.28)');

        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#33302e';
        ctx.font = '800 46px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText('🎯 CV Lens', 70, 100);
        ctx.fillStyle = '#8d8579';
        ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(t('overall'), 70, 138);

        const verdict = s.overall >= 70 ? 'strong' : s.overall >= 45 ? 'possible' : 'weak';
        const vCol = s.overall >= 70 ? '#12855f' : s.overall >= 45 ? '#d99a1e' : '#cf3a5a';
        ctx.fillStyle = vCol;
        ctx.font = '800 32px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(t('verdict')[verdict], 70, 205);

        // mini stats on the left
        [[t('subMust'), s.must_haves, 240], [t('subKw'), s.keywords, 380], [t('subFmt'), s.format, 520]].forEach((p) => {
            ctx.fillStyle = '#e0558c';
            ctx.font = '800 40px "Plus Jakarta Sans", system-ui, sans-serif';
            ctx.fillText(p[1] + '%', 70, p[2]);
            ctx.fillStyle = '#8d8579';
            ctx.font = '600 20px "Plus Jakarta Sans", system-ui, sans-serif';
            ctx.fillText(String(p[0]), 70, p[2] + 26);
        });

        // score ring on the right
        const cx = 930, cy = 300, r = 165;
        ctx.lineWidth = 30;
        ctx.strokeStyle = 'rgba(0,0,0,.07)';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = vCol; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.overall / 100); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#33302e';
        ctx.font = '800 105px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(String(s.overall), cx, cy + 18);
        ctx.fillStyle = '#8d8579';
        ctx.font = '700 30px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText('/100', cx, cy + 56);

        ctx.fillStyle = '#a89f92';
        ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText('hajar-benhadj.github.io/ats-cv-checker', 600, 595);

        canvas.toBlob((b) => {
            if (!b) return;
            const file = new File([b], 'cv-lens-score.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: 'CV Lens' }).catch(() => {});
            } else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(b);
                a.download = 'cv-lens-score.png';
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            }
        }, 'image/png');
    }

    function copyReport(result, rules) {
        const lines = [];
        lines.push('CV Lens — ' + t('resultsTitle'));
        lines.push('='.repeat(40));
        lines.push(t('overall') + ': ' + result.scores.overall + '/100');
        lines.push('');
        lines.push(t('summary') + ': ' + result.summary);
        lines.push('');
        lines.push(t('keywordTable') + ':');
        result.keyword_table.forEach((k) => lines.push('  [' + k.status.toUpperCase() + '] ' + k.keyword + (k.importance === 'must' ? ' (' + t('mustLabel') + ')' : '') + (k.evidence ? ' — ' + k.evidence : '')));
        lines.push('');
        lines.push(t('addTitle') + ':');
        result.add.forEach((a) => lines.push('  + ' + a.what + ' — ' + a.why + (a.example ? ' | ' + a.example : '')));
        lines.push('');
        lines.push(t('improveTitle') + ':');
        result.improve.forEach((i) => lines.push('  ~ ' + i.section + ': ' + i.suggestion + (i.before ? ' | "' + i.before + '" → "' + i.after + '"' : '')));
        lines.push('');
        lines.push(t('removeTitle') + ':');
        result.remove.forEach((r) => lines.push('  - ' + r.what + ' — ' + r.why));
        lines.push('');
        lines.push(t('rulesTitle') + ':');
        rules.failed.forEach((f) => lines.push('  ! ' + f.issue + ' → ' + f.fix));
        rules.passed.forEach((p) => lines.push('  ✓ ' + p));
        navigator.clipboard.writeText(lines.join('\n')).then(() => {
            const b = $('btn-copy');
            b.textContent = '✅ ' + t('copied');
            setTimeout(() => { b.textContent = '📋 ' + t('copyReport'); }, 1800);
        }).catch(() => {});
    }

    // ---------- init ----------
    document.addEventListener('DOMContentLoaded', () => {
        initCvInput();
        initJobFetch();
        initAnalyze();
        window.I18N.apply();
        $('lang-select').addEventListener('change', (e) => window.I18N.setLang(e.target.value));
        updateStats();
        renderHistory();
    });
})();
