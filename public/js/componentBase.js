/**
 * componentBase.js — Utility condivise per i componenti StraVigo-Cloud
 *
 * Centralizza pattern duplicati: API error-wrapping, ricerca tabelle, notifiche.
 * Importare singole funzioni: import { apiSend, searchTable } from '../../javascript/componentBase.js';
 */

// ── API Error Wrapper ───────────────────────────────────────────────────────

/**
 * Normalizza una risposta API supportando sia il vecchio envelope
 * ({ result, title, message, ...payload }) sia il nuovo
 * ({ ok, data, error: { code, message, details } }).
 *
 * - Se ok === false oppure result === false → lancia Error arricchito.
 * - Se ok === true → ritorna l'oggetto completo (data accessibile via r.data).
 * - Se result === true (legacy) → ritorna l'oggetto completo (campi sparsi a root).
 *
 * Durante la migrazione gli endpoint emettono ENTRAMBI gli envelope, quindi sia
 * il vecchio codice (`r.foo`) sia il nuovo (`r.data.foo`) continuano a funzionare.
 *
 * @param {object|null} r Risposta parsata da FetchRequest.
 * @returns {object} La stessa risposta se ok.
 * @throws {Error} con .title, .code, .response, .details popolati.
 */
function normalizeApiResponse(r) {
    // Nuovo envelope: { ok: false, error: { code, message, details? } }
    if (r && r.ok === false) {
        const err     = r.error ?? {};
        const e       = new Error(err.message ?? r.message ?? r.title ?? 'Errore imprevisto');
        e.code        = err.code ?? null;
        e.title       = r.title ?? 'Errore';
        e.details     = err.details ?? null;
        e.response    = r;
        e.httpStatus  = r._httpStatus ?? null;
        throw e;
    }
    // Legacy envelope: { result: false, title, message } (compat durante migrazione)
    if (r && r.result === false && r.ok === undefined) {
        const e       = new Error(r.message ?? r.title ?? 'Errore imprevisto');
        e.code        = null;
        e.title       = r.title ?? 'Errore';
        e.details     = r.details ?? null;
        e.response    = r;
        e.httpStatus  = r._httpStatus ?? null;
        throw e;
    }
    // Risposta vuota o malformata
    if (!r || (r.ok === undefined && r.result === undefined)) {
        const e       = new Error('Risposta API malformata');
        e.title       = 'Errore';
        e.response    = r;
        throw e;
    }
    return r;
}

/**
 * Crea un wrapper attorno a FetchRequest.send() che lancia un Error arricchito
 * se la risposta è in errore (sia envelope nuovo che legacy).
 *
 * Uso:
 *   import FetchRequest from '../../javascript/FetchRequest.js';
 *   import { apiSend } from '../../javascript/componentBase.js';
 *   const _api  = FetchRequest.getInstance();
 *   const _send = apiSend(_api);
 *   const r = await _send('../../endpoints/foo.php', params);
 *
 * @param {FetchRequest} apiInstance
 * @returns {(url: string, params?: any) => Promise<object>}
 */
export function apiSend(apiInstance) {
    return async (url, params) => {
        const r = await apiInstance.send(url, params);
        return normalizeApiResponse(r);
    };
}

/**
 * Wrappa una Promise API (GET, PUT, DELETE, ecc.) e lancia Error in caso di errore
 * (supporta sia envelope nuovo che legacy).
 * Uso: apiGuard(_api.get(url, params))
 *
 * @param {Promise<object>} promise — la Promise restituita da FetchRequest.get/put/delete/…
 * @returns {Promise<object>}
 */
export function apiGuard(promise) {
    return promise.then(normalizeApiResponse);
}

// ── Pagination Helpers ───────────────────────────────────────────────────────

