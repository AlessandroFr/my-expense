// ─── pages/contacts.js ────────────────────────────────────────────────────────
// Gestione anagrafiche fornitori/clienti: lista paginata server-side,
// ricerca debounced, modal CRUD, archivio/elimina.

import FetchRequest from '../FetchRequest.js';
import { apiSend, confirmDialog } from '../componentBase.js';
import { toast }     from '../toast.js';
import { optimisticDelete } from '../optimistic.js';
import { renderPager } from '../pager.js';
import { fmtMoney, getCsrfToken } from '../format.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);

const BASE = document.body.dataset.baseUrl ?? '';

const PAGE_SIZE_OPTIONS  = [10, 25, 50, 100];
const PAGE_SIZE_DEFAULT  = 25;
const PAGE_SIZE_KEY      = 'mx-contacts-page-size';

function loadStoredPageSize() {
    const raw = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZE_OPTIONS.includes(raw) ? raw : PAGE_SIZE_DEFAULT;
}
function storePageSize(n) {
    if (PAGE_SIZE_OPTIONS.includes(n)) localStorage.setItem(PAGE_SIZE_KEY, String(n));
}

let PAGE_SIZE  = loadStoredPageSize();
let pageOffset = 0;
let cache = { contactsById: new Map(), balances: new Map() };
// Set di id selezionati per la fusione. Persiste al cambio pagina/filtro
// (l'utente potrebbe voler unire due duplicati che sono in pagine diverse).
// Tutti i nomi/usage delle anagrafiche selezionate li teniamo in
// `mergeMeta` cosi' il modal mostra anche i record fuori pagina.
const mergeSelection = new Set();
const mergeMeta = new Map(); // id -> {name, vat_number, usage_total}

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
}
const fmtAmount = (v) => fmtMoney(v);
function debounce(fn, ms) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

// ── Render tabella ──────────────────────────────────────────────────────────

function renderRow(c) {
    const tr = document.createElement('tr');
    tr.dataset.id = String(c.id);
    if (c.archived) tr.classList.add('text-muted', 'fst-italic');

    const bal = cache.balances.get(c.id);
    const exp = bal ? Number(bal.expenses_total) : 0;
    const inc = bal ? Number(bal.incomes_total)  : 0;
    const net = bal ? Number(bal.net) : 0;
    const netClass = net > 0 ? 'text-success' : (net < 0 ? 'text-danger' : 'text-muted');

    const detailUrl = `${BASE}/contacts/detail?id=${c.id}`;
    const checked = mergeSelection.has(c.id) ? 'checked' : '';
    tr.innerHTML = `
        <td>
            <input type="checkbox" class="form-check-input contact-merge-cb" data-id="${c.id}" ${checked}
                   title="Includi nella fusione">
        </td>
        <td>
            <span class="d-inline-block rounded-circle"
                  style="width:1.2rem;height:1.2rem;background-color:${escHtml(c.color)}"></span>
        </td>
        <td>
            <a href="${detailUrl}" class="text-decoration-none">${escHtml(c.name)}</a>
            ${c.archived ? '<span class="badge bg-warning-subtle text-warning ms-1">archiviato</span>' : ''}
        </td>
        <td class="text-end">${exp ? fmtAmount(exp) : '<span class="text-muted">—</span>'}</td>
        <td class="text-end">${inc ? fmtAmount(inc) : '<span class="text-muted">—</span>'}</td>
        <td class="text-end ${netClass}">${bal ? fmtAmount(net) : '<span class="text-muted">—</span>'}</td>
        <td><code class="small">${escHtml(c.vat_number || '')}</code></td>
        <td class="text-end text-nowrap">
            <a href="${detailUrl}" class="btn btn-sm btn-outline-secondary" title="Dettaglio">
                <i class="bi bi-graph-up"></i>
            </a>
            <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" title="Modifica">
                <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" title="Elimina">
                <i class="bi bi-trash"></i>
            </button>
        </td>`;
    return tr;
}

// ── Merge selection helpers ─────────────────────────────────────────────────

function addToMergeSelection(c) {
    mergeSelection.add(c.id);
    mergeMeta.set(c.id, {
        id:          c.id,
        name:        c.name,
        vat_number:  c.vat_number || '',
        usage_total: c.usage?.total ?? 0,
    });
}

