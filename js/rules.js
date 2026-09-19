// rules.js — deterministic ATS formatting checks (no AI, always accurate)
(function () {
    'use strict';

    const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
    const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
    const LINKEDIN_RE = /linkedin\.com\/(in|pub)\//i;
    const SECTION_WORDS = /(experience|work history|employment|education|skills|projects|certifications?|formation|exp[eé]rience|comp[eé]tences|projets|education|parcours)/i;
    const ACTION_VERBS = /\b(designed|developed|built|created|implemented|led|improved|automated|delivered|reduced|increased|optimized|launched|managed|analyzed|migrated|con[aç]u|d[eé]velopp[eé]|r[eé]alis[eé]|pilot[eé]|am[eé]lior[eé]|automatis[eé]|livr[eé]|analys[eé])\w*/i;
    const FIRST_PERSON = /\b(I|my|me|je|mon|ma|mes)\b/g;

    /**
     * Run rule-based ATS checks on CV text.
     * @param {string} cv
     * @param {'en'|'fr'} lang
     * @returns {{passed: string[], failed: {issue: string, fix: string}[]}}
     */
    function runRules(cv, lang) {
        const fr = lang === 'fr';
        const text = cv || '';
        const words = text.split(/\s+/).filter(Boolean).length;
        const passed = [];
        const failed = [];

        const P = (en, frMsg) => passed.push(fr ? frMsg : en);
        const F = (en, frMsg) => failed.push({ issue: fr ? frMsg[0] : en[0], fix: fr ? frMsg[1] : en[1] });

        // contact info
        if (EMAIL_RE.test(text)) P('Email present', 'E-mail présent'); else
            F(['No email address found', 'Add a professional email at the top — ATS parsers look for it.'],
              ['Aucune adresse e-mail trouvée', 'Ajoutez un e-mail professionnel en haut — les ATS le cherchent.']);
        if (PHONE_RE.test(text)) P('Phone number present', 'Numéro de téléphone présent'); else
            F(['No phone number found', 'Add a phone number in an international format (e.g. +212 6…).'],
              ['Aucun numéro de téléphone', 'Ajoutez un numéro au format international (ex. +212 6…).']);
        if (LINKEDIN_RE.test(text)) P('LinkedIn URL present', 'Lien LinkedIn présent'); else
            F(['No LinkedIn profile link', 'Recruiters expect a LinkedIn URL near your contact info.'],
              ['Pas de lien LinkedIn', 'Les recruteurs s\u2019attendent à un lien LinkedIn près de vos coordonnées.']);

        // length
        if (words >= 250 && words <= 900) P('Good CV length (' + words + ' words)', 'Bonne longueur de CV (' + words + ' mots)'); else if (words < 250)
            F(['CV seems very short (' + words + ' words)', 'Aim for at least ~300 words: one page with real substance.'],
              ['CV très court (' + words + ' mots)', 'Visez au moins ~300 mots : une page avec du contenu réel.']); else
            F(['CV is long (' + words + ' words)', 'Over ~900 words (2+ pages) loses recruiters — tighten to the most relevant content.'],
              ['CV long (' + words + ' mots)', 'Au-delà de ~900 mots (2+ pages), les recruteurs décrochent — recentrez.']);

        // standard sections
        if (SECTION_WORDS.test(text)) P('Standard section headings found', 'Titres de sections standards détectés'); else
            F(['No standard section headings detected', 'Use plain headings ATS parsers recognize: Experience, Education, Skills…'],
              ['Aucun titre de section standard', 'Utilisez des titres simples reconnus par les ATS : Expérience, Formation, Compétences…']);

        // action verbs
        const verbs = (text.match(new RegExp(ACTION_VERBS.source, 'gi')) || []).length;
        if (verbs >= 5) P('Strong action verbs (' + verbs + ')', 'Verbes d\u2019action solides (' + verbs + ')'); else
            F(['Few action verbs (' + verbs + ')', 'Start bullets with verbs: developed, automated, reduced… (avoid "responsible for").'],
              ['Peu de verbes d\u2019action (' + verbs + ')', 'Commencez les puces par des verbes : développé, automatisé, réduit… (évitez « responsable de »).']);

        // quantified achievements
        const numbers = (text.match(/\d+%/g) || []).length;
        if (numbers >= 2) P('Quantified achievements (' + numbers + ' %)', 'Résultats chiffrés (' + numbers + ' %)'); else
            F(['Almost no quantified results', 'Add numbers: "reduced processing time by 40%", "served 3 clients"… — measurable beats vague.'],
              ['Presque aucun résultat chiffré', 'Ajoutez des chiffres : « réduit le temps de 40 % », « 3 clients »… — le mesurable gagne.']);

        // first person
        const fp = (text.match(FIRST_PERSON) || []).length;
        if (fp <= 2) P('Professional tone (no first person)', 'Ton professionnel (pas de première personne)'); else
            F(['Uses first person ' + fp + ' times', 'CVs should avoid "I/my" — start with the verb directly.'],
              ['Première personne utilisée ' + fp + ' fois', 'Évitez « je/mon » — commencez directement par le verbe.']);

        // date format consistency
        const dates = text.match(/(20\d{2}|19\d{2})/g) || [];
        if (dates.length >= 2) P('Dates with years found', 'Dates avec années trouvées'); else
            F(['No year dates found', 'ATS timelines need explicit years for each role (e.g. 2023 – 2025).'],
              ['Aucune année détectée', 'Les ATS ont besoin d\u2019années explicites pour chaque poste (ex. 2023 – 2025).']);

        // weird columns/tables hint in pasted text
        if (/\t{2,}|\s{6,}(?=\S)/.test(text))
            F(['Possible multi-column/table layout detected', 'Tables and columns scramble in ATS parsers — use a single-column layout.'],
              ['Mise en page multi-colonnes/tableau probable', 'Tableaux et colonnes perturbent les ATS — utilisez une seule colonne.']); else
            P('Single-column layout detected', 'Mise en page une colonne détectée');

        return { passed, failed };
    }

    window.CvRules = { runRules };
})();