/**
 * Esegue una chiamata API paginata e ritorna {items, meta}.
 *
 * Gestisce automaticamente:
 *   - Merge dei parametri page/per_page nei params passati.
 *   - Estrazione di `meta` (se presente) dalla response (envelope legacy o nuovo).
 *   - Estrazione del payload items via la chiave indicata (es. 'employees').
 *
 * Uso:
 *   const { items, meta } = await apiPaginated(_send, url, {
 *       searchMode: EmployeeCollection.MODE_ALL,
 *       page: 1, per_page: 50
 *   }, 'employees');
 *
 * @param {(url: string, params: object) => Promise<object>} send — Es. il risultato di apiSend(api).
 * @param {string} url
 * @param {object} params — Deve includere page e per_page; passa altri filtri se servono.
 * @param {string} itemsKey — Nome della chiave nel payload (es. 'employees', 'paychecks').
 * @returns {Promise<{items: Array, meta: {page: number, per_page: number, total: number, total_pages: number}}>}
 */
export async function apiPaginated(send, url, params, itemsKey) {
    const r     = await send(url, params);
    // Envelope nuovo: r.data.{itemsKey}, envelope legacy: r.{itemsKey} sparso root
    const items = (r.data && r.data[itemsKey]) ?? r[itemsKey] ?? [];
    const meta  = (r.data && r.data.meta) ?? r.meta ?? {
        page:        params.page ?? 1,
        per_page:    params.per_page ?? items.length,
        total:       items.length,
        total_pages: 1,
    };
    return { items, meta };
}

/**
 * Renderizza dei controlli di paginazione minimali (prev/next + indicatore
 * "Pagina X di Y") in un container DOM. Quando l'utente clicca prev/next
 * invoca onPageChange(newPage).
 *
 * Uso:
 *   renderPaginationControls(document.querySelector('.pager'), meta, (newPage) => {
 *       fetchPage(newPage);
 *   });
 *
 * @param {HTMLElement} container
 * @param {{page: number, total_pages: number}} meta
 * @param {(page: number) => void} onPageChange
 */
export function renderPaginationControls(container, meta, onPageChange) {
    if (!container) return;
    const { page = 1, total_pages = 1 } = meta ?? {};
    container.innerHTML = '';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.textContent = '← Precedente';
    prev.disabled = page <= 1;
    prev.addEventListener('click', () => onPageChange(page - 1));

    const label = document.createElement('span');
    label.className = 'pager-label';
    label.textContent = ` Pagina ${page} di ${total_pages} `;

    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = 'Successiva →';
    next.disabled = page >= total_pages;
    next.addEventListener('click', () => onPageChange(page + 1));

    container.append(prev, label, next);
}

/**
 * Clampa una pagina all'interno del range valido [1, total_pages].
 * Estratto per testabilita' pura; usato internamente da createPaginatedTable.
 *
 * @param {number} requested
 * @param {number} totalPages
 * @returns {number}
 */
export function clampPage(requested, totalPages) {
    const tp = Math.max(1, Number.isFinite(totalPages) ? Math.floor(totalPages) : 1);
    const r  = Number.isFinite(requested) ? Math.floor(requested) : 1;
    if (r < 1)  return 1;
    if (r > tp) return tp;
    return r;
}

/**
 * Orchestrator: collega fetch paginato + render righe + controlli pager.
 *
 * Uso tipico nel componente (in obj.comp.js / script.comp.js):
 *
 *   const controller = createPaginatedTable({
 *     send: apiSend(this.api),              // o apiGuard(...) per GET
 *     url: '/endpoints/employees.php',
 *     baseParams: { searchMode: EmployeeCollection.MODE_ALL },
 *     itemsKey: 'employees',
 *     perPage: 50,
 *     tbody: this.tableBody,
 *     pager: this.pagerContainer,
 *     renderRow: (employee) => `<tr data-id="${employee.id}">...</tr>`,
 *     onError: (err) => notifyError(this.notifier, err),
 *   });
 *
 *   await controller.load();            // carica pagina 1
 *   await controller.goto(3);           // salta a pagina 3
 *   controller.setParams({ filter: 'X' }); // cambia filtri e ricarica da pagina 1
 *
 * @param {Object} cfg
 * @param {(url: string, params: object) => Promise<object>} cfg.send
 * @param {string}   cfg.url
 * @param {object}   [cfg.baseParams={}]
 * @param {string}   cfg.itemsKey
 * @param {number}   [cfg.perPage=50]
 * @param {HTMLElement} cfg.tbody
 * @param {HTMLElement} [cfg.pager]
 * @param {(item: any, index: number) => string|Node} cfg.renderRow
 * @param {string}   [cfg.emptyHtml='<tr><td colspan="99" class="text-center text-muted py-3">Nessun risultato</td></tr>']
 * @param {(err: any) => void} [cfg.onError]
 * @param {(meta: object, items: any[]) => void} [cfg.onAfterRender]
 * @returns {{ load: () => Promise<void>, goto: (page: number) => Promise<void>, setParams: (patch: object) => Promise<void>, getMeta: () => object|null }}
 */
