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

    function loadExample() {
        $('inp-cv').value = [
            'HAJAR BENHADJ — Software Developer, Casablanca',
            'Email: hajar@example.com | +212 612 345 678 | linkedin.com/in/hajar-benhadj | github.com/hajar-benhadj',
            '',
            'EXPERIENCE',
            'Freelance Automation Developer (2024 – Present)',
            'Developed an n8n automation product sold to small businesses, reducing manual admin work by 80%.',
            'Built AI integrations with the OpenAI API for document analysis and email summarization.',
            'Software Engineering Intern — AI Vision Team (2023 – 2024)',
            'Implemented a real-time fall detection system with OpenCV and MediaPipe (92% precision on 5,000 frames).',
            'Automated Swagger/OpenAPI REST API test generation with Pytest, cutting test-writing time by 60%.',
            '',
            'SKILLS',
            'Python, JavaScript (ES6+), HTML5, CSS3, OpenAI API, n8n, OpenCV, MediaPipe, Pytest, Git, GitHub Actions.',
            '',
            'EDUCATION',
            'BSc Computer Science — Hassan II University (2020 – 2023)',
            '',
            'LANGUAGES',
            'Arabic (native), French (fluent), English (fluent), German (B1)',
        ].join('\n');
        $('inp-job').value = [
            'Junior Full-Stack Developer (React / Node.js) — TechMart, Casablanca (hybrid)',
            'We build e-commerce dashboards used by 200+ Moroccan retailers. Team of 5, React + TypeScript + Node.js.',
            'Required: 1+ year with React and modern JavaScript · Node.js REST API development · TypeScript · SQL (PostgreSQL or MySQL) · French AND English · Git and code review.',
            'Nice to have: Docker · CI/CD · AWS/GCP · interest in AI features.',
            'CDI, 12,000–16,000 MAD/month.',
        ].join('\n');
        updateStats();
        setStatus('analyze-status', '');
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
            box.innerHTML = '<h2 class="card-title">✨ ' + esc(t('rewritesTitle')) +
                ' <span class="badge-count" style="background:rgba(129,140,248,.15);color:#a5b4fc;">' + rewrites.length + '</span></h2>' +
                '<div class="grid gap-3">' + rewrites.map((r, i) =>
                    '<div class="item-card rewrite-card">' +
                    '<div class="rw-orig"><span class="rw-label">' + esc(t('originalLabel')) + '</span>' + esc(r.original) + '</div>' +
                    '<div class="rw-better"><span class="rw-label ok">' + esc(t('improvedLabel')) + '</span>' + esc(r.rewritten) +
                    '<button class="btn-secondary rw-copy" data-rw="' + i + '">📋 ' + esc(t('copyBullet')) + '</button></div>' +
                    '<div class="why">💡 ' + esc(r.why) + '</div>' +
                    '</div>').join('') + '</div>';
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
    function scoreColor(score) { return score >= 70 ? '#34d399' : score >= 45 ? '#fbbf24' : '#f87171'; }
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
        const color = score >= 70 ? '#34d399' : score >= 45 ? '#fbbf24' : '#f87171';
        return '<div class="score-ring"><svg width="130" height="130" viewBox="0 0 130 130">' +
            '<circle cx="65" cy="65" r="' + r + '" fill="none" stroke="rgba(148,163,184,.15)" stroke-width="10"/>' +
            '<circle cx="65" cy="65" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '"/>' +
            '</svg><div class="num">' + score + '<small>' + esc(t('overall')) + '</small></div></div>';
    }

    function subscore(label, val) {
        return '<div class="subscore"><div class="flex justify-between text-xs font-semibold"><span class="opacity-80">' + esc(label) + '</span><span>' + val + '</span></div><div class="bar"><div style="width:' + val + '%"></div></div></div>';
    }

    function chip(status) { return '<span class="chip ' + status + '">' + esc(t(status)) + '</span>'; }

    function itemCard(item, withExample) {
        let html = '<div class="item-card"><div class="font-semibold">' + esc(item.what) + '</div><div class="why">' + esc(item.why) + '</div>';
        if (withExample && item.example) html += '<div class="example">💡 ' + esc(t('example')) + ': ' + esc(item.example) + '</div>';
        html += '</div>';
        return html;
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

        // header card
        html += '<div class="card"><div class="score-wrap">' + ring(s.overall) +
            '<div class="flex-1 min-w-[250px]">' +
            '<div class="flex items-center gap-3 flex-wrap mb-3">' +
            '<span class="verdict ' + verdict + '">' + esc(t('verdict')[verdict]) + '</span>' + deltaHtml +
            (result.job.title ? '<span class="text-sm opacity-70">' + esc(t('jobDetected')) + ': <strong>' + esc(result.job.title) + (result.job.company ? ' — ' + esc(result.job.company) : '') + '</strong></span>' : '') +
            '</div>' +
            '<div class="subscores">' +
            subscore(t('subMust'), s.must_haves) + subscore(t('subKw'), s.keywords) +
            subscore(t('subExp'), s.experience) + subscore(t('subEdu'), s.education) + subscore(t('subFmt'), s.format) +
            '</div></div></div>' +
            (result.summary ? '<p class="mt-4 text-sm leading-relaxed">' + esc(result.summary) + '</p>' : '') +
            '</div>';

        // keyword table
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

        // add / improve / remove
        const sectionsHtml = [
            { title: t('addTitle'), items: result.add, cls: '✅', withExample: true },
            { title: t('improveTitle'), items: result.improve.map((i) => ({ what: i.section + ' — ' + i.suggestion, why: '“' + (i.before || '…') + '”  →  “' + (i.after || '…') + '”', example: '' })), cls: '✏️', withExample: false },
            { title: t('removeTitle'), items: result.remove, cls: '❌', withExample: false },
        ];
        sectionsHtml.forEach((sec) => {
            if (!sec.items.length) return;
            html += '<div class="card"><h2 class="card-title">' + sec.cls + ' ' + esc(sec.title) +
                ' <span class="badge-count" style="background:rgba(56,189,248,.15);color:#7dd3fc;">' + sec.items.length + '</span></h2>' +
                '<div class="grid gap-3 md:grid-cols-2">' + sec.items.map((i) => itemCard(i, sec.withExample)).join('') + '</div></div>';
        });

        // AI rewrites land here (✨ button below)
        html += '<div id="rewrites-box" class="card"></div>';

        // rule-based checks
        html += '<div class="card"><h2 class="card-title">⚡ ' + esc(t('rulesTitle')) + ' <span class="badge-count" style="background:' + (rules.failed.length ? 'rgba(248,113,113,.15);color:#fca5a5' : 'rgba(52,211,153,.15);color:#6ee7b7') + ';">' + rules.failed.length + '</span></h2>';
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
    function downloadReport() {
        const result = currentResult, rules = currentRules;
        if (!result || !rules) return;
        if (window.I18N.get() === 'ar' || !window.jspdf || !window.jspdf.jsPDF) { window.print(); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const W = 210, M = 16;
        let y = 0;

        // header band
        doc.setFillColor(2, 132, 199);
        doc.rect(0, 0, W, 24, 'F');
        doc.setTextColor(255);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
        doc.text('CV Lens — ' + t('resultsTitle'), M, 11);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.text(new Date().toLocaleString() + (result.job.title ? '   ·   ' + result.job.title : ''), M, 18);
        y = 34;

        const ensure = (h) => { if (y + h > 282) { doc.addPage(); y = 20; } };

        // score + verdict
        const s = result.scores;
        const col = s.overall >= 70 ? [22, 163, 74] : s.overall >= 45 ? [217, 119, 6] : [220, 38, 38];
        doc.setFont('helvetica', 'bold'); doc.setFontSize(32); doc.setTextColor(col[0], col[1], col[2]);
        doc.text(s.overall + '/100', M, y);
        doc.setFontSize(11); doc.setTextColor(71, 85, 105);
        doc.text(t('verdict')[s.overall >= 70 ? 'strong' : s.overall >= 45 ? 'possible' : 'weak'], M + 45, y);
        y += 10;

        // subscore bars
        [[t('subMust'), s.must_haves], [t('subKw'), s.keywords], [t('subExp'), s.experience], [t('subEdu'), s.education], [t('subFmt'), s.format]].forEach((pair) => {
            ensure(10);
            doc.setFontSize(9); doc.setTextColor(71, 85, 105);
            doc.text(String(pair[0]), M, y);
            doc.setFillColor(226, 232, 240);
            doc.rect(W - M - 60, y - 3.5, 60, 3.5, 'F');
            doc.setFillColor(14, 165, 233);
            doc.rect(W - M - 60, y - 3.5, 60 * pair[1] / 100, 3.5, 'F');
            doc.setTextColor(15, 23, 42);
            doc.text(String(pair[1]), W - M - 64, y, { align: 'right' });
            y += 7;
        });
        y += 2;

        // summary
        if (result.summary) {
            ensure(16);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 41, 59);
            doc.text(t('summary'), M, y); y += 5;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(51, 65, 85);
            doc.text(doc.splitTextToSize(result.summary, W - M * 2), M, y);
            y += doc.splitTextToSize(result.summary, W - M * 2).length * 4.5 + 4;
        }

        // keyword table
        if (result.keyword_table.length) {
            ensure(20);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 41, 59);
            doc.text(t('keywordTable'), M, y); y += 6;
            doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
            doc.text(t('kwCol'), M, y);
            doc.text(t('importanceCol'), M + 62, y);
            doc.text(t('statusCol'), M + 92, y);
            doc.text(t('evidenceCol'), M + 118, y);
            y += 2; doc.setDrawColor(226, 232, 240); doc.line(M, y, W - M, y); y += 4;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
            result.keyword_table.forEach((k) => {
                const kwLines = doc.splitTextToSize(String(k.keyword || ''), 58);
                ensure(kwLines.length * 4 + 3);
                doc.setTextColor(15, 23, 42);
                doc.text(kwLines, M, y);
                doc.setTextColor(100, 116, 139);
                doc.text(t(k.importance === 'must' ? 'mustLabel' : 'niceLabel'), M + 62, y);
                const st = { found: [22, 163, 74], partial: [217, 119, 6], missing: [220, 38, 38] }[k.status] || [100, 116, 139];
                doc.setTextColor(st[0], st[1], st[2]);
                doc.text(t(k.status), M + 92, y);
                if (k.evidence) {
                    doc.setTextColor(100, 116, 139);
                    doc.text(doc.splitTextToSize(String(k.evidence).slice(0, 60), 66), M + 118, y);
                }
                y += kwLines.length * 4 + 2.5;
            });
            y += 3;
        }

        // add / improve / remove sections
        [['✅ ' + t('addTitle'), result.add, true],
         ['✏️ ' + t('improveTitle'), result.improve.map((i) => ({ what: i.section + ' — ' + i.suggestion, why: '“' + (i.before || '…') + '” → “' + (i.after || '…') + '”', example: '' })), false],
         ['❌ ' + t('removeTitle'), result.remove, false]].forEach((sec) => {
            if (!sec[1].length) return;
            ensure(14);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 41, 59);
            doc.text(sec[0], M, y); y += 5;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            sec[1].forEach((item) => {
                const lines = doc.splitTextToSize('• ' + item.what + (item.why ? ' — ' + item.why : ''), W - M * 2);
                ensure(lines.length * 4.5 + 2);
                doc.setTextColor(51, 65, 85);
                doc.text(lines, M, y);
                y += lines.length * 4.5 + 2;
            });
            y += 3;
        });

        // rule-based checks
        if (rules.failed.length) {
            ensure(14);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 41, 59);
            doc.text(t('rulesTitle'), M, y); y += 5;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            rules.failed.forEach((f) => {
                const lines = doc.splitTextToSize('⚠ ' + f.issue + ' → ' + f.fix, W - M * 2);
                ensure(lines.length * 4.5 + 2);
                doc.setTextColor(51, 65, 85);
                doc.text(lines, M, y);
                y += lines.length * 4.5 + 2;
            });
        }

        // footer on every page
        const pages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            doc.setFontSize(8); doc.setTextColor(148, 163, 184);
            doc.text('CV Lens — hajar-benhadj.github.io/ats-cv-checker', W / 2, 291, { align: 'center' });
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

        ctx.fillStyle = '#0b1120';
        ctx.fillRect(0, 0, 1200, 630);
        const blob = (x, y, r, color) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
        };
        blob(150, 110, 320, 'rgba(14,165,233,.35)');
        blob(1060, 540, 340, 'rgba(99,102,241,.35)');

        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '800 46px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText('🎯 CV Lens', 70, 100);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(t('overall'), 70, 138);

        const verdict = s.overall >= 70 ? 'strong' : s.overall >= 45 ? 'possible' : 'weak';
        const vCol = s.overall >= 70 ? '#34d399' : s.overall >= 45 ? '#fbbf24' : '#f87171';
        ctx.fillStyle = vCol;
        ctx.font = '800 32px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(t('verdict')[verdict], 70, 205);

        // mini stats on the left
        [[t('subMust'), s.must_haves, 240], [t('subKw'), s.keywords, 380], [t('subFmt'), s.format, 520]].forEach((p) => {
            ctx.fillStyle = '#7dd3fc';
            ctx.font = '800 40px "Plus Jakarta Sans", system-ui, sans-serif';
            ctx.fillText(p[1] + '%', 70, p[2]);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '600 20px "Plus Jakarta Sans", system-ui, sans-serif';
            ctx.fillText(String(p[0]), 70, p[2] + 26);
        });

        // score ring on the right
        const cx = 930, cy = 300, r = 165;
        ctx.lineWidth = 30;
        ctx.strokeStyle = 'rgba(148,163,184,.15)';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = vCol; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.overall / 100); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '800 105px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(String(s.overall), cx, cy + 18);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 30px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText('/100', cx, cy + 56);

        ctx.fillStyle = '#64748b';
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
        const ex = $('btn-example');
        if (ex) ex.addEventListener('click', loadExample);
        updateStats();
        renderHistory();
    });
})();
