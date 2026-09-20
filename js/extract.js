// extract.js — PDF / DOCX / TXT text extraction (100% client-side)
(function () {
    'use strict';

    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // structure info for the last extracted file (used by rules.js)
    window.CvExtract = window.CvExtract || {};
    window.CvExtract.meta = {};

    const IMAGE_OPS = window.pdfjsLib
        ? [window.pdfjsLib.OPS.paintImageXObject, window.pdfjsLib.OPS.paintInlineImageXObject, window.pdfjsLib.OPS.paintJpegXObject]
        : [];

    async function extractPDF(file) {
        const buf = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
        const pages = [];
        let imageOps = 0;
        const edgeTexts = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);

            // count embedded images via the operator list
            try {
                const ops = await page.getOperatorList();
                for (let j = 0; j < ops.fnArray.length; j++) {
                    if (IMAGE_OPS.includes(ops.fnArray[j])) imageOps++;
                }
            } catch (e) { /* operator list unavailable — skip image detection */ }

            const content = await page.getTextContent();
            const vp = page.getViewport({ scale: 1 });
            const lines = [];
            let lastY = null;
            for (const item of content.items) {
                const y = item.transform ? item.transform[5] : null;
                if (y !== lastY && y !== null) {
                    lines.push(item.str);
                    lastY = y;
                } else if (lines.length) {
                    lines[lines.length - 1] += ' ' + item.str;
                }
                // header/footer candidates: text in the top or bottom 8% of the page
                // (pdf.js y-axis origin is bottom-left, so top = high y)
                const s = (item.str || '').trim();
                if (s.length > 2 && (y > vp.height * 0.92 || y < vp.height * 0.08)) edgeTexts.push(s);
            }
            pages.push(lines.join('\n'));
        }

        window.CvExtract.meta = {
            hasImages: imageOps > 0,
            hasRepeatingHeader: hasRepeatingEdge(edgeTexts),
            pages: pdf.numPages,
        };
        return pages.join('\n\n').trim();
    }

    // same non-trivial text appearing in a page edge zone across pages → header/footer
    function hasRepeatingEdge(arr) {
        const counts = {};
        arr.map((s) => s.toLowerCase().replace(/\s+/g, ' ').trim())
            .filter((s) => s.length >= 8 && s.length < 80 && !/^\d+$/.test(s))
            .forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
        return Object.keys(counts).some((k) => counts[k] >= 2);
    }

    async function extractDOCX(file) {
        const buf = await file.arrayBuffer();
        const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
        window.CvExtract.meta = { hasImages: false, hasRepeatingHeader: false };
        return (result.value || '').trim();
    }

    function extractTXT(file) {
        window.CvExtract.meta = { hasImages: false, hasRepeatingHeader: false };
        return file.text().then((s) => s.trim());
    }

    async function extractFile(file) {
        const name = (file.name || '').toLowerCase();
        if (name.endsWith('.pdf') || file.type === 'application/pdf') return extractPDF(file);
        if (name.endsWith('.docx')) return extractDOCX(file);
        if (name.endsWith('.txt') || file.type.startsWith('text/')) return extractTXT(file);
        throw new Error('Unsupported file type — use PDF, DOCX or TXT.');
    }

    window.CvExtract.extractFile = extractFile;
})();
