import { esc, each, asset, csrfField, isEmpty, countOf } from '../view.js';

export const render = ({ csrfToken, categories }) => `
<div class="row mb-3">
    <div class="col-12 d-flex justify-content-between align-items-center">
        <h1 class="h3 mb-0"><i class="bi bi-tags me-2"></i>Categorie</h1>
        <span class="badge bg-secondary">${countOf(categories)} totali</span>
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 text-muted mb-3"><i class="bi bi-plus-circle me-1"></i>Nuova categoria</h2>
        <form id="category-create-form" class="row g-2 align-items-end" autocomplete="off">
            ${csrfField(csrfToken)}            <div class="col-12">
                <label for="name" class="form-label small">Nome</label>
                <input type="text" id="name" name="name" class="form-control"
                       required maxlength="64"
                       placeholder="es. Spesa, Trasporti, Bollette">
            </div>
            <div class="col-6">
                <label for="color" class="form-label small">Colore</label>
                <input type="color" id="color" name="color" class="form-control form-control-color"
                       value="#6c757d"
                       title="Colore categoria">
            </div>
            <div class="col-6">
                <label for="sort_order" class="form-label small">Ordine</label>
                <input type="number" id="sort_order" name="sort_order" class="form-control" value="0">
            </div>
            <div class="col-12">
                <label for="icon" class="form-label small">Icona <span class="text-muted">(opz.)</span></label>
                <input type="text" id="icon" name="icon" class="form-control"
                       maxlength="32"
                       placeholder="Sfoglia con il bottone…"
                       data-icon-picker>
            </div>
            <div class="col-12 d-grid">
                <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>Aggiungi</button>
            </div>
        </form>
        <div class="form-text mt-2">
            Per le icone usa i nomi di <a href="https://icons.getbootstrap.com/" target="_blank" rel="noopener">Bootstrap Icons</a> (es. <code>bi-cart</code>).
        </div>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div class="card shadow-sm">
    <div class="card-body p-0">
        <table class="table table-hover mb-0 align-middle">
            <thead class="table-light">
                <tr>
                    <th style="width:1%"></th>
                    <th>Nome</th>
                    <th>Icona</th>
                    <th class="text-end">Ordine</th>
                    <th class="text-end" style="width:1%">Azioni</th>
                </tr>
            </thead>
            <tbody id="categories-tbody">
            ${each(categories, (c) => `                <tr data-id="${c.id}">
                    <td>
                        <span class="d-inline-block rounded-circle"
                              style="width:1.2rem;height:1.2rem;background-color:${esc(c.color)}"></span>
                    </td>
                    <td>${esc(c.name)}</td>
                    <td>
                        ${(!isEmpty(c.icon)) ? `                            <i class="bi ${esc(c.icon)} me-1"></i>
                            <code class="small text-muted">${esc(c.icon)}</code>
                        ` : `                            <span class="text-muted">—</span>
                        `}                    </td>
                    <td class="text-end">${c.sort_order}</td>
                    <td class="text-end text-nowrap">
                        <a href="${esc('/categories/edit?id=' + c.id)}"
                           class="btn btn-sm btn-outline-secondary">
                            <i class="bi bi-pencil"></i>
                        </a>
                        <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `)}            </tbody>
        </table>
        ${(isEmpty(categories)) ? `            <div class="p-4 text-center text-muted">
                <i class="bi bi-inbox fs-3 d-block mb-2"></i>
                Nessuna categoria. Aggiungi la prima qui sopra.
            </div>
        ` : ``}    </div>
</div>
</section>
</div>

<script type="module" src="${asset('js/pages/categories.js')}"></script>
`;
