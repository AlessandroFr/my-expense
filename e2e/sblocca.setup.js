// Apre il database prima di tutto il resto.
//
// Il lucchetto vive nel processo del server, non nel browser: sbloccato una
// volta, resta aperto per tutte le spec che seguono. Per questo sta in un
// progetto «setup» da cui le altre dipendono, invece che in un beforeEach.
//
// Fa anche da prova vera dello sblocco: se la schermata smette di funzionare,
// qui non parte più niente e si vede subito.

import { expect, test } from '@playwright/test';
import { PASSWORD_TEST } from './seed.js';

test('si apre con la password, non con una sbagliata', async ({ page }) => {
    // Qualunque pagina rimanda allo sblocco finché il database è chiuso.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sblocca$/);

    await page.fill('#password', 'questa-non-e-quella-giusta');
    await page.click('#btn-sblocca');
    await expect(page.locator('#errore')).toBeVisible();
    await expect(page).toHaveURL(/\/sblocca$/);

    // Da qui in poi non ci si aspetta più niente di rosso: il 401 del
    // tentativo sbagliato è voluto, quello che segue no.
    const errori = [];
    page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });

    await page.fill('#password', PASSWORD_TEST);
    await page.click('#btn-sblocca');
    await expect(page).toHaveURL(/\/dashboard$/);

    expect(errori).toEqual([]);
});