function refreshMergeUi() {
    const btn = document.getElementById('contacts-merge-btn');
    const cnt = document.querySelector('#contacts-merge-btn [data-merge-count]');
    if (!btn) return;
    if (mergeSelection.size >= 2) {
        btn.classList.remove('d-none');
        if (cnt) cnt.textContent = String(mergeSelection.size);
    } else {
        btn.classList.add('d-none');
    }
    // Sincronizza select-all sulla pagina visibile.
    const selAll = document.getElementById('contacts-select-all');
    if (selAll) {
        const visibleIds = [...cache.contactsById.keys()];
        const allChecked = visibleIds.length > 0 && visibleIds.every(id => mergeSelection.has(id));
        const anyChecked = visibleIds.some(id => mergeSelection.has(id));
        selAll.checked       = allChecked;
        selAll.indeterminate = !allChecked && anyChecked;
    }
}

function renderRows(items, total) {
    const tbody = document.getElementById('contacts-tbody');
    const empty = document.getElementById('contacts-empty');
    if (!tbody) return;
    tbody.innerHTML = '';
    cache.contactsById.clear();
    if (!items || items.length === 0) {
        empty?.classList.remove('d-none');
    } else {
        empty?.classList.add('d-none');
        for (const c of items) {
            cache.contactsById.set(c.id, c);
            // Se l'utente l'aveva gia' selezionata, sincronizza i metadati
            // (potrebbero essere cambiati: name, usage…).
            if (mergeSelection.has(c.id)) addToMergeSelection(c);
            tbody.appendChild(renderRow(c));
        }
    }
    const countEl = document.getElementById('contacts-count');
    if (countEl) {
        countEl.textContent = `${total} totali`;
    }
    refreshMergeUi();
}

function renderPagerSection(total) {
    const node = document.getElementById('contacts-pager');
    if (!node) return;
    renderPager(node, {
        total, limit: PAGE_SIZE, offset: pageOffset,
        label: 'anagrafiche',
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        onChange: (newOffset) => {
            pageOffset = newOffset;
            loadList();
        },
        onLimitChange: (newLimit) => {
            PAGE_SIZE = newLimit;
            storePageSize(newLimit);
            pageOffset = 0;
            loadList();
        },
    });
}

// ── Caricamento dati ────────────────────────────────────────────────────────

function currentFilters() {
    return {
        search: (document.getElementById('filter-search')?.value ?? '').trim(),
        include_archived: document.getElementById('filter-archived')?.checked ? 1 : 0,
    };
}

async function loadList() {
    const { search, include_archived } = currentFilters();
    const page = Math.floor(pageOffset / PAGE_SIZE) + 1;
    const params = new URLSearchParams({
        page:             String(page),
        page_size:        String(PAGE_SIZE),
        include_archived: String(include_archived),
        with_usage:       '1',
    });
    if (search !== '') params.set('search', search);

    try {
        const [listResp, balanceResp] = await Promise.all([
            api.get(`${BASE}/contacts/list?${params.toString()}`),
            api.get(`${BASE}/contacts/balance?year=${new Date().getFullYear()}`),
        ]);
        const data = listResp?.data ?? {};
        const items = data.contacts ?? [];
        const total = Number(data.total ?? items.length);

        cache.balances = new Map();
        for (const b of (balanceResp?.data?.summary ?? [])) {
            cache.balances.set(b.contact_id, b);
        }

        renderRows(items, total);
        renderPagerSection(total);
    } catch (err) {
        toast.error(err.message ?? 'Errore caricamento anagrafiche.');
    }
}

const reloadDebounced = debounce(() => {
    pageOffset = 0;
    loadList();
}, 300);

// ── Modal ────────────────────────────────────────────────────────────────────

