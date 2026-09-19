// extract.js — PDF / DOCX / TXT text extraction (100% client-side)
(function () {
    'use strict';

    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    async function extractPDF(file) {
        const buf = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            // group text items by line (approximate via transform y)
            const lines = [];
            let lastY = null;
            for (const item of content.items) {
                const y = item.transform ? Math.round(item.transform[5]) : null;
                if (y !== lastY && y !== null) {
                    lines.push(item.str);
                    lastY = y;
                } else if (lines.length) {
                    lines[lines.length - 1] += ' ' + item.str;
                }
            }
            pages.push(lines.join('\n'));
        }
        return pages.join('\n\n').trim();
    }

    async function extractDOCX(file) {
        const buf = await file.arrayBuffer();
        const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
        return (result.value || '').trim();
    }

    function extractTXT(file) {
        return file.text().then((s) => s.trim());
    }

    async function extractFile(file) {
        const name = (file.name || '').toLowerCase();
        if (name.endsWith('.pdf') || file.type === 'application/pdf') return extractPDF(file);
        if (name.endsWith('.docx')) return extractDOCX(file);
        if (name.endsWith('.txt') || file.type.startsWith('text/')) return extractTXT(file);
        throw new Error('Unsupported file type — use PDF, DOCX or TXT.');
    }

    window.CvExtract = { extractFile };
})();
