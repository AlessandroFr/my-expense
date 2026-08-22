/**
 * L'import dell'estratto conto, dal file all'anteprima alla conferma.
 *
 * Il file di prova ha il tracciato di Sella/Mediolanum e tre righe: un
 * versamento da 500 che i piani riconoscono da soli (300 + 200), una spesa
 * normale e un'entrata. L'anteprima deve proporre la divisione senza che
 * nessuno gliela chieda, e la conferma deve scrivere tre movimenti e due
 * quote.
 */
import { test, expect } from '@playwright/test';

const CSV = [
  'Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate',
  '05/09/2026;05/09/2026;Bonifico;ADDEBITO PAC SETTEMBRE;-500,00;',
  '07/09/2026;07/09/2026;Pagamento;SUPERMERCATO CENTRALE;-42,30;',
  '10/09/2026;10/09/2026;Bonifico;STIPENDIO SETTEMBRE;;1.500,00',
].join('\r\n');

test('un estratto conto entra, e il bonifico del PAC si divide da solo', async ({ page }) => {
  await page.goto('/expenses');

  await page.locator('#tab-tools-tab').click();
  await page.locator('#btn-import-bank').click();

  const modale = page.locator('#bank-import-modal');
  await expect(modale).toBeVisible();
  await modale.locator('select[name="account_id"]').selectOption({ label: 'Conto corrente (checking)' });
  await modale.locator('input[name="file"]').setInputFiles({
    name: 'estratto.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8'),
  });
  await modale.locator('#bank-preview-btn').click();

  // Anteprima: tre righe lette, nell'ordine del file. La descrizione sta in un
  // campo modificabile, quindi la riga si prende per posizione e si controlla
  // il valore del campo.
  const anteprima = page.locator('#bank-preview-list');
  await expect(anteprima.locator('[data-idx]')).toHaveCount(3);
  const versamento = anteprima.locator('[data-idx="0"]');
  await expect(versamento.locator('input[data-field="description"]')).toHaveValue('ADDEBITO PAC SETTEMBRE');
  await expect(versamento).toContainText('quote PAC');

  // La divisione proposta si puo' guardare prima di confermare.
  await versamento.locator('[data-bank-action="pac"]').click();
  const split = page.locator('#pac-split-modal');
  await expect(split).toBeVisible();
  await expect(split.locator('#pac-split-residual')).toContainText('torna');
  await split.locator('#pac-split-apply').click();
  await expect(split).toBeHidden();

  await modale.locator('#bank-commit-btn').click();
  const esito = page.locator('#bank-import-result');
  await expect(esito).toContainText('2 spese');
  await expect(esito).toContainText('1 entrate');
  await expect(esito).toContainText('Registrate');

  // La spesa normale resta una spesa; il versamento no, e' un trasferimento.
  await page.locator('#bank-import-modal .btn-close').click();
  await page.reload();
  // Nel frattempo l'importatore ha creato anche l'anagrafica, che finisce in un
  // datalist nascosto: la spesa si cerca dentro la tabella.
  await expect(page.locator('#expenses-tbody').getByText('SUPERMERCATO CENTRALE').first()).toBeVisible();
  await expect(page.locator('#expenses-tbody tr').filter({ hasText: 'ADDEBITO PAC SETTEMBRE' })).toHaveCount(0);

  // E le quote sono finite sui piani.
  await page.goto('/pac');
  await expect(page.locator('#pac-plans-list tr').filter({ hasText: 'PAC Europa' })).toContainText('200,00');
});

test('lo stesso file, importato due volte, non raddoppia niente', async ({ page }) => {
  await page.goto('/expenses');
  await page.locator('#tab-tools-tab').click();
  await page.locator('#btn-import-bank').click();

  const modale = page.locator('#bank-import-modal');
  await modale.locator('select[name="account_id"]').selectOption({ label: 'Conto corrente (checking)' });
  await modale.locator('input[name="file"]').setInputFiles({
    name: 'estratto.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8'),
  });
  await modale.locator('#bank-preview-btn').click();

  // Tutte e tre le righe arrivano marcate come duplicate e gia' deselezionate:
  // il file e' lo stesso, e l'impronta di ogni movimento e' gia' nel database.
  const righe = page.locator('#bank-preview-list [data-idx]');
  await expect(righe).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(righe.nth(i)).toContainText('duplicato');
    await expect(righe.nth(i).locator('input[data-field="include"]')).not.toBeChecked();
  }

  // Con niente da importare la conferma non chiama nemmeno il server: lo dice
  // e basta, cosi' non c'e' modo di riscrivere per sbaglio quel che c'e' gia'.
  await modale.locator('#bank-commit-btn').click();
  await expect(page.locator('.toast-body')).toContainText('Nessuna riga selezionata');
});
