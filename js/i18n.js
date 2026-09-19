// i18n.js — English + Français
(function () {
    'use strict';

    const DICT = {
        en: {
            tagline: '— see your CV like an ATS does',
            subtitle: "Paste your CV + a job link. Get the exact keywords you're missing, what to add, and what to cut — with evidence from your own CV.",
            settings: '⚙️ AI Settings',
            settingsTitle: 'AI Settings (stored only in your browser)',
            apiKey: 'API key',
            model: 'Model',
            customModel: 'custom…',
            settingsNote: 'Your key stays in localStorage on this device — CVs and jobs are sent only to the AI provider you choose, never to us (there is no server).',
            cvTitle: 'Your CV',
            dropPdf: 'Drop a PDF / DOCX / TXT here',
            or: 'or',
            browse: 'browse',
            scannedWarn: 'Scanned PDFs have no extractable text — paste the text instead.',
            cvPlaceholder: '…or paste your full CV text here',
            words: 'words',
            jobTitle: 'The Job Posting',
            jobUrl: 'Job URL (optional)',
            fetch: 'Fetch',
            jobPaste: 'Or paste the job description',
            jobPlaceholder: 'Paste the full job description here…',
            linkedinWarn: 'Some sites (LinkedIn, Indeed) block fetching — open the posting and copy the text.',
            analyze: 'Analyze my CV →',
            fetching: 'Fetching job posting…',
            fetchOk: 'Job posting fetched — check the text below and edit if needed.',
            fetchFail: 'Could not fetch this URL automatically. Please open it and paste the text.',
            needBoth: 'Please provide both your CV text and the job description.',
            needKey: 'Please add your API key in ⚙️ AI Settings first.',
            analyzing: 'Analyzing (this can take 20–40 seconds)…',
            errorPrefix: 'Error: ',
            resultsTitle: 'Analysis Results',
            verdict: { strong: 'Strong match', possible: 'Possible match — fixable gaps', weak: 'Weak match' },
            subMust: 'Must-have requirements',
            subKw: 'Keywords & skills',
            subExp: 'Experience relevance',
            subEdu: 'Education & certs',
            subFmt: 'ATS formatting',
            overall: 'Match score',
            summary: 'Summary',
            keywordTable: 'Keyword Match Table',
            kwCol: 'Keyword', importanceCol: 'Importance', statusCol: 'Status', evidenceCol: 'Evidence from your CV',
            found: 'FOUND', partial: 'PARTIAL', missing: 'MISSING',
            mustLabel: 'must', niceLabel: 'nice',
            addTitle: '✅ Add these',
            addWhy: 'Why',
            example: 'Suggested wording (only if true for you)',
            removeTitle: '❌ Remove / cut these',
            improveTitle: '✏️ Improve these',
            rulesTitle: '⚡ ATS formatting checks (rule-based)',
            copyReport: 'Copy full report',
            copied: 'Copied ✓',
            reanalyze: 'Re-analyze',
            jobDetected: 'Detected position',
            noEvidence: '—',
        },
        fr: {
            tagline: '— voyez votre CV comme un ATS',
            subtitle: "Collez votre CV + un lien d'offre. Découvrez les mots-clés manquants, quoi ajouter et quoi retirer — avec des preuves tirées de votre CV.",
            settings: '⚙️ Réglages IA',
            settingsTitle: "Réglages IA (stockés uniquement dans votre navigateur)",
            apiKey: 'Clé API',
            model: 'Modèle',
            customModel: 'personnalisé…',
            settingsNote: "Votre clé reste dans localStorage sur cet appareil — les CV et offres ne sont envoyés qu'au fournisseur d'IA choisi, jamais à nous (aucun serveur).",
            cvTitle: 'Votre CV',
            dropPdf: 'Déposez un PDF / DOCX / TXT ici',
            or: 'ou',
            browse: 'parcourir',
            scannedWarn: 'Les PDF scannés n\u2019ont pas de texte extractible — collez le texte à la place.',
            cvPlaceholder: '…ou collez le texte complet de votre CV ici',
            words: 'mots',
            jobTitle: "L'offre d'emploi",
            jobUrl: "Lien de l'offre (optionnel)",
            fetch: 'Récupérer',
            jobPaste: "Ou collez la description du poste",
            jobPlaceholder: 'Collez la description complète du poste ici…',
            linkedinWarn: "Certains sites (LinkedIn, Indeed) bloquent la récupération — ouvrez l'offre et copiez le texte.",
            analyze: 'Analyser mon CV →',
            fetching: 'Récupération de l\u2019offre…',
            fetchOk: 'Offre récupérée — vérifiez le texte ci-dessous et modifiez si besoin.',
            fetchFail: 'Impossible de récupérer cette URL automatiquement. Ouvrez-la et collez le texte.',
            needBoth: 'Veuillez fournir le texte du CV ET la description du poste.',
            needKey: 'Ajoutez d\u2019abord votre clé API dans ⚙️ Réglages IA.',
            analyzing: 'Analyse en cours (20–40 secondes)…',
            errorPrefix: 'Erreur : ',
            resultsTitle: "Résultats de l'analyse",
            verdict: { strong: 'Forte correspondance', possible: 'Correspondance possible — lacunes corrigeables', weak: 'Faible correspondance' },
            subMust: 'Exigences indispensables',
            subKw: 'Mots-clés & compétences',
            subExp: 'Pertinence de l\u2019expérience',
            subEdu: 'Formation & certifications',
            subFmt: 'Formatage ATS',
            overall: 'Score de correspondance',
            summary: 'Résumé',
            keywordTable: 'Tableau de correspondance des mots-clés',
            kwCol: 'Mot-clé', importanceCol: 'Importance', statusCol: 'Statut', evidenceCol: 'Preuve dans votre CV',
            found: 'PRÉSENT', partial: 'PARTIEL', missing: 'MANQUANT',
            mustLabel: 'indispensable', niceLabel: 'souhaitable',
            addTitle: '✅ À ajouter',
            addWhy: 'Pourquoi',
            example: 'Formulation suggérée (uniquement si c\u2019est vrai pour vous)',
            removeTitle: '❌ À retirer / couper',
            improveTitle: '✏️ À améliorer',
            rulesTitle: '⚡ Vérifications du formatage ATS (règles)',
            copyReport: 'Copier le rapport complet',
            copied: 'Copié ✓',
            reanalyze: 'Ré-analyser',
            jobDetected: 'Poste détecté',
            noEvidence: '—',
        },
    };

    let lang = localStorage.getItem('cvlens_lang') || 'en';

    function t(key) {
        const d = DICT[lang] || DICT.en;
        return d[key] !== undefined ? d[key] : (DICT.en[key] !== undefined ? DICT.en[key] : key);
    }

    function apply() {
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
        document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
        const sel = document.getElementById('lang-select');
        if (sel) sel.value = lang;
    }

    function setLang(l) {
        lang = DICT[l] ? l : 'en';
        localStorage.setItem('cvlens_lang', lang);
        apply();
    }

    window.I18N = { t, setLang, get: () => lang, apply };
})();
