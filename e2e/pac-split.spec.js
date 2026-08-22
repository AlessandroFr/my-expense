/**
 * Una spesa diventa un versamento diviso fra due piani, e torna indietro.
 *
 * E' il percorso che tocca i soldi da piu' parti: la spesa lascia l'elenco
 * (diventa la faccia in uscita di un trasferimento), il conto PAC riceve
 * l'entrata, ogni piano si prende la sua quota. E disfacendolo la spesa deve
 * tornare **con il suo importo intero**: e' una riga vera dell'estratto conto,
 * non si puo' perdere per strada.
 */
import { test, expect } from '@playwright/test';

const SPESA = 'ADDEBITO PAC AGOSTO';

test('la spesa si divide fra i piani e poi si disfa', async ({ page }) => {
  await page.goto('/expenses');

  const riga = page.locator('#expenses-tbody tr').filter({ hasText: SPESA }).first();
  await expect(riga).toBeVisible();

  await riga.locator('button[data-bs-toggle="dropdown"]').click();
  await riga.locator('[data-action="pac"]').click();

  const modale = page.locator('#pac-split-modal');
  await expect(modale).toBeVisible();
  await expect(modale.locator('#pac-split-amount')).toContainText('500,00');

  // Finche' le quote non fanno l'importo, «Applica» resta spento.
  const applica = modale.locator('#pac-split-apply');
  await expect(applica).toBeDisabled();

  // «Come dicono i piani» riempie con 300 + 200, che fa esattamente 500.
  await modale.locator('#pac-split-fill').click();
  await expect(modale.locator('#pac-split-residual')).toContainText('torna');
  await expect(applica).toBeEnabled();
  await applica.click();

  // Segnata, non e' piu' una spesa: sparisce dall'elenco.
  await expect(modale).toBeHidden();
  await expect(page.locator('#expenses-tbody tr').filter({ hasText: SPESA })).toHaveCount(0);

  // Il piano l'ha ricevuta: 300 versati, e con il NAV a 10 sono 30 quote.
  await page.goto('/pac');
  const pianoMondo = page.locator('#pac-plans-list tr').filter({ hasText: 'PAC Mondo' });
  await expect(pianoMondo).toContainText('300,00');
  await pianoMondo.locator('a').click();

  // Il versamento di agosto: quello di questa spec, non altri che le spec
  // vicine possono aver lasciato sullo stesso piano.
  const agosto = page.locator('#contributions-list tr').filter({ hasText: '2026-08-05' });
  await expect(agosto).toContainText('300,00');
  await expect(agosto).toContainText('30');   // 300 / NAV 10 = 30 quote

  // Il cestino disfa tutta la divisione e ridà la spesa.
  await agosto.locator('[data-action="del-contrib"]').click();
  const conferma = page.locator('.modal.show, dialog[open]').first();
  await conferma.getByRole('button', { name: /togli|elimina/i }).click();
  await expect(page.locator('#contributions-list tr').filter({ hasText: '2026-08-05' })).toHaveCount(0);

  await page.goto('/expenses');
  const tornata = page.locator('#expenses-tbody tr').filter({ hasText: SPESA }).first();
  await expect(tornata).toBeVisible();
  await expect(tornata).toContainText('500,00');
});
