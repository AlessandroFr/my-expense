// Un conto in un'altra valuta, dall'inizio alla fine.
//
// Il multivaluta sbaglia in un modo solo, ma è quello che conta: non rompe
// niente, mette solo un numero credibile e falso nei totali. Quindi la prova
// guarda i numeri, e li guarda dove li guarda una persona — sulla pagina.

import { expect, test } from '@playwright/test';

const CAMBIO = '0,96';   // franchi per un euro: 96 CHF fanno 100 EUR

test('un conto in franchi entra nei totali convertito in euro', async ({ page }) => {
    const errori = [];
    page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });

    // ── Il conto in valuta ──────────────────────────────────────────────────
    await page.goto('/accounts');
    const nuovo = page.locator('#account-create-form');
    await nuovo.locator('input[name="name"]').fill('Conto svizzero');
    await nuovo.locator('select[name="type"]').selectOption('checking');
    await nuovo.locator('input[name="currency"]').fill('CHF');
    await nuovo.locator('input[name="opening_balance"]').fill('0');
    await nuovo.locator('button[type="submit"]').click();

    // Il saldo del conto resta in franchi: quello è il suo, e convertirlo
    // renderebbe impossibile confrontarlo con l'estratto della banca.
    const scheda = page.locator('.card', { hasText: 'Conto svizzero' }).first();
    await expect(scheda).toContainText('CHF');

    // ── Il cambio ───────────────────────────────────────────────────────────
    await page.goto('/cambi');
    await expect(page.locator('#zona-cambi')).toBeVisible();
    await page.fill('#c-valuta', 'CHF');
    await page.fill('#c-rate', CAMBIO);
    await page.click('#form-cambio button[type="submit"]');
    await expect(page.locator('#righe-cambi')).toContainText('CHF');

    // ── La spesa in franchi ─────────────────────────────────────────────────
    await page.goto('/expenses');
    const spesa = page.locator('#expense-create-form');
    await spesa.locator('input[name="amount"]').fill('96');
    await spesa.locator('select[name="account_id"]').selectOption({ label: 'Conto svizzero' });
    await spesa.locator('button[type="submit"]').click();
    await expect(page.locator('#expenses-tbody')).toContainText('Conto svizzero', { timeout: 10000 });

    // ── Il controvalore ─────────────────────────────────────────────────────
    // 96 franchi a 0,96 fanno 100 euro. Se ne risultassero 96, la conversione
    // non sta girando; se ne risultassero 92,16, sta moltiplicando invece di
    // dividere — che è l'errore che non si vede a occhio.
    const risposta = await page.request.get('/expenses/list?limit=200');
    const spese = (await risposta.json()).data.expenses;
    const nostra = spese.find((e) => Number(e.amount) === 96);
    expect(nostra, 'la spesa in franchi dev\'essere in elenco').toBeTruthy();
    expect(Number(nostra.amount_base)).toBe(100);

    // ── E nessuno resta scoperto ────────────────────────────────────────────
    await page.goto('/cambi');
    await expect(page.locator('#scoperti')).toBeHidden();

    expect(errori).toEqual([]);
});