export function createPaginatedTable(cfg) {
    const {
        send, url, itemsKey, tbody,
        baseParams   = {},
        perPage      = 50,
        pager        = null,
        renderRow,
        emptyHtml    = '<tr><td colspan="99" class="text-center text-muted py-3">Nessun risultato</td></tr>',
        onError      = null,
        onAfterRender = null,
    } = cfg ?? {};

    if (typeof send !== 'function')     throw new TypeError('createPaginatedTable: send richiesto');
    if (!url)                            throw new TypeError('createPaginatedTable: url richiesto');
    if (!itemsKey)                       throw new TypeError('createPaginatedTable: itemsKey richiesto');
    if (!tbody)                          throw new TypeError('createPaginatedTable: tbody richiesto');
    if (typeof renderRow !== 'function') throw new TypeError('createPaginatedTable: renderRow richiesto');

    let currentParams = { ...baseParams };
    let currentMeta   = null;
    let pendingToken  = 0;

    const renderItems = (items) => {
        if (!items.length) {
            tbody.innerHTML = emptyHtml;
            return;
        }
        const parts = [];
        items.forEach((item, i) => {
            const rendered = renderRow(item, i);
            if (rendered instanceof Node) {
                // Fallback piu' lento ma sicuro: append uno alla volta
                if (i === 0) tbody.innerHTML = '';
                tbody.appendChild(rendered);
            } else {
                parts.push(String(rendered ?? ''));
            }
        });
        if (parts.length) tbody.innerHTML = parts.join('');
    };

    const fetchPage = async (page) => {
        const myToken = ++pendingToken;
        const params  = { ...currentParams, page, per_page: perPage };
        try {
            const { items, meta } = await apiPaginated(send, url, params, itemsKey);
            // Scarta risultati se nel frattempo e' partito un altro fetch
            if (myToken !== pendingToken) return;
            currentMeta = meta;
            renderItems(items);
            if (pager) {
                renderPaginationControls(pager, meta, (newPage) => {
                    fetchPage(clampPage(newPage, meta.total_pages));
                });
            }
            if (onAfterRender) onAfterRender(meta, items);
        } catch (err) {
            if (myToken !== pendingToken) return;
            if (onError) onError(err);
            else throw err;
        }
    };

    return {
        load: () => fetchPage(1),
        goto: (page) => fetchPage(clampPage(page, currentMeta?.total_pages ?? 1)),
        setParams: (patch) => {
            currentParams = { ...currentParams, ...patch };
            return fetchPage(1);
        },
        getMeta: () => currentMeta,
    };
}

// ── Table Search ────────────────────────────────────────────────────────────

/**
 * Filtra le righe di una tabella in base ai valori dei campi di ricerca.
 * Usa l'attributo data-col per mappare ogni campo alla colonna corretta.
 * Se data-col non è presente, usa la posizione del campo nell'array.
 *
 * @param {HTMLElement[]} rows           — array di <tr> da filtrare
 * @param {HTMLInputElement[]} fields    — array di input di ricerca
 */
