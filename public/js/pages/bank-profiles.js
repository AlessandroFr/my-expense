// ─── pages/bank-profiles.js ──────────────────────────────────────────────────
// I profili di tracciato degli estratti conto: creazione, modifica,
// ripristino, cancellazione. Un form per profilo, tutti uguali.

import FetchRequest from '../FetchRequest.js';
import { apiSend }   from '../componentBase.js';
import { toast }     from '../toast.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);
const BASE = document.body.dataset.baseUrl ?? '';

const FIELDS = ['op_date', 'value_date', 'tipologia', 'description', 'outflow', 'inflow', 'amount'];

function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

/** Stessa normalizzazione del server (bank-profiles.js::normalizeHeader). */
function normalizeHeader(raw) {
    return String(raw ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

const generico = (() => {
    const el = document.getElementById('bank-profiles-generic');
    try { return JSON.parse(el?.textContent ?? '{}'); } catch { return {}; }
})();

/** Il separatore della riga incollata: quello che la spezza in più pezzi. */
function detectDelimiter(line) {
    let best = ';';
    let massimo = 0;
    for (const c of [';', ',', '\t', '|']) {
        const n = line.split(c).length - 1;
        if (n > massimo) { massimo = n; best = c; }
    }
    return best;
}

/**
 * Riempie i campi del form partendo dalla riga di intestazione incollata:
 * ogni colonna finisce nel campo di cui porta un nome conosciuto.
 */
function compilaDaIntestazione(form) {
    const row = form.querySelector('.bp-header-paste')?.value ?? '';
    if (row.trim() === '') { toast.warning('Incolla prima la riga con i nomi delle colonne.'); return; }

    const cells = row.split(detectDelimiter(row)).map((c) => normalizeHeader(c.replace(/^"|"$/g, '')));
    const presi = new Set();
    const assegnate = {};

    for (const field of FIELDS) {
        for (const name of (generico[field] ?? [])) {
            const i = cells.findIndex((c, idx) => !presi.has(idx) && c === name);
            if (i === -1) continue;
            presi.add(i);
            (assegnate[field] ??= []).push(cells[i]);
            break;
        }
    }

    for (const field of FIELDS) {
        const input = form.querySelector(`[data-field="${field}"]`);
        if (input) input.value = (assegnate[field] ?? []).join(', ');
    }

    const avanzate = cells.filter((c, i) => c !== '' && !presi.has(i));
    const trovate = Object.keys(assegnate).length;
    if (trovate === 0) {
        toast.warning('Nessuna colonna riconosciuta: scrivi tu i nomi nei campi qui sotto.');
    } else if (avanzate.length > 0) {
        toast.info(`${trovate} campi compilati. Colonne non riconosciute: ${avanzate.join(', ')}.`);
    } else {
        toast.success(`${trovate} campi compilati. Controlla che sia tutto al posto giusto.`);
    }
}

/** I valori del form, pronti per il server. */
function raccogli(form) {
    const params = new URLSearchParams();
    params.set('_csrf', getCsrfToken());
    for (const name of ['name', 'delimiter', 'encoding', 'amount_mode', 'date_order', 'sort_order', 'notes']) {
        params.set(name, form.querySelector(`[name="${name}"]`)?.value ?? '');
    }
    const columns = {};
    for (const field of FIELDS) {
        const v = form.querySelector(`[data-field="${field}"]`)?.value ?? '';
        if (v.trim() !== '') columns[field] = v.split(',').map((s) => s.trim()).filter((s) => s !== '');
    }
    params.set('columns_json', JSON.stringify(columns));
    return params;
}

async function saveDraft(form) {
    const id = form.dataset.id;
    const params = raccogli(form);
    if (id) params.set('id', id);
    const r = await send(`${BASE}/bank-profiles/${id ? 'update' : 'create'}`, params);
    const p = r.data?.profile;
    if (!p) throw new Error('Risposta server inattesa.');
    return p;
}

function wire() {
    for (const form of document.querySelectorAll('.bank-profile-form')) {
        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            try {
                const p = await saveDraft(form);
                toast.success(`Profilo "${p.name}" salvato.`);
                // La pagina si ricarica: l'elenco, i titoli e i conteggi
                // vengono dal server e riscriverli qui sarebbe copiarlo.
                location.reload();
            } catch (err) {
                toast.error(err.message ?? 'Errore nel salvataggio del profilo.');
                btn.disabled = false;
            }
        });

        form.querySelector('.bp-header-fill')?.addEventListener('click', () => compilaDaIntestazione(form));

        form.querySelector('[data-action="reset"]')?.addEventListener('click', async () => {
            if (!confirm('Rimetto questo profilo com\'era appena installato?')) return;
            try {
                const params = new URLSearchParams({ _csrf: getCsrfToken(), id: form.dataset.id });
                await send(`${BASE}/bank-profiles/reset`, params);
                location.reload();
            } catch (err) {
                toast.error(err.message ?? 'Errore nel ripristino.');
            }
        });

        form.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
            if (!confirm('Elimino questo profilo?')) return;
            try {
                const params = new URLSearchParams({ _csrf: getCsrfToken(), id: form.dataset.id });
                await send(`${BASE}/bank-profiles/delete`, params);
                location.reload();
            } catch (err) {
                toast.error(err.message ?? 'Errore nella cancellazione.');
            }
        });
    }
}

wire();
