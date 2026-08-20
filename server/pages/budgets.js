import { esc, asset, csrfField } from '../view.js';

export const render = ({ csrfToken, currentMonth }) => `
<div class="row mb-3">
    <div class="col-12">
        <h1 class="h3 mb-0"><i class="bi bi-bullseye me-2"></i>Budget mensili</h1>
        <div class="text-muted small">Imposta un tetto di spesa per categoria e monitora il progresso.</div>
    </div>
</div>

<div class="row g-3">
<aside class="col-12 col-lg-5 col-xl-4">
<div class="card shadow-sm">
    <div class="card-body">
        <h2 class="h6 mb-2"><i class="bi bi-calendar3 me-1"></i>Mese</h2>
        <input type="month" id="budget-month" class="form-control mb-3"
               value="${esc(currentMonth)}">

        <h2 class="h6 mb-3"><i class="bi bi-plus-circle me-1"></i>Imposta budget</h2>
        <form id="budget-form" class="row g-2 align-items-end">
            ${csrfField(csrfToken)}            <div class="col-12">
                <label class="form-label small mb-1">Categoria</label>
                <select name="category_id" class="form-select" required></select>
            </div>
            <div class="col-12">
                <label class="form-label small mb-1">Importo (€)</label>
                <input type="text" name="amount" class="form-control" inputmode="decimal" required>
            </div>
            <div class="col-12 d-grid">
                <button type="submit" class="btn btn-primary">
                    <i class="bi bi-check-circle me-1"></i>Salva
                </button>
            </div>
        </form>
    </div>
</div>
</aside>

<section class="col-12 col-lg-7 col-xl-8">
<div id="budget-list" class="row g-3">
    <div class="col-12 text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm me-2"></div>Caricamento…
    </div>
</div>
</section>
</div>

<script type="module" src="${asset('js/pages/budgets.js')}"></script>
`;