export function searchTable(rows, fields) {
    const active = [];
    fields.forEach((f, i) => {
        if (f.value !== '') {
            const col = f.dataset.col !== undefined ? parseInt(f.dataset.col, 10) : i;
            active.push({ col, query: f.value.toUpperCase() });
        }
    });

    if (active.length === 0) {
        rows.forEach(row => { row.hidden = false; });
        return;
    }

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        let hidden = false;

        for (const { col, query } of active) {
            const cell = cells[col];
            const text = cell ? cell.textContent.toUpperCase() : '';
            if (!text.includes(query)) { hidden = true; break; }
        }

        row.hidden = hidden;
    });
}

// ── Notify Helpers ──────────────────────────────────────────────────────────

/**
 * Mostra una notifica di errore tramite il componente notification.
 *
 * @param {object} notifier  — istanza _notification_ (con .container e .init / .initError)
 * @param {Error|object} err — errore catturato (con .response per errori API, altrimenti Error nativo)
 */
export function notifyError(notifier, err) {
    if (err.response) {
        const type = err.response._httpStatus === 403 ? FORBIDDEN_NOTICE : FAIL_NOTICE;
        notifier.show(err.response, type);
    } else {
        notifier.showError(err);
    }
}

/**
 * Mostra una notifica di successo tramite il componente notification.
 *
 * @param {object} notifier  — istanza _notification_
 * @param {object} response  — risposta API con .title e .message
 */
export function notifySuccess(notifier, response) {
    notifier.show(response, SUCCESS_NOTICE);
}

/**
 * Mostra una notifica di avviso tramite il componente notification.
 *
 * @param {object} notifier  — istanza _notification_
 * @param {object} response  — risposta con .title e .message
 */
export function notifyWarning(notifier, response) {
    notifier.show(response, ALERT_NOTICE);
}

// ── Dialog Helpers (Bootstrap modal replacements for native alert/confirm/prompt)

/**
 * Mostra un modale di conferma Bootstrap al posto di confirm() nativo.
 * Restituisce una Promise<boolean> — true se confermato, false se annullato.
 *
 * @param {string} message  — Testo del messaggio
 * @param {object} [opts]   — Opzioni
 * @param {string} [opts.title='Conferma']          — Titolo del modale
 * @param {string} [opts.confirmText='Conferma']     — Testo pulsante conferma
 * @param {string} [opts.cancelText='Annulla']       — Testo pulsante annulla
 * @param {string} [opts.confirmClass='sv-btn-primary'] — Classe pulsante conferma
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, opts = {}) {
    const {
        title        = 'Conferma',
        confirmText  = 'Conferma',
        cancelText   = 'Annulla',
        confirmClass = 'sv-btn-primary',
    } = opts;

    return new Promise(resolve => {
        const id = 'sv-confirm-dialog-' + Date.now();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="modal fade" id="${id}" tabindex="-1" aria-hidden="true"
                 aria-labelledby="${id}-title" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered modal-sm">
                    <div class="modal-content sv-modal">
                        <div class="modal-header">
                            <h5 class="modal-title fw-bold" id="${id}-title">
                                <i class="bi bi-question-circle me-2 text-primary"></i>${_escapeHtml(title)}
                            </h5>
                        </div>
                        <div class="modal-body">
                            <p class="mb-0">${_escapeHtml(message)}</p>
                        </div>
                        <div class="modal-footer border-0 justify-content-between">
                            <button type="button" class="btn sv-btn-secondary rounded-pill px-3" data-action="cancel">${_escapeHtml(cancelText)}</button>
                            <button type="button" class="btn ${confirmClass} rounded-pill px-3" data-action="confirm">${_escapeHtml(confirmText)}</button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.appendChild(wrapper);
        const modalEl = wrapper.querySelector('.modal');
        const modal   = new bootstrap.Modal(modalEl);

        const cleanup = (result) => {
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => {
                wrapper.remove();
                resolve(result);
            }, { once: true });
        };

        wrapper.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true));
        wrapper.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));

        modal.show();
    });
}

/**
 * Mostra un modale di selezione Bootstrap al posto di prompt() nativo.
 * Presenta una lista di opzioni cliccabili e restituisce l'indice selezionato (0-based)
 * oppure null se annullato.
 *
 * @param {string} title         — Titolo del modale
 * @param {string[]} options     — Lista di opzioni da mostrare
 * @returns {Promise<number|null>} — Indice dell'opzione selezionata o null
 */