function openModal(contact = null) {
    const dlg = document.getElementById('contact-modal');
    const form = document.getElementById('contact-form');
    if (!dlg || !form) return;
    form.reset();
    form.querySelector('input[name="id"]').value = '';
    form.querySelector('input[name="archived"]').value = '0';

    const archiveBtn   = form.querySelector('[data-action="archive"]');
    const archiveLabel = form.querySelector('[data-archive-label]');
    const modeLabel    = form.querySelector('[data-mode-label]');

    if (contact) {
        modeLabel.textContent = 'Modifica anagrafica';
        form.querySelector('input[name="id"]').value          = contact.id;
        form.querySelector('input[name="name"]').value        = contact.name ?? '';
        form.querySelector('input[name="vat_number"]').value  = contact.vat_number ?? '';
        form.querySelector('input[name="iban"]').value        = contact.iban ?? '';
        form.querySelector('input[name="email"]').value       = contact.email ?? '';
        form.querySelector('input[name="notes"]').value       = contact.notes ?? '';
        form.querySelector('input[name="color"]').value       = contact.color || '#6c757d';
        form.querySelector('input[name="archived"]').value    = contact.archived ? '1' : '0';
        archiveBtn.classList.remove('d-none');
        archiveLabel.textContent = contact.archived ? 'Ripristina' : 'Archivia';
        archiveBtn.dataset.archived = contact.archived ? '1' : '0';
        archiveBtn.dataset.id = contact.id;
    } else {
        modeLabel.textContent = 'Nuova anagrafica';
        form.querySelector('input[name="color"]').value = '#6c757d';
        archiveBtn.classList.add('d-none');
    }
    dlg.showModal();
}

function closeModal() {
    document.getElementById('contact-modal')?.close();
}

async function submitForm(ev) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const id = form.querySelector('input[name="id"]').value;
    const params = new URLSearchParams(new FormData(form));
    params.set('_csrf', getCsrfToken());
    const url = id ? `${BASE}/contacts/update` : `${BASE}/contacts/create`;
    try {
        await send(url, params);
        toast.success(id ? 'Anagrafica aggiornata.' : 'Anagrafica creata.');
        closeModal();
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore salvataggio.');
    }
}

async function archiveCurrent() {
    const form = document.getElementById('contact-form');
    const id = form.querySelector('input[name="id"]').value;
    if (!id) return;
    const archived = form.querySelector('[data-action="archive"]').dataset.archived === '1' ? 0 : 1;
    const params = new URLSearchParams({ id, archived: String(archived), _csrf: getCsrfToken() });
    try {
        await send(`${BASE}/contacts/archive`, params);
        toast.success(archived ? 'Anagrafica archiviata.' : 'Anagrafica ripristinata.');
        closeModal();
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore archiviazione.');
    }
}

// ── Wire events ──────────────────────────────────────────────────────────────

