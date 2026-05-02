// ─── ocr.js ──────────────────────────────────────────────────────────────────
// OCR client-side scontrini via Tesseract.js (lazy-loaded da CDN). Estrae:
//  - amount: il numero piu' grande nel formato 12,34 / 12.34 (probabile totale)
//  - date: la prima data DD/MM/YYYY o YYYY-MM-DD
// Lavora interamente nel browser, nessun upload server.

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let tesseractLoading = null;
function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractLoading) return tesseractLoading;
    tesseractLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = TESSERACT_CDN;
        s.async = true;
        s.onload  = () => resolve(window.Tesseract);
        s.onerror = () => reject(new Error('Impossibile caricare Tesseract.js (richiede connessione).'));
        document.head.appendChild(s);
    });
    return tesseractLoading;
}

/**
 * @param {File|Blob} file
 * @param {(progress: {status: string, progress: number}) => void} [onProgress]
 * @returns {Promise<{text: string, amount: ?number, date: ?string}>}
 */
export async function extractFromImage(file, onProgress) {
    const Tesseract = await loadTesseract();
    const r = await Tesseract.recognize(file, 'ita+eng', {
        logger: (m) => { if (onProgress) onProgress(m); },
    });
    const text = (r?.data?.text ?? '').trim();
    return {
        text,
        amount: extractAmount(text),
        date:   extractDate(text),
    };
}

function extractAmount(text) {
    const re = /(\d{1,5}[.,]\d{2})(?!\d)/g;
    let max = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        const n = parseFloat(m[1].replace(',', '.'));
        if (Number.isFinite(n) && n > max) max = n;
    }
    return max > 0 ? max : null;
}

function extractDate(text) {
    let m = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
    if (m) {
        const dd = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        let yy = parseInt(m[3], 10);
        if (yy < 100) yy = yy + (yy >= 70 ? 1900 : 2000);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yy >= 1900 && yy <= 2100) {
            return `${yy.toString().padStart(4, '0')}-${mm.toString().padStart(2, '0')}-${dd.toString().padStart(2, '0')}`;
        }
    }
    m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (m) {
        const yy = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        const dd = parseInt(m[3], 10);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
            return `${yy}-${mm.toString().padStart(2, '0')}-${dd.toString().padStart(2, '0')}`;
        }
    }
    return null;
}