export function selectDialog(title, options) {
    return new Promise(resolve => {
        const id = 'sv-select-dialog-' + Date.now();
        const wrapper = document.createElement('div');

        const listHtml = options.map((opt, i) =>
            `<button type="button" class="list-group-item list-group-item-action py-2" data-index="${i}">
                ${_escapeHtml(opt)}
            </button>`
        ).join('');

        wrapper.innerHTML = `
            <div class="modal fade" id="${id}" tabindex="-1" aria-hidden="true"
                 aria-labelledby="${id}-title">
                <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content sv-modal">
                        <div class="modal-header">
                            <h5 class="modal-title fw-bold" id="${id}-title">
                                <i class="bi bi-person-plus me-2 text-primary"></i>${_escapeHtml(title)}
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Chiudi"></button>
                        </div>
                        <div class="modal-body p-0">
                            <div class="list-group list-group-flush">${listHtml}</div>
                        </div>
                        <div class="modal-footer border-0">
                            <button type="button" class="btn sv-btn-secondary rounded-pill px-3" data-bs-dismiss="modal">Annulla</button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.appendChild(wrapper);
        const modalEl = wrapper.querySelector('.modal');
        const modal   = new bootstrap.Modal(modalEl);

        let resolved = false;

        wrapper.querySelector('.list-group').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-index]');
            if (!btn) return;
            resolved = true;
            const index = parseInt(btn.dataset.index, 10);
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', () => {
                wrapper.remove();
                resolve(index);
            }, { once: true });
        });

        modalEl.addEventListener('hidden.bs.modal', () => {
            if (!resolved) {
                wrapper.remove();
                resolve(null);
            }
        }, { once: true });

        modal.show();
    });
}

/** Escape HTML per inserimento sicuro nel DOM */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/** Escape attributo HTML — accetta anche numeri, null, undefined (coerce a stringa). */
export function escapeAttr(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @deprecated Alias interno — usare escapeHtml() */
const _escapeHtml = escapeHtml;

/**
 * Event delegation helper per tabelle.
 *
 * Registra UN SOLO listener sul <tbody> che legge `data-action` e `data-id`
 * dall'elemento cliccato (o da un suo antenato piu' vicino dentro la riga)
 * e invoca la callback corrispondente dalla mappa.
 *
 * Sostituisce il pattern "rebind per-riga" dopo ogni innerHTML=..., che
 * sprecava memoria e tempo con migliaia di listener orfani. Con la
 * delegation il listener sopravvive al re-render della tabella.
 *
 * Esempio:
 *   delegateTableClick(this.tableBody, {
 *     edit:   (id, tr) => this.openEdit(id),
 *     delete: (id, tr) => this.confirmDelete(id),
 *   });
 *
 *   // Nell'HTML della riga:
 *   <button data-action="edit" data-id="42">...</button>
 *
 * @param {HTMLElement} tbody     - Elemento <tbody> o qualsiasi contenitore delegante.
 * @param {Object<string, Function>} actionMap - Mappa data-action -> (id, trElement, event) => void
 * @returns {Function} Funzione di cleanup che rimuove il listener.
 */
export function delegateTableClick(tbody, actionMap) {
    if (!tbody || typeof tbody.addEventListener !== 'function') {
        throw new TypeError('delegateTableClick: tbody non valido');
    }

    const handler = (event) => {
        const trigger = event.target.closest('[data-action]');
        if (!trigger || !tbody.contains(trigger)) return;

        const action = trigger.dataset.action;
        const fn     = actionMap[action];
        if (typeof fn !== 'function') return;

        const tr = trigger.closest('tr');
        const id = trigger.dataset.id ?? tr?.dataset.id ?? null;

        fn(id, tr, event);
    };

    tbody.addEventListener('click', handler);
    return () => tbody.removeEventListener('click', handler);
}
