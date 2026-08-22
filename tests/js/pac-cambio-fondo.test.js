// Cambiare il fondo di un piano gia' avviato.
//
// Qui si toccano le quote, che sono quel che il piano vale: se restano quelle
// del fondo vecchio, il valore mostrato e' di un altro prodotto e nessuno se ne
// accorge, perche' un numero c'e' comunque. Quindi si prova che si rifanno
// tutte, ognuna con il NAV che il fondo nuovo aveva quel giorno.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MY_EXPENSE_DATA_DIR = mkdtempSync(join(tmpdir(), 'my-expense-test-'));

const { migrate } = await import('../../database/migrate.js');
const { databasePath, ensureUser, all, one, run } = await import('../../server/db.js');
const { pacRoutes } = await import('../../server/routes/pac.js');

migrate(databasePath());
const userId = ensureUser();

function chiama(route, body) {
  const raw = JSON.stringify({ ...body, _csrf: 'x' });
  const req = {
    method: 'POST',
    url: `http://localhost${route.split(' ')[1]}`,
    headers: { 'content-type': 'application/json', cookie: 'csrf_token=x', 'x-csrf-token': 'x' },
    async* [Symbol.asyncIterator]() { yield Buffer.from(raw); },
  };
  let payload = null;
  const res = { writeHead() {}, setHeader() {}, end(text) { payload = JSON.parse(text); } };
  return pacRoutes[route](req, res).then(() => payload);
}

// Un conto PAC, due fondi con quotazioni diverse, un piano sul primo fondo e
// due versamenti da 100.
run(`INSERT INTO accounts (user_id, name, type, color, icon, opening_balance, sort_order)
     VALUES (?, 'Conto PAC', 'pac', '#6c757d', NULL, '0.00', 0)`, userId);
const contoId = one('SELECT id FROM accounts WHERE user_id = ?', userId).id;

const fondo = (name) => {
  run(`INSERT INTO pac_funds (user_id, name, currency) VALUES (?, ?, 'EUR')`, userId, name);
  return one('SELECT id FROM pac_funds WHERE user_id = ? AND name = ?', userId, name).id;
};
const vecchio = fondo('Fondo sbagliato');
const nuovo = fondo('Fondo giusto');

const nav = (fundId, date, valore) =>
  run('INSERT INTO pac_fund_navs (fund_id, nav_date, nav) VALUES (?, ?, ?)', fundId, date, valore);
nav(vecchio, '2026-01-05', '10.000000');
nav(vecchio, '2026-02-05', '10.000000');
nav(nuovo, '2026-01-05', '20.000000');
nav(nuovo, '2026-02-05', '25.000000');
// Niente NAV del fondo nuovo prima di gennaio: serve a provare il versamento
// che resta senza quote.
nav(vecchio, '2025-12-05', '10.000000');

run(`INSERT INTO pac_plans (user_id, account_id, fund_id, name, amount, start_date)
     VALUES (?, ?, ?, 'PAC prova', '100.00', '2025-12-01')`, userId, contoId, vecchio);
const planId = one('SELECT id FROM pac_plans WHERE user_id = ?', userId).id;

for (const [d, unita] of [['2025-12-10', 10], ['2026-01-10', 10], ['2026-02-10', 10]]) {
  run(`INSERT INTO pac_contributions (user_id, plan_id, contribution_date, amount, nav, units, source)
       VALUES (?, ?, ?, '100.00', '10.000000', ?, 'manual')`, userId, planId, d, unita.toFixed(6));
}

test('cambiando fondo le quote si rifanno con i NAV del fondo nuovo', async () => {
  const r = await chiama('POST /pac/plans/change-fund', { id: planId, fund_id: nuovo });

  assert.equal(r.data.plan.fund_id, nuovo);
  assert.equal(r.data.total, 3);
  assert.equal(r.data.recalculated, 2, 'il versamento di dicembre non ha un NAV del fondo nuovo');

  const quote = all(
    'SELECT contribution_date, nav, units FROM pac_contributions WHERE plan_id = ? ORDER BY contribution_date',
    planId,
  );
  assert.equal(quote[0].units, null, 'senza NAV meglio nessuna quota di una inventata');
  assert.equal(Number(quote[1].nav), 20);
  assert.equal(Number(quote[1].units), 5);
  assert.equal(Number(quote[2].nav), 25);
  assert.equal(Number(quote[2].units), 4);
});

test('rimettere lo stesso fondo non tocca niente', async () => {
  const r = await chiama('POST /pac/plans/change-fund', { id: planId, fund_id: nuovo });
  assert.equal(r.data.recalculated, 0);
});

// La cartella temporanea resta: su Windows il file del database e' aperto
// finche' il processo vive. Ci pensa il sistema, e' in %TEMP%.
