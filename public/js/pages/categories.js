// ─── pages/categories.js ──────────────────────────────────────────────────────
// AJAX layer per /categories e /categories/edit.
//
// Espone gli endpoint via FetchRequest + envelope JSON normalizzato.
// Aggiorna il DOM in place (no full-page reload), notifica via toast.

import FetchRequest from '../FetchRequest.js';
import { apiSend }   from '../componentBase.js';
import { toast }     from '../toast.js';
import { stagger, withViewTransition, animateEnter, flip } from '../transitions.js';
import { optimisticCreate, optimisticDelete, optimisticUpdate } from '../optimistic.js';

const api  = FetchRequest.getInstance();
const send = apiSend(api);

// Base URL letto dal data attribute del <body>, impostato da layout.php.
const BASE = document.body.dataset.baseUrl ?? '';

// ── Helpers DOM ──────────────────────────────────────────────────────────────

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
}

function renderRow(c) {
    const tr = document.createElement('tr');
    tr.dataset.id = String(c.id);
    tr.innerHTML = `
        <td>
            <span class="d-inline-block rounded-circle"
                  style="width:1.2rem;height:1.2rem;background-color:${escHtml(c.color)}"></span>
        </td>
        <td>${escHtml(c.name)}</td>
        <td>
            ${c.icon
                ? `<i class="bi ${escHtml(c.icon)} me-1"></i><code class="small text-muted">${escHtml(c.icon)}</code>`
                : '<span class="text-muted">—</span>'}
        </td>
        <td class="text-end">${Number(c.sort_order) || 0}</td>
        <td class="text-end text-nowrap">
            <a href="${BASE}/categories/edit?id=${c.id}" class="btn btn-sm btn-outline-secondary">
                <i class="bi bi-pencil"></i>
            </a>
            <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete">
                <i class="bi bi-trash"></i>
            </button>
        </td>`;
    return tr;
}

function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}

// ── Form CREATE (lista) ─────────────────────────────────────────────────────

function wireCreateForm() {
    const form = document.getElementById('category-create-form');
    if (!form) return;

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const params = new URLSearchParams(new FormData(form));
            params.set('_csrf', getCsrfToken());
            const r = await send(`${BASE}/categories/create`, params);
            const cat = r.data?.category;
            if (!cat) throw new Error('Risposta server inattesa.');

            // Append row, replacing the empty-state placeholder if needed.
            const tbody = document.getElementById('categories-tbody');
            if (tbody) {
                tbody.appendChild(renderRow(cat));
            } else {
                // Empty state in pagina: rimuovo e ricreo la table.
                location.reload();
                return;
            }

            // Reset form (mantenendo il colore di default).
            form.reset();
            const colorEl = form.querySelector('input[name="color"]');
            if (colorEl) colorEl.value = '#6c757d';

            toast.success(`Categoria "${cat.name}" creata.`);
        } catch (err) {
            toast.error(err.message ?? 'Errore creazione categoria.');
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// ── Form UPDATE (pagina edit) ───────────────────────────────────────────────

function wireUpdateForm() {
    const form = document.getElementById('category-update-form');
    if (!form) return;

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const params = new URLSearchParams(new FormData(form));
            params.set('_csrf', getCsrfToken());
            const r = await send(`${BASE}/categories/update`, params);
            const cat = r.data?.category;
            if (!cat) throw new Error('Risposta server inattesa.');

            sessionStorage.setItem('flash', JSON.stringify({
                type: 'success', msg: `Categoria "${cat.name}" aggiornata.`,
            }));
            location.href = `${BASE}/categories`;
        } catch (err) {
            toast.error(err.message ?? 'Errore aggiornamento categoria.');
            submitBtn.disabled = false;
        }
    });
}

// ── Delete (event delegation sulla tabella) ─────────────────────────────────

function wireDeleteButtons() {
    const tbody = document.getElementById('categories-tbody');
    if (!tbody) return;

    tbody.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-action="delete"]');
        if (!btn) return;
        const tr = btn.closest('tr');
        if (!tr) return;
        const id = tr.dataset.id;
        const name = tr.children[1]?.textContent ?? 'questa categoria';

        if (!confirm(`Eliminare la categoria "${name}"? Le spese collegate perderanno il riferimento.`)) {
            return;
        }
        btn.disabled = true;

        try {
            const params = new URLSearchParams();
            params.set('id', id);
            params.set('_csrf', getCsrfToken());
            await send(`${BASE}/categories/delete`, params);
            tr.remove();
            toast.success(`Categoria "${name}" eliminata.`);
        } catch (err) {
            btn.disabled = false;
            toast.error(err.message ?? 'Errore eliminazione categoria.');
        }
    });
}

// ── Flash da redirect (post-update) ─────────────────────────────────────────

function consumePostRedirectFlash() {
    const raw = sessionStorage.getItem('flash');
    if (!raw) return;
    sessionStorage.removeItem('flash');
    try {
        const f = JSON.parse(raw);
        if (f?.type === 'success') toast.success(f.msg);
        else if (f?.type === 'error') toast.error(f.msg);
        else if (f?.msg) toast.info(f.msg);
    } catch (_) { /* ignore */ }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    consumePostRedirectFlash();
    wireCreateForm();
    wireUpdateForm();
    wireDeleteButtons();
});
