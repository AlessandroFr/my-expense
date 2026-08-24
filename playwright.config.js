import { defineConfig, devices } from '@playwright/test';

/**
 * E2E su un database usa-e-getta.
 *
 * `MY_EXPENSE_DATA_DIR` punta a `e2e/.tmp`, che il seed ricrea da zero a ogni
 * giro: i test scrivono spese e versamenti veri, e non devono nemmeno sfiorare
 * i dati di sviluppo in `data/`. La porta 4599 non e' quella di `npm start`
 * (che sceglie una porta libera), quindi le due cose possono girare insieme.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,          // un database solo: i test si darebbero fastidio
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:4599',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },

  // Il database dei test nasce chiuso, come quello vero: `sblocca.setup.js` lo
  // apre una volta sola e tutto il resto viene dopo.
  projects: [
    { name: 'sblocco', testMatch: /sblocca\.setup\.js/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['sblocco'],
      testIgnore: /sblocca\.setup\.js/,
    },
  ],

  webServer: {
    command: 'node e2e/server.js',
    url: 'http://127.0.0.1:4599/sblocca',
    // Sempre un server nuovo: il seme del database sta nel suo avvio.
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
