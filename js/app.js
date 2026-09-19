// app.js — UI wiring (no settings: analysis runs server-side, ready out of the box)
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const t = (k) => window.I18N.t(k);
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // ---------- CV input ----------
    function initCvInput() {
        const zone = $('cv-drop'), input = $('inp-cv-file'), area = $('inp-cv');
        zone.addEventListener('click', () => input.click());
        $('btn-cv-browse').addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
        ['dragover', 'dragenter'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
        ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
        zone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
        input.addEventListener('change', () => { if (input.files.length) handleFile(input.files[0]); });
        area.addEventListener('input', updateStats);

        async function handleFile(file) {
            try {
                setStatus('analyze-status', '⏳ ' + esc(file.name) + ' …');
                const text = await window.CvExtract.extractFile(file);
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
        const st = $('fetch-status');
        if (!url) return;
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
                    if (res.status === 451 || /login/i.test(msg)) { st.textContent = '🔒 ' + t('linkedinWarn'); return; }
                    throw new Error('HTTP ' + res.status);
                }
                let text = PROXIES[i].json ? (await res.json()).text : (await res.text());
                if (PROXIES[i].clean) text = PROXIES[i].clean(String(text).trim());
                text = String(text || '').trim();
                if (text.split(/\s+/).filter(Boolean).length < 40) throw new Error('too short');
                $('inp-job').value = text.slice(0, 15000);
                st.textContent = '✅ ' + t('fetchOk');
                return;
            } catch (e) { /* try next */ }
        }
        st.textContent = '⚠️ ' + t('fetchFail');
    }

    // ---------- analyze ----------
    function initAnalyze() {
        $('btn-analyze').addEventListener('click', runAnalysis);
    }

    function setStatus(id, msg) { $(id).textContent = msg || ''; }

    let elapsedTimer = null;
    function startElapsed() {
        const t0 = Date.now();
        stopElapsed();
        elapsedTimer = setInterval(() => {
            const s = Math.round((Date.now() - t0) / 1000);
            setStatus('analyze-status', '🧠 ' + t('analyzing') + ' (' + s + 's)');
        }, 1000);
    }
    function stopElapsed() { if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; } }

    async function runAnalysis() {
        const cv = $('inp-cv').value.trim();
        const job = $('inp-job').value.trim();
        if (cv.length < 100 || job.length < 100) { setStatus('analyze-status', '⚠️ ' + t('needBoth')); return; }

        const rules = window.CvRules.runRules(cv, window.I18N.get());
        const btn = $('btn-analyze');
        btn.disabled = true;
        startElapsed();
        $('results').classList.add('hidden');

        try {
            const result = await window.CvAnalyze.analyze(cv, job, rules.failed, window.I18N.get());
            render(result, rules);
            stopElapsed();
            setStatus('analyze-status', '');
            $('results').classList.remove('hidden');
            $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (err) {
            stopElapsed();
            setStatus('analyze-status', '❌ ' + t('errorPrefix') + esc(err.message));
        } finally {
            btn.disabled = false;
        }
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

    function render(result, rules) {
        const s = result.scores;
        const verdict = s.overall >= 70 ? 'strong' : s.overall >= 45 ? 'possible' : 'weak';

        let html = '';

        // header card
        html += '<div class="card"><div class="score-wrap">' + ring(s.overall) +
            '<div class="flex-1 min-w-[250px]">' +
            '<div class="flex items-center gap-3 flex-wrap mb-3">' +
            '<span class="verdict ' + verdict + '">' + esc(t('verdict')[verdict]) + '</span>' +
            (result.job.title ? '<span class="text-sm opacity-70">' + esc(t('jobDetected')) + ': <strong>' + esc(result.job.title) + (result.job.company ? ' — ' + esc(result.job.company) : '') + '</strong></span>' : '') +
            '</div>' +
            '<div class="subscores">' +
            subscore(t('subMust'), s.must_haves) + subscore(t('subKw'), s.keywords) +
            subscore(t('subExp'), s.experience) + subscore(t('subEdu'), s.education) + subscore(t('subFmt'), s.format) +
            '</div></div></div>' +
            (result.summary ? '<p class="mt-4 text-sm leading-relaxed">' + esc(result.summary) + '</p>' : '') +
            '</div>';

        // keyword table
        if (result.keyword_table.length) {
            html += '<div class="card"><h2 class="card-title">🔑 ' + esc(t('keywordTable')) + '</h2><div class="overflow-x-auto"><table class="kw">' +
                '<thead><tr><th>' + esc(t('kwCol')) + '</th><th>' + esc(t('importanceCol')) + '</th><th>' + esc(t('statusCol')) + '</th><th>' + esc(t('evidenceCol')) + '</th></tr></thead><tbody>';
            result.keyword_table.forEach((k) => {
                html += '<tr><td class="font-semibold">' + esc(k.keyword) + '</td>' +
                    '<td><span class="chip ' + k.importance + '">' + esc(t(k.importance === 'must' ? 'mustLabel' : 'niceLabel')) + '</span></td>' +
                    '<td>' + chip(k.status) + '</td>' +
                    '<td class="opacity-75">' + esc(k.evidence || t('noEvidence')) + '</td></tr>';
            });
            html += '</tbody></table></div></div>';
        }

        // add / improve / remove
        const sections = [
            { title: t('addTitle'), items: result.add, cls: '✅', withExample: true },
            { title: t('improveTitle'), items: result.improve.map((i) => ({ what: i.section + ' — ' + i.suggestion, why: '“' + (i.before || '…') + '”  →  “' + (i.after || '…') + '”', example: '' })), cls: '✏️', withExample: false },
            { title: t('removeTitle'), items: result.remove, cls: '❌', withExample: false },
        ];
        sections.forEach((sec) => {
            if (!sec.items.length) return;
            html += '<div class="card"><h2 class="card-title">' + sec.cls + ' ' + esc(sec.title) +
                ' <span class="badge-count" style="background:rgba(56,189,248,.15);color:#7dd3fc;">' + sec.items.length + '</span></h2>' +
                '<div class="grid gap-3 md:grid-cols-2">' + sec.items.map((i) => itemCard(i, sec.withExample)).join('') + '</div></div>';
        });

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
        html += '<div class="flex gap-3 justify-center no-print">' +
            '<button id="btn-copy" class="btn-secondary">📋 ' + esc(t('copyReport')) + '</button>' +
            '<button id="btn-print" class="btn-secondary">🖨️ ' + esc(t('printReport')) + '</button>' +
            '<button id="btn-again" class="btn-secondary">🔁 ' + esc(t('reanalyze')) + '</button></div>';

        $('results').innerHTML = html;
        $('btn-copy').addEventListener('click', () => copyReport(result, rules));
        $('btn-print').addEventListener('click', () => window.print());
        $('btn-again').addEventListener('click', runAnalysis);
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
    });
})();