function wire() {
    document.querySelector('[data-action="new"]')?.addEventListener('click', () => openModal(null));

    const dlg = document.getElementById('contact-modal');
    dlg?.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-action="close"]')) closeModal();
        if (ev.target.closest('[data-action="archive"]')) archiveCurrent();
    });

    document.getElementById('contact-form')?.addEventListener('submit', submitForm);

    const tbody = document.getElementById('contacts-tbody');
    tbody?.addEventListener('click', async (ev) => {
        const tr = ev.target.closest('tr');
        if (!tr) return;
        const id = Number(tr.dataset.id);
        const editBtn = ev.target.closest('[data-action="edit"]');
        const delBtn  = ev.target.closest('[data-action="delete"]');
        if (editBtn) {
            const contact = cache.contactsById.get(id);
            if (contact) openModal(contact);
            return;
        }
        if (delBtn) {
            const contact = cache.contactsById.get(id);
            if (!contact) return;
            const usage = contact.usage?.total ?? 0;
            const msg = usage > 0
                ? `"${contact.name}" e' collegata a ${usage} movimenti. Eliminandola le spese/entrate restano ma perdono il riferimento. Procedere?`
                : `Eliminare "${contact.name}"?`;
            if (!confirm(msg)) return;
            try {
                await optimisticDelete({
                    row: tr,
                    call: () => {
                        const params = new URLSearchParams({ id: String(id), _csrf: getCsrfToken() });
                        return send(`${BASE}/contacts/delete`, params);
                    },
                });
                cache.contactsById.delete(id);
                cache.balances.delete(id);
                toast.success('Anagrafica eliminata.');
                loadList();
            } catch { /* toast handled */ }
        }
    });

    document.getElementById('filter-search')?.addEventListener('input', reloadDebounced);
    document.getElementById('filter-archived')?.addEventListener('change', () => {
        pageOffset = 0;
        loadList();
    });

    // ── Selezione per fusione ────────────────────────────────────────────
    tbody?.addEventListener('change', (ev) => {
        const cb = ev.target.closest('input.contact-merge-cb');
        if (!cb) return;
        const id = Number(cb.dataset.id);
        const c  = cache.contactsById.get(id);
        if (cb.checked) {
            if (c) addToMergeSelection(c);
        } else {
            mergeSelection.delete(id);
            mergeMeta.delete(id);
        }
        refreshMergeUi();
    });

    document.getElementById('contacts-select-all')?.addEventListener('change', (ev) => {
        const checked = ev.target.checked;
        for (const c of cache.contactsById.values()) {
            if (checked) addToMergeSelection(c);
            else { mergeSelection.delete(c.id); mergeMeta.delete(c.id); }
        }
        // Aggiorna i checkbox visibili.
        for (const cb of document.querySelectorAll('input.contact-merge-cb')) {
            cb.checked = mergeSelection.has(Number(cb.dataset.id));
        }
        refreshMergeUi();
    });

    // ── Doppioni ─────────────────────────────────────────────────────────
    document.getElementById('contacts-dedup-btn')?.addEventListener('click', openDedupModal);
    const dedupDlg = document.getElementById('dedup-modal');
    dedupDlg?.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-action="dedup-close"]')) { dedupDlg.close(); return; }
        if (ev.target.closest('[data-action="junk-delete"]')) { deleteJunk(); return; }
        const btn = ev.target.closest('[data-dedup-merge]');
        if (btn) mergeDedupGroup(btn.dataset.dedupMerge);
    });

    // ── Merge modal ──────────────────────────────────────────────────────
    document.getElementById('contacts-merge-btn')?.addEventListener('click', openMergeModal);
    const mergeDlg  = document.getElementById('merge-modal');
    mergeDlg?.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-action="merge-close"]')) closeMergeModal();
    });
    mergeDlg?.addEventListener('change', (ev) => {
        if (!ev.target.matches('input[name="merge-winner"]')) return;
        const submitBtn = mergeDlg.querySelector('button[data-action="merge-submit"]');
        if (submitBtn) submitBtn.disabled = false;
    });
    document.getElementById('merge-form')?.addEventListener('submit', submitMerge);
}

// ── Doppioni ─────────────────────────────────────────────────────────────────
// Trova i nomi che sono la stessa cosa scritta in due modi e li fa unire un
// gruppo alla volta. La fusione vera e' sempre /contacts/merge: qui si sceglie
// soltanto chi resta.

async function openDedupModal() {
    const dlg = document.getElementById('dedup-modal');
    const box = document.getElementById('dedup-groups');
    if (!dlg || !box) return;

    box.innerHTML = '<div class="text-center text-muted py-4">'
        + '<div class="spinner-border spinner-border-sm me-2"></div>Sto cercando…</div>';
    dlg.showModal();

    try {
        const resp = await api.get(`${BASE}/contacts/duplicates`);
        renderDedupGroups(resp?.data?.groups ?? [], Number(resp?.data?.scanned ?? 0));
        renderJunk(resp?.data?.junk ?? []);
    } catch (err) {
        box.innerHTML = `<div class="alert alert-danger small mb-0">${escHtml(err.message ?? 'Ricerca fallita.')}</div>`;
    }
}

