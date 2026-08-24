/**
 * Ogni pagina si apre e il suo modulo JS parte davvero.
 *
 * Non e' una formalita': `budgets.js` e' rimasto per mesi con un errore di
 * sintassi (`join('''')`), quindi il browser scartava tutto il file e la
 * pagina restava vuota — senza che niente, lato server, se ne accorgesse. Qui
 * un errore in console fa fallire il test.
 */
import { test, expect } from '@playwright/test';

const PAGES = [
  ['/dashboard', '#kpi-current'],
  ['/expenses', '#expenses-tbody tr'],
  ['/incomes', 'table'],
  ['/accounts', '.card'],
  ['/cambi', '.alert, .card'],
  ['/categories', '.card'],
  ['/budgets', '#budget-list'],
  ['/recurring', 'table'],
  ['/transfers', '#transfers-list'],
  ['/contacts', '.card'],
  ['/reports', '#report-year'],
  ['/pac', '#pac-plans-list'],
  ['/securities', '.card'],
  ['/settings', '#settings-tabs'],
  ['/bank-profiles', '.card'],
  ['/wiki', '[data-wiki-section]'],
];

for (const [path, visible] of PAGES) {
  test(`${path} si apre senza errori in console`, async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto(path);
    await expect(page.locator(visible).first()).toBeVisible();
    expect(errors, `errori in console su ${path}`).toEqual([]);
  });
}

test('la lista delle spese arriva dal server, non dal markup', async ({ page }) => {
  // Quante spese dice il server, e quante righe disegna la pagina: se il fetch
  // o il rendering saltano, i due numeri non coincidono. Il confronto non
  // dipende da cosa hanno lasciato in giro le altre spec.
  const risposta = await page.request.get('/expenses/list?limit=200');
  const attese = (await risposta.json()).data.expenses.length;

  await page.goto('/expenses');
  await expect(page.locator('#expenses-tbody tr.mx-detail-row')).toHaveCount(attese);
  await expect(page.locator('#expenses-total')).toContainText(/\d+,\d{2}/);
});
