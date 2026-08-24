// La riconciliazione tocca il saldo di un conto: se sbaglia, sbagliano tutti i
// numeri che l'utente guarda. Qui si prova quel che e' andato storto davvero —
// una rettifica da qualche migliaio di euro che si presentava nel mese come
// spesa vera — e la sua conseguenza: il saldo la deve contare, i totali della
// scheda del conto no.
//
// E' l'unico test che apre un database: la logica sta nella query, non in una
// funzione pura, e provarla altrove vorrebbe dire riscriverla.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MY_EXPENSE_DATA_DIR = mkdtempSync(join(tmpdir(), 'my-expense-test-'));

const { migrate } = await import('../../database/migrate.js');
const { apri, db, ensureUser, one, run } = await import('../../server/db.js');
const { withBalances } = await import('../../server/routes/accounts.js');
const { reconciliationRoutes } = await import('../../server/routes/reconciliations.js');

// Senza chiave: il database di un test e' usa e getta, cifrarlo costerebbe
// solo il tempo di scrypt e non proteggerebbe niente.
apri();
migrate(db());
const userId = ensureUser();

/** Una richiesta finta: al server servono solo il corpo e il token CSRF. */
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
  return reconciliationRoutes[route](req, res).then(() => payload);
}

const contoId = (name) => {
  run(`INSERT INTO accounts (user_id, name, type, color, icon, opening_balance, sort_order)
       VALUES (?, ?, 'cash', '#6c757d', NULL, '0.00', 0)`, userId, name);
  return one('SELECT id FROM accounts WHERE user_id = ? AND name = ?', userId, name).id;
};
const saldi = (id) => withBalances(userId, true).find((a) => a.id === id);

test('la rettifica sistema il saldo ma non conta come spesa', async () => {
  const id = contoId('Contanti');
  // 500 entrati, 120 spesi davvero, 80 girati su un altro conto: il conto
  // dovrebbe avere 300, ma in tasca ce ne sono 250.
  run(`INSERT INTO incomes (user_id, account_id, source, description, amount, income_date)
       VALUES (?, ?, 'Stipendio', 'paga', '500.00', '2026-01-10')`, userId, id);
  run(`INSERT INTO expenses (user_id, account_id, amount, description, payment_method, expense_date)
       VALUES (?, ?, '120.00', 'spesa vera', 'cash', '2026-01-11')`, userId, id);
  run(`INSERT INTO expenses (user_id, account_id, amount, description, payment_method, expense_date, is_transfer)
       VALUES (?, ?, '80.00', 'giroconto', 'transfer', '2026-01-12', 1)`, userId, id);

  assert.equal(saldi(id).balance, 300);

  const r = await chiama('POST /accounts/reconcile', {
    account_id: id, declared_balance: '250,00', reconciled_at: '2026-01-31',
  });
  assert.equal(r.data.reconciliation.difference, -50);
  assert.equal(r.data.new_balance, 250);

  const dopo = saldi(id);
  assert.equal(dopo.balance, 250, 'il saldo conta la rettifica');
  assert.equal(dopo.expenses_total, 120, 'i totali mostrati contano solo la spesa vera');
  assert.equal(dopo.incomes_total, 500);

  // La stessa marcatura dei giroconti: e' quella che la tiene fuori da report,
  // budget ed elenco movimenti, che filtrano tutti is_transfer = 0.
  const rettifica = one(
    'SELECT is_transfer FROM expenses WHERE id = ?', r.data.reconciliation.adjustment_expense_id,
  );
  assert.equal(rettifica.is_transfer, 1);
});

test('cancellare la verifica riporta il saldo com\'era', async () => {
  const id = contoId('Portafoglio');
  run(`INSERT INTO incomes (user_id, account_id, source, description, amount, income_date)
       VALUES (?, ?, 'Regalo', 'regalo', '100.00', '2026-02-01')`, userId, id);

  const r = await chiama('POST /accounts/reconcile', {
    account_id: id, declared_balance: '90,00', reconciled_at: '2026-02-28',
  });
  const spesaId = r.data.reconciliation.adjustment_expense_id;
  assert.equal(saldi(id).balance, 90);

  await chiama('POST /accounts/reconciliation/delete', { id: r.data.reconciliation.id });
  assert.equal(saldi(id).balance, 100, 'via la verifica, via il movimento che la reggeva');
  assert.equal(one('SELECT id FROM expenses WHERE id = ?', spesaId), null);
});

// La cartella temporanea non si cancella: su Windows il file del database
// resta aperto finche' il processo vive, e la pulizia fallirebbe. Ci pensa il
// sistema, e' in %TEMP%.