function renderDedupGroups(groups, scanned) {
    const box = document.getElementById('dedup-groups');
    if (!box) return;

    if (groups.length === 0) {
        box.innerHTML = `<div class="alert alert-success small mb-0">
            <i class="bi bi-check-circle me-1"></i>Nessun doppione fra le ${scanned} anagrafiche.
        </div>`;
        return;
    }

    box.innerHTML = groups.map((g, gi) => {
        const rows = g.members.map((m) => `
            <label class="list-group-item d-flex align-items-center gap-2 py-1">
                <input type="radio" class="form-check-input m-0" name="dedup-winner-${gi}" value="${m.id}"
                       ${m.id === g.suggested_winner_id ? 'checked' : ''}>
                <span class="flex-grow-1">${escHtml(m.name)}</span>
                <span class="small text-muted">${m.usage_total > 0 ? `${m.usage_total} mov.` : '—'}</span>
            </label>`).join('');
        return `
            <div class="card mb-2" data-dedup-group="${gi}">
                <div class="card-body p-2">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <span class="badge bg-light text-dark border">${escHtml(g.reason)}</span>
                        <span class="small text-muted">tieni il nome selezionato</span>
                        <button type="button" class="btn btn-warning btn-sm ms-auto" data-dedup-merge="${gi}">
                            <i class="bi bi-bezier2 me-1"></i>Unisci
                        </button>
                    </div>
                    <div class="list-group list-group-flush">${rows}</div>
                </div>
            </div>`;
    }).join('');
}

/** I nomi che sono gergo della banca: si spuntano e si buttano. */
function renderJunk(junk) {
    const box  = document.getElementById('dedup-junk');
    const list = document.getElementById('dedup-junk-list');
    if (!box || !list) return;

    if (junk.length === 0) { box.classList.add('d-none'); return; }
    box.classList.remove('d-none');
    list.innerHTML = junk.map(c => `
        <label class="list-group-item d-flex align-items-center gap-2 py-1">
            <input type="checkbox" class="form-check-input m-0" data-junk-id="${c.id}" checked>
            <span class="flex-grow-1">${escHtml(c.name)}</span>
            <span class="small text-muted">${c.usage_total > 0 ? `${c.usage_total} mov.` : '—'}</span>
        </label>`).join('');
}

async function deleteJunk() {
    const spuntati = [...document.querySelectorAll('#dedup-junk-list input[data-junk-id]:checked')];
    if (spuntati.length === 0) { toast.warning('Non hai spuntato nessun nome.'); return; }

    const conferma = await confirmDialog(
        `Cancellare ${spuntati.length} anagrafic${spuntati.length === 1 ? 'a' : 'he'}? `
        + 'I movimenti restano, ma senza fornitore.',
        { confirmText: 'Cancella', confirmClass: 'btn-danger' },
    );
    if (!conferma) return;

    let fatti = 0;
    for (const cb of spuntati) {
        try {
            await send(`${BASE}/contacts/delete`, new URLSearchParams({
                id: cb.dataset.junkId, _csrf: getCsrfToken(),
            }));
            cb.closest('label')?.remove();
            fatti++;
        } catch (err) {
            toast.error(`«${cb.closest('label')?.textContent.trim()}»: ${err.message ?? 'errore'}`);
        }
    }
    if (fatti > 0) {
        toast.success(`Cancellat${fatti === 1 ? 'a 1 anagrafica' : `e ${fatti} anagrafiche`}.`);
        loadList();
    }
    if (!document.querySelector('#dedup-junk-list input[data-junk-id]')) {
        document.getElementById('dedup-junk')?.classList.add('d-none');
    }
}

async function mergeDedupGroup(gi) {
    const card = document.querySelector(`[data-dedup-group="${gi}"]`);
    if (!card) return;

    const scelti = [...card.querySelectorAll(`input[name="dedup-winner-${gi}"]`)];
    const winnerId = Number(scelti.find((r) => r.checked)?.value ?? 0);
    const losers = scelti.map((r) => Number(r.value)).filter((id) => id !== winnerId);
    if (winnerId <= 0 || losers.length === 0) return;

    const winnerName = scelti.find((r) => r.checked)?.closest('label')?.querySelector('span')?.textContent ?? '';
    const conferma = await confirmDialog(
        `Unire ${losers.length} nome${losers.length === 1 ? '' : 'i'} in "${winnerName.trim()}"? `
        + 'I movimenti passano su questo nome, gli altri vengono cancellati.',
        { confirmText: 'Unisci', confirmClass: 'btn-warning' },
    );
    if (!conferma) return;

    try {
        const r = await send(`${BASE}/contacts/merge`, new URLSearchParams({
            winner_id: String(winnerId),
            loser_ids: JSON.stringify(losers),
            _csrf: getCsrfToken(),
        }));
        const stats = r?.data?.result ?? {};
        const re = stats.reassigned ?? {};
        const spostati = (re.expenses ?? 0) + (re.incomes ?? 0) + (re.recurring ?? 0);
        toast.success(`Uniti in "${stats.winner_name ?? winnerName}": ${spostati} movimenti spostati.`);
        card.remove();
        // I gruppi rimasti restano validi: la fusione tocca solo questo.
        const box = document.getElementById('dedup-groups');
        if (box && !box.querySelector('[data-dedup-group]')) {
            box.innerHTML = '<div class="alert alert-success small mb-0">'
                + '<i class="bi bi-check-circle me-1"></i>Fatto, non resta altro da unire.</div>';
        }
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore fusione anagrafiche.');
    }
}

