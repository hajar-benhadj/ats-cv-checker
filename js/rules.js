// rules.js — deterministic ATS formatting checks (no AI, always accurate)
(function () {
    'use strict';

    const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
    const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
    const LINKEDIN_RE = /linkedin\.com\/(in|pub)\//i;
    const SECTION_WORDS = /(experience|work history|employment|education|skills|projects|certifications?|formation|exp[eé]rience|comp[eé]tences|projets|parcours|الخبرة|الخبرات|التعليم|المهارات|المشاريع)/i;
    const ACTION_VERBS = /\b(designed|developed|built|created|implemented|led|improved|automated|delivered|reduced|increased|optimized|launched|managed|analyzed|migrated|con[aç]u|d[eé]velopp[eé]|r[eé]alis[eé]|pilot[eé]|am[eé]lior[eé]|automatis[eé]|livr[eé]|analys[eé])\w*/i;
    const FIRST_PERSON = /\b(I|my|me|je|mon|ma|mes)\b/g;

    // Synonym groups — a keyword "matches" the CV when any variant is present.
    // Keeps keyword location honest (no false "missing" for JS vs JavaScript).
    const SYNONYM_GROUPS = [
        ['javascript', 'js', 'es6', 'ecmascript'],
        ['typescript'],
        ['node.js', 'nodejs', 'node js', 'node'],
        ['react', 'reactjs', 'react.js'],
        ['angular', 'angularjs'],
        ['vue', 'vuejs', 'vue.js'],
        ['postgresql', 'postgres'],
        ['mongodb', 'mongo'],
        ['mysql'],
        ['ci/cd', 'ci-cd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
        ['rest api', 'rest apis', 'restful api', 'restful apis', 'api rest'],
        ['machine learning', 'ml'],
        ['deep learning', 'neural networks'],
        ['artificial intelligence', 'ai'],
        ['opencv', 'cv2'],
        ['mediapipe'],
        ['kubernetes', 'k8s'],
        ['amazon web services', 'aws'],
        ['google cloud', 'gcp'],
        ['microsoft azure', 'azure'],
        ['docker', 'dockerized', 'containerized'],
        ['pytest', 'py.test'],
        ['power bi', 'powerbi'],
        ['microsoft office', 'ms office', 'office suite'],
        ['problem solving', 'problem-solving'],
        ['teamwork', 'team work'],
        ['communication skills', 'communication'],
    ];

    function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    /** Case-insensitive regex matching the keyword and all its synonyms. */
    function termRegex(term) {
        const t = String(term || '').toLowerCase().trim();
        if (!t) return /$^/;
        const group = SYNONYM_GROUPS.find((g) => g.includes(t)) || [t];
        return new RegExp('(^|[^\\p{L}])(' + group.map(escapeRe).join('|') + ')(?![\\p{L}])', 'iu');
    }

    // ---- CV section splitting (for keyword placement) ----
    const SECTION_HEADINGS = [
        { key: 'experience', re: /^(work |professional |relevant )?(experience|employment|work history|exp[eé]riences?(\s*professionnelle?s?)?|emploi|الخبرة|الخبرات|خبرة مهنية)/i },
        { key: 'education', re: /^(education|academic background|formation|études|التعليم|التكوين|المؤهلات)/i },
        { key: 'skills', re: /^(technical |core |key )?(skills|competencies|comp[eé]tences|المهارات|المهارات التقنية)/i },
        { key: 'projects', re: /^(projects|selected projects|projets|المشاريع)/i },
        { key: 'certifications', re: /^(certifications?|certificates|licenses|certificats|الشهادات)/i },
        { key: 'summary', re: /^(summary|profile|about( me)?|objective|r[eé]sum[eé]|profil|à propos|الملخص|نبذة)/i },
    ];

    /** Split CV text into named sections based on heading lines. */
    function splitSections(cv) {
        const out = {};
        let current = 'header';
        String(cv || '').split(/\n/).forEach((line) => {
            const h = line.trim().replace(/^[^\wÀ-ÿ\u0600-\u06FF]+/, '').replace(/[^\wÀ-ÿ\u0600-\u06FF]+$/, '').toLowerCase();
            const hit = h && h.length <= 45 ? SECTION_HEADINGS.find((s) => s.re.test(h)) : null;
            if (hit) current = hit.key;
            else {
                if (!out[current]) out[current] = [];
                out[current].push(line);
            }
        });
        const flat = {};
        Object.keys(out).forEach((k) => { flat[k] = out[k].join('\n'); });
        return flat;
    }

    /**
     * Where does this keyword actually live in the CV?
     * Tries the full phrase first, then falls back to the phrase's significant
     * tokens (AI keywords are often long phrases like "Node.js REST API development").
     * @returns {'experience'|'projects'|'education'|'skills'|'other'|''}
     */
    const PLACEMENT_STOP = new Set(['and', 'or', 'the', 'with', 'for', 'of', 'in', 'to', 'a', 'an', 'your', 'our', 'their', 'using', 'use', 'used', 'plus', 'strong', 'good', 'knowledge', 'skills', 'skill', 'experience', 'years', 'year', 'ability', 'able', 'work', 'working', 'team', 'teams', 'new', 'development', 'developer', 'related']);

    function locateKeyword(term, sections) {
        const re = termRegex(term);
        const order = ['experience', 'projects', 'education', 'skills'];
        for (const k of order) if (sections[k] && re.test(sections[k])) return k;

        const tokens = String(term).toLowerCase().split(/[^a-z0-9+#.]+/)
            .filter((s) => s.length >= 3 && !PLACEMENT_STOP.has(s));
        if (tokens.length) {
            for (const k of order) {
                if (!sections[k]) continue;
                if (tokens.some((tok) => termRegex(tok).test(sections[k]))) return k;
            }
        }
        for (const k of Object.keys(sections)) if (re.test(sections[k])) return 'other';
        return '';
    }

    // ---- employment gap detection ----
    function dateGaps(text) {
        const re = /((?:19|20)\d{2})\s*(?:–|—|-{1,2}|to|à|au|jusqu'?au)\s*((?:19|20)\d{2}|present|now|actual|actuel|maintenant|حاليا)/gi;
        const iv = [];
        let m;
        while ((m = re.exec(text))) {
            const s = parseInt(m[1], 10);
            const e = /present|now|actual|actuel|maintenant|حاليا/i.test(m[2]) ? new Date().getFullYear() : parseInt(m[2], 10);
            if (e >= s && s > 1950) iv.push([s, e]);
        }
        if (iv.length < 2) return [];
        iv.sort((a, b) => a[0] - b[0]);
        // merge overlapping intervals (parallel study + work should not look like a gap)
        const merged = [iv[0]];
        for (let i = 1; i < iv.length; i++) {
            const last = merged[merged.length - 1];
            if (iv[i][0] <= last[1]) last[1] = Math.max(last[1], iv[i][1]);
            else merged.push(iv[i]);
        }
        const gaps = [];
        for (let i = 1; i < merged.length; i++) {
            const from = merged[i - 1][1] + 1;
            const to = merged[i][0] - 1;
            if (to >= from) gaps.push(from === to ? String(from) : from + '–' + to);
        }
        return gaps;
    }

    /**
     * Run rule-based ATS checks on CV text.
     * @param {string} cv
     * @param {'en'|'fr'|'ar'} lang
     * @param {{hasImages?: boolean, hasRepeatingHeader?: boolean}} [meta] PDF structure info from extract.js
     * @returns {{passed: string[], failed: {issue: string, fix: string}[]}}
     */
    function runRules(cv, lang, meta) {
        meta = meta || {};
        const L = (en, fr, ar) => (lang === 'fr' ? fr : lang === 'ar' ? ar : en);
        const text = cv || '';
        const words = text.split(/\s+/).filter(Boolean).length;
        const passed = [];
        const failed = [];

        const P = (en, fr, ar) => passed.push(L(en, fr, ar));
        const F = (en, fr, ar) => failed.push({ issue: L(en[0], fr[0], ar[0]), fix: L(en[1], fr[1], ar[1]) });

        // contact info
        if (EMAIL_RE.test(text)) P('Email present', 'E-mail présent', 'البريد الإلكتروني موجود'); else
            F(['No email address found', 'Add a professional email at the top — ATS parsers look for it.'],
              ['Aucune adresse e-mail trouvée', 'Ajoutez un e-mail professionnel en haut — les ATS le cherchent.'],
              ['لا يوجد بريد إلكتروني', 'أضف بريدًا إلكترونيًا مهنيًا في الأعلى — أنظمة ATS تبحث عنه.']);
        if (PHONE_RE.test(text)) P('Phone number present', 'Numéro de téléphone présent', 'رقم الهاتف موجود'); else
            F(['No phone number found', 'Add a phone number in an international format (e.g. +212 6…).'],
              ['Aucun numéro de téléphone', 'Ajoutez un numéro au format international (ex. +212 6…).'],
              ['لا يوجد رقم هاتف', 'أضف رقمًا بصيغة دولية (مثال +212 6…).']);
        if (LINKEDIN_RE.test(text)) P('LinkedIn URL present', 'Lien LinkedIn présent', 'رابط LinkedIn موجود'); else
            F(['No LinkedIn profile link', 'Recruiters expect a LinkedIn URL near your contact info.'],
              ['Pas de lien LinkedIn', 'Les recruteurs s\u2019attendent à un lien LinkedIn près de vos coordonnées.'],
              ['لا يوجد رابط LinkedIn', 'يتوقع مسؤولو التوظيف رابط LinkedIn قرب معلومات الاتصال.']);

        // length
        if (words >= 250 && words <= 900) P('Good CV length (' + words + ' words)', 'Bonne longueur de CV (' + words + ' mots)', 'طول مناسب للسيرة (' + words + ' كلمة)'); else if (words < 250)
            F(['CV seems very short (' + words + ' words)', 'Aim for at least ~300 words: one page with real substance.'],
              ['CV très court (' + words + ' mots)', 'Visez au moins ~300 mots : une page avec du contenu réel.'],
              ['السيرة قصيرة جدًا (' + words + ' كلمة)', 'استهدف 300 كلمة على الأقل: صفحة واحدة بمحتوى حقيقي.']); else
            F(['CV is long (' + words + ' words)', 'Over ~900 words (2+ pages) loses recruiters — tighten to the most relevant content.'],
              ['CV long (' + words + ' mots)', 'Au-delà de ~900 mots (2+ pages), les recruteurs décrochent — recentrez.'],
              ['السيرة طويلة (' + words + ' كلمة)', 'فوق ~900 كلمة (صفحتان وأكثر) يفقد المسؤولون الاهتمام — ركّز على الأكثر صلة.']);

        // standard sections
        if (SECTION_WORDS.test(text)) P('Standard section headings found', 'Titres de sections standards détectés', 'عُثر على عناوين أقسام قياسية'); else
            F(['No standard section headings detected', 'Use plain headings ATS parsers recognize: Experience, Education, Skills…'],
              ['Aucun titre de section standard', 'Utilisez des titres simples reconnus par les ATS : Expérience, Formation, Compétences…'],
              ['لم تُكتشف عناوين أقسام قياسية', 'استخدم عناوين بسيطة تتعرف عليها أنظمة ATS: الخبرة، التعليم، المهارات…']);

        // action verbs
        const verbMatches = text.match(new RegExp(ACTION_VERBS.source, 'gi')) || [];
        if (verbMatches.length >= 5) P('Strong action verbs (' + verbMatches.length + ')', 'Verbes d\u2019action solides (' + verbMatches.length + ')', 'أفعال قوية (' + verbMatches.length + ')'); else
            F(['Few action verbs (' + verbMatches.length + ')', 'Start bullets with verbs: developed, automated, reduced… (avoid "responsible for").'],
              ['Peu de verbes d\u2019action (' + verbMatches.length + ')', 'Commencez les puces par des verbes : développé, automatisé, réduit… (évitez « responsable de »).'],
              ['أفعال قليلة (' + verbMatches.length + ')', 'ابدأ النقاط بأفعال: طوّر، أتمت، خفّض… (تجنّب "مسؤول عن").']);

        // verb variety (overusing one verb weakens every bullet)
        const counts = {};
        verbMatches.forEach((v) => { const k = v.toLowerCase(); counts[k] = (counts[k] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (top && top[1] >= 4 && top[1] / verbMatches.length >= 0.5)
            F(['Verb "' + top[0] + '" is overused (' + top[1] + ' of ' + verbMatches.length + ')', 'Vary your verbs: built, led, delivered, automated… each bullet deserves its own.'],
              ['Le verbe « ' + top[0] + ' » est surutilisé (' + top[1] + ' sur ' + verbMatches.length + ')', 'Variez les verbes : construit, piloté, livré, automatisé… chaque puce mérite le sien.'],
              ['الفعل "' + top[0] + '" مستخدم بكثرة (' + top[1] + ' من ' + verbMatches.length + ')', 'نوّع الأفعال: بنى، قاد، سلّم، أتمت… كل نقطة تستحق فعلها الخاص.']);

        // quantified achievements
        const numbers = (text.match(/\d+%/g) || []).length;
        if (numbers >= 2) P('Quantified achievements (' + numbers + ' %)', 'Résultats chiffrés (' + numbers + ' %)', 'نتائج مُقاسة (' + numbers + '٪)'); else
            F(['Almost no quantified results', 'Add numbers: "reduced processing time by 40%", "served 3 clients"… — measurable beats vague.'],
              ['Presque aucun résultat chiffré', 'Ajoutez des chiffres : « réduit le temps de 40 % », « 3 clients »… — le mesurable gagne.'],
              ['لا توجد نتائج رقمية تقريبًا', 'أضف أرقامًا: "خفّض زمن المعالجة 40٪"، "خدمت 3 عملاء"… — الملموس يتفوق على الغامض.']);

        // first person
        const fp = (text.match(FIRST_PERSON) || []).length;
        if (fp <= 2) P('Professional tone (no first person)', 'Ton professionnel (pas de première personne)', 'نبرة مهنية (بدون صيغة المتكلم)'); else
            F(['Uses first person ' + fp + ' times', 'CVs should avoid "I/my" — start with the verb directly.'],
              ['Première personne utilisée ' + fp + ' fois', 'Évitez « je/mon » — commencez directement par le verbe.'],
              ['استُخدمت صيغة المتكلم ' + fp + ' مرة', 'تجنّب "أنا/خاصتي" — ابدأ بالفعل مباشرة.']);

        // date format consistency
        const dates = text.match(/(20\d{2}|19\d{2})/g) || [];
        if (dates.length >= 2) P('Dates with years found', 'Dates avec années trouvées', 'تواريخ بالسنوات موجودة'); else
            F(['No year dates found', 'ATS timelines need explicit years for each role (e.g. 2023 – 2025).'],
              ['Aucune année détectée', 'Les ATS ont besoin d\u2019années explicites pour chaque poste (ex. 2023 – 2025).'],
              ['لا سنوات مكتشفة', 'تحتاج الجداول الزمنية لأنظمة ATS سنوات صريحة لكل دور (مثال 2023 – 2025).']);

        // employment gaps (heuristic — phrased as "possible")
        const gaps = dateGaps(text);
        if (gaps.length)
            F(['Possible employment gap: ' + gaps.join(', '), 'If intentional (studies, freelance, health), add a one-line note so recruiters do not wonder.'],
              ['Trou possible dans le parcours : ' + gaps.join(', '), 'Si c\u2019est volontaire (études, freelance), ajoutez une ligne d\u2019explication pour éviter les questions.'],
              ['فجوة زمنية محتملة في المسار: ' + gaps.join('، '), 'إن كانت مقصودة (دراسة، عمل حر) أضف سطرًا يشرحها حتى لا يتساءل المسؤولون.']);

        // bullet length (walls of text per bullet)
        const bullets = text.split(/\n/).filter((l) => /^\s*[-•·*▪●o]\s|\s{4,}\S/.test(l) || /^\s*\d+[.)]\s/.test(l));
        const longBullets = bullets.filter((b) => b.split(/\s+/).filter(Boolean).length > 40).length;
        if (longBullets >= 2)
            F([longBullets + ' bullets are too long (40+ words)', 'Trim each bullet to 1–2 lines: verb + what + measurable result.'],
              [longBullets + ' puces trop longues (40+ mots)', 'Raccourcissez chaque puce à 1–2 lignes : verbe + quoi + résultat mesurable.'],
              [longBullets + ' نقاط طويلة جدًا (40+ كلمة)', 'اختصر كل نقطة إلى سطر أو سطرين: فعل + ماذا + نتيجة قابلة للقياس.']);

        // weird columns/tables hint in pasted text
        if (/\t{2,}|\s{6,}(?=\S)/.test(text))
            F(['Possible multi-column/table layout detected', 'Tables and columns scramble in ATS parsers — use a single-column layout.'],
              ['Mise en page multi-colonnes/tableau probable', 'Tableaux et colonnes perturbent les ATS — utilisez une seule colonne.'],
              ['تخطيط متعدد الأعمدة/جدول محتمل', 'الجداول والأعمدة تُربك أنظمة ATS — استخدم عمودًا واحدًا.']); else
            P('Single-column layout detected', 'Mise en page une colonne détectée', 'تم اكتشاف تنسيق عمود واحد');

        // PDF structure checks (only when a PDF/DOCX was uploaded)
        if (meta.hasImages)
            F(['Images / graphics detected inside the PDF', 'Many ATS parsers skip images entirely — remove the photo and decorative graphics.'],
              ['Images / graphiques détectés dans le PDF', 'Beaucoup d\u2019ATS ignorent les images — retirez la photo et les éléments décoratifs.'],
              ['صور / عناصر رسومية داخل ملف PDF', 'كثير من أنظمة ATS تتجاهل الصور تمامًا — احذف الصورة الشخصية والزخارف.']);
        if (meta.hasRepeatingHeader)
            F(['Repeating header/footer detected in the PDF', 'ATS may read it as body content on every page — keep headers/footers empty or minimal.'],
              ['En-tête/pied de page répété détecté dans le PDF', 'Les ATS peuvent le lire comme du contenu — gardez en-têtes et pieds de page vides ou minimaux.'],
              ['رأس/تذييل متكرر في ملف PDF', 'قد يقرأه الـ ATS كمحتوى أساسي في كل صفحة — أبقِ الرأس والتذييل فارغين أو بسيطين.']);

        return { passed, failed };
    }

    window.CvRules = { runRules, splitSections, locateKeyword, termRegex };
})();
