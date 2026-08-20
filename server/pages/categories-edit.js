import { esc, asset, csrfField } from '../view.js';

export const render = ({ csrfToken, cat }) => `
${(cat === null) ? `    <div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>Categoria non trovata.</div>
    <a href="${esc('/categories')}" class="btn btn-secondary">← Torna alle categorie</a>
` : `<div class="row mb-3">
    <div class="col-12 d-flex align-items-center">
        <a href="${esc('/categories')}" class="btn btn-sm btn-outline-secondary me-3">
            <i class="bi bi-arrow-left"></i>
        </a>
        <h1 class="h3 mb-0"><i class="bi bi-pencil me-2"></i>Modifica categoria</h1>
    </div>
</div>

<div class="row justify-content-center">
    <div class="col-lg-8">
        <div class="card shadow-sm">
            <div class="card-body p-4">
                <form id="category-update-form" autocomplete="off">
                    ${csrfField(csrfToken)}                    <input type="hidden" name="id" value="${cat.id}">

                    <div class="row g-3">
                        <div class="col-md-6">
                            <label for="name" class="form-label">Nome</label>
                            <input type="text" id="name" name="name" class="form-control"
                                   required maxlength="64"
                                   value="${esc(cat.name)}" autofocus>
                        </div>
                        <div class="col-md-3">
                            <label for="color" class="form-label">Colore</label>
                            <input type="color" id="color" name="color" class="form-control form-control-color"
                                   value="${esc(cat.color)}">
                        </div>
                        <div class="col-md-3">
                            <label for="sort_order" class="form-label">Ordine</label>
                            <input type="number" id="sort_order" name="sort_order" class="form-control"
                                   value="${esc(cat.sort_order)}">
                        </div>
                        <div class="col-12">
                            <label for="icon" class="form-label">Icona <span class="text-muted small">(opzionale)</span></label>
                            <input type="text" id="icon" name="icon" class="form-control"
                                   maxlength="32"
                                   value="${esc((cat.icon ?? ''))}"
                                   placeholder="Sfoglia con il bottone…"
                                   data-icon-picker>
                        </div>
                    </div>

                    <hr class="my-4">

                    <div class="d-flex justify-content-between">
                        <a href="${esc('/categories')}" class="btn btn-outline-secondary">
                            Annulla
                        </a>
                        <button type="submit" class="btn btn-primary">
                            <i class="bi bi-check-lg me-1"></i>Salva modifiche
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<script type="module" src="${asset('js/pages/categories.js')}"></script>
`}
`;