function openMergeModal() {
    const dlg  = document.getElementById('merge-modal');
    const tbody = document.getElementById('merge-candidates');
    const submitBtn = dlg?.querySelector('button[data-action="merge-submit"]');
    if (!dlg || !tbody) return;
    if (mergeSelection.size < 2) {
        toast.warning('Seleziona almeno 2 anagrafiche da fondere.');
        return;
    }
    // Renderizza la tabella interna ordinata per usage (chi ha piu'
    // movimenti e' candidato naturale a vincitore).
    const rows = [...mergeMeta.values()].sort(
        (a, b) => (b.usage_total ?? 0) - (a.usage_total ?? 0) || a.name.localeCompare(b.name)
    );
    tbody.innerHTML = rows.map((m, i) => `
        <tr>
            <td class="text-center">
                <input type="radio" class="form-check-input" name="merge-winner" value="${m.id}"${i === 0 ? ' checked' : ''}>
            </td>
            <td>
                <div>${escHtml(m.name)}</div>
                ${m.vat_number ? `<code class="small text-muted">${escHtml(m.vat_number)}</code>` : ''}
            </td>
            <td class="text-end">${m.usage_total > 0 ? `${m.usage_total} mov.` : '<span class="text-muted">—</span>'}</td>
        </tr>
    `).join('');
    if (submitBtn) submitBtn.disabled = false; // c'e' sempre un radio prechecked
    dlg.showModal();
}

function closeMergeModal() {
    document.getElementById('merge-modal')?.close();
}

async function submitMerge(ev) {
    ev.preventDefault();
    const dlg = document.getElementById('merge-modal');
    const winnerInput = dlg?.querySelector('input[name="merge-winner"]:checked');
    const winnerId = Number(winnerInput?.value || 0);
    if (winnerId <= 0) {
        toast.warning('Scegli un\'anagrafica vincitrice.');
        return;
    }
    const losers = [...mergeSelection].filter(id => id !== winnerId);
    if (losers.length === 0) {
        toast.warning('Servono almeno 2 anagrafiche selezionate (vincitore + 1 perdente).');
        return;
    }
    const winnerName = mergeMeta.get(winnerId)?.name ?? '?';
    if (!confirm(
        `Fondere ${losers.length} anagrafic${losers.length === 1 ? 'a' : 'he'} in "${winnerName}"? `
        + 'I movimenti collegati verranno spostati e le anagrafiche perdenti cancellate.'
    )) return;

    const params = new URLSearchParams({
        winner_id: String(winnerId),
        loser_ids: JSON.stringify(losers),
        _csrf:     getCsrfToken(),
    });
    try {
        const r = await send(`${BASE}/contacts/merge`, params);
        const stats = r?.data?.result ?? {};
        const re = stats.reassigned ?? {};
        const total = (re.expenses ?? 0) + (re.incomes ?? 0) + (re.recurring ?? 0);
        toast.success(`Fusione: ${stats.merged ?? 0} anagrafic${(stats.merged ?? 0) === 1 ? 'a' : 'he'} eliminat${(stats.merged ?? 0) === 1 ? 'a' : 'e'}, ${total} movimenti spostati su "${stats.winner_name ?? winnerName}".`);
        mergeSelection.clear();
        mergeMeta.clear();
        closeMergeModal();
        loadList();
    } catch (err) {
        toast.error(err.message ?? 'Errore fusione anagrafiche.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    wire();
    loadList();
});
