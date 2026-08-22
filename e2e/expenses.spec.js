/**
 * Il giro completo di una spesa: si aggiunge, si modifica, si cancella.
 *
 * E' la strada che si fa ogni giorno, e passa da tre pezzi diversi — il form
 * a sinistra, la riga della tabella con il suo menu, la finestra di modifica —
 * che si parlano solo via JSON. Se uno dei tre smette di capire gli altri, qui
 * si vede.
 */
import { test, expect } from '@playwright/test';

const IMPORTO = '37.50';
const DESCRIZIONE = `Pranzo e2e ${Date.now() % 100000}`;

test('una spesa si aggiunge, si corregge e si cancella', async ({ page }) => {
  await page.goto('/expenses');

  const form = page.locator('#expense-create-form');
  await form.locator('input[name="amount"]').fill(IMPORTO);
  await form.locator('select[name="category_id"]').selectOption({ label: 'Spesa quotidiana' });
  await form.locator('select[name="account_id"]').selectOption({ label: 'Conto corrente' });
  // La descrizione passa da TinyMCE: il textarea sotto e' nascosto, quindi si
  // scrive nell'iframe dell'editor come farebbe una persona.
  const editor = page.frameLocator('#expense-create-description_ifr').locator('body');
  await editor.click();
  await editor.fill(DESCRIZIONE);
  await form.locator('button[type="submit"]').click();

  const riga = page.locator('#expenses-tbody tr').filter({ hasText: DESCRIZIONE }).first();
  await expect(riga).toBeVisible();
  await expect(riga).toContainText('37,50');

  // Modifica: l'importo cambia e la riga si aggiorna senza ricaricare.
  await riga.locator('button[data-bs-toggle="dropdown"]').click();
  await riga.locator('[data-action="edit"]').click();
  const modale = page.locator('#expense-edit-modal');
  await expect(modale).toBeVisible();
  await modale.locator('input[name="amount"]').fill('42.00');
  await modale.locator('button[type="submit"]').click();
  await expect(modale).toBeHidden();

  const aggiornata = page.locator('#expenses-tbody tr').filter({ hasText: DESCRIZIONE }).first();
  await expect(aggiornata).toContainText('42,00');

  // Cancellazione: la conferma e' un confirm() del browser.
  page.once('dialog', (d) => d.accept());
  await aggiornata.locator('button[data-bs-toggle="dropdown"]').click();
  await aggiornata.locator('[data-action="delete"]').click();
  await expect(page.locator('#expenses-tbody tr').filter({ hasText: DESCRIZIONE })).toHaveCount(0);
});

test('il totale in cima segue quello che c\'e\' in tabella', async ({ page }) => {
  await page.goto('/expenses');
  await expect(page.locator('#expenses-count')).toContainText(/voce|voci/);
  const totale = await page.locator('#expenses-total').textContent();
  expect(totale).toMatch(/€|EUR/);
});
