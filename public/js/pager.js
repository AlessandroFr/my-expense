// ─── pager.js ────────────────────────────────────────────────────────────────
// Helper di paginazione riusabile per liste server-paginated.
//
// Uso tipico:
//   import { renderPager } from '../pager.js';
//   const pagerEl = document.getElementById('xyz-pager');
//   renderPager(pagerEl, { total, limit, offset, onChange: (newOffset) => {...} });

/**
 * Renderizza il pager dentro `node` (con info "righe X-Y di Z" + bottoni numerici).
 * @param {HTMLElement} node container
 * @param {{total:number, limit:number, offset:number, onChange:(newOffset:number)=>void, label?:string}} opts
 */
export function renderPager(node, opts) {
    if (!node) return;
    const total  = Math.max(0, Number(opts.total)  || 0);
    const limit  = Math.max(1, Number(opts.limit)  || 25);
    const offset = Math.max(0, Number(opts.offset) || 0);
    const label  = opts.label ?? 'righe';

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const curPage    = Math.min(totalPages, Math.floor(offset / limit) + 1);
    const start      = total === 0 ? 0 : offset + 1;
    const end        = Math.min(total, offset + limit);

    if (!node.querySelector('.pager-info')) {
        node.classList.add('d-flex', 'justify-content-between', 'align-items-center', 'small');
        node.innerHTML = `
            <div class="pager-info text-muted"></div>
            <ul class="pagination pagination-sm mb-0 pager-list"></ul>
        `;
    }
    const info = node.querySelector('.pager-info');
    const list = node.querySelector('.pager-list');

    info.textContent = total === 0
        ? `Nessuna riga`
        : `${label} ${start}–${end} di ${total} (pagina ${curPage} di ${totalPages})`;

    const items = [];
    items.push(`<li class="page-item ${curPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" data-pager-page="${curPage - 1}" aria-label="Precedente">&laquo;</a></li>`);

    const win  = 3;
    const from = Math.max(1, curPage - win);
    const to   = Math.min(totalPages, curPage + win);
    if (from > 1)  items.push(`<li class="page-item"><a class="page-link" href="#" data-pager-page="1">1</a></li>`);
    if (from > 2)  items.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
    for (let p = from; p <= to; p++) {
        items.push(`<li class="page-item ${p === curPage ? 'active' : ''}">
            <a class="page-link" href="#" data-pager-page="${p}">${p}</a></li>`);
    }
    if (to < totalPages - 1) items.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
    if (to < totalPages)     items.push(`<li class="page-item"><a class="page-link" href="#" data-pager-page="${totalPages}">${totalPages}</a></li>`);

    items.push(`<li class="page-item ${curPage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="#" data-pager-page="${curPage + 1}" aria-label="Successiva">&raquo;</a></li>`);
    list.innerHTML = items.join('');

    if (list.__pagerHandler) list.removeEventListener('click', list.__pagerHandler);
    list.__pagerHandler = (ev) => {
        const a = ev.target.closest('[data-pager-page]');
        if (!a) return;
        ev.preventDefault();
        if (a.closest('.disabled')) return;
        const p = Number(a.dataset.pagerPage);
        if (!Number.isFinite(p) || p < 1 || p > totalPages || p === curPage) return;
        const newOffset = (p - 1) * limit;
        opts.onChange?.(newOffset);
    };
    list.addEventListener('click', list.__pagerHandler);
}
