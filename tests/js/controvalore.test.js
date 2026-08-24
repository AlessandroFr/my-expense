// Il controvalore: chi lo riempie, e quando smette di essere vero.
//
// È il pezzo su cui poggia tutto il multivaluta, e sbaglia in silenzio: un
// controvalore vecchio non rompe niente, mette solo un numero credibile e
// falso nei totali. Qui si prova il giro completo — riempimento, scadenza,
// ricalcolo — e soprattutto i casi in cui deve scadere: importo cambiato,
// conto cambiato, valuta del conto cambiata, valuta principale cambiata.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MY_EXPENSE_DATA_DIR = mkdtempSync(join(tmpdir(), 'my-expense-cv-'));

const { migrate } = await import('../../database/migrate.js');
const { apri, db, one, run } = await import('../../server/db.js');
const fx = await import('../../server/fx.js');

apri();
migrate(db());
run("INSERT INTO users (username, password_hash, base_currency) VALUES ('io', '', 'EUR')");
const userId = one('SELECT id FROM users').id;

const conto = (nome, valuta) => {
  run(`INSERT INTO accounts (user_id, name, type, color, opening_balance, currency, sort_order)
       VALUES (?, ?, 'checking', '#6c757d', '0.00', ?, 0)`, userId, nome, valuta);
  return one('SELECT id FROM accounts WHERE name = ?', nome).id;
};
const svizzera = conto('Svizzera', 'CHF');
const italia = conto('Italia', 'EUR');

run("INSERT INTO exchange_rates (user_id, quote, rate_date, rate) VALUES (?, 'CHF', '2025-06-01', 0.96)", userId);

const spesa = (contoId, importo, quota = null) => {
  run(`INSERT INTO expenses (user_id, account_id, amount, share_amount, description, payment_method, expense_date)
       VALUES (?, ?, ?, ?, 'Prova', 'card', '2025-06-15')`, userId, contoId, importo, quota);
  return one('SELECT id FROM expenses ORDER BY id DESC LIMIT 1').id;
};

const leggi = (id) => one('SELECT amount, amount_base, share_amount, share_amount_base FROM expenses WHERE id = ?', id);

test('un movimento in valuta straniera nasce senza controvalore e viene riempito', () => {
  const id = spesa(svizzera, '96.00', '48.00');
  assert.equal(leggi(id).amount_base, null, 'appena scritto non ce l\'ha');

  assert.equal(fx.allinea(userId), 1);

  const riga = leggi(id);
  assert.equal(riga.amount_base, 100, '96 franchi a 0,96 fanno 100 euro');
  assert.equal(riga.share_amount_base, 50, 'anche la quota condivisa');
});

test('un movimento nella valuta principale non ha niente da convertire', () => {
  const id = spesa(italia, '30.00');
  fx.allinea(userId);
  // Resta NULL, e va bene: COALESCE(amount_base, amount) lo legge come 30.
  assert.equal(leggi(id).amount_base, null);
  assert.equal(
    one('SELECT ROUND(SUM(COALESCE(amount_base, amount)), 2) s FROM expenses WHERE user_id = ?', userId).s,
    130, '100 convertiti + 30 che non serviva convertire',
  );
});

test('allinea non ha niente da fare la seconda volta', () => {
  assert.equal(fx.allinea(userId), 0);
});

test('cambiare l\'importo fa scadere il controvalore', () => {
  const id = spesa(svizzera, '96.00');
  fx.allinea(userId);
  assert.equal(leggi(id).amount_base, 100);

  run("UPDATE expenses SET amount = '192.00' WHERE id = ?", id);
  assert.equal(leggi(id).amount_base, null, 'il numero di prima non descrive piu\' niente');

  fx.allinea(userId);
  assert.equal(leggi(id).amount_base, 200);
});

test('spostare il movimento su un conto in un\'altra valuta lo fa scadere', () => {
  const id = spesa(svizzera, '96.00');
  fx.allinea(userId);
  assert.equal(leggi(id).amount_base, 100);

  run('UPDATE expenses SET account_id = ? WHERE id = ?', italia, id);
  assert.equal(leggi(id).amount_base, null);

  fx.allinea(userId);
  // Adesso il conto e' in euro: non c'e' niente da convertire, e 96 sono 96.
  assert.equal(leggi(id).amount_base, null);
});

test('cambiare la valuta di un conto rifa\' il conto a tutti i suoi movimenti', () => {
  const id = spesa(svizzera, '96.00');
  fx.allinea(userId);
  assert.equal(leggi(id).amount_base, 100);

  run("INSERT INTO exchange_rates (user_id, quote, rate_date, rate) VALUES (?, 'USD', '2025-06-01', 1.2)", userId);
  run("UPDATE accounts SET currency = 'USD' WHERE id = ?", svizzera);

  assert.equal(leggi(id).amount_base, null, 'tutti i movimenti di quel conto sono scaduti');
  fx.allinea(userId);
  assert.equal(leggi(id).amount_base, 80, '96 dollari a 1,2 fanno 80 euro');

  run("UPDATE accounts SET currency = 'CHF' WHERE id = ?", svizzera);
  fx.allinea(userId);
});

test('cambiare la valuta principale li rifa\' tutti', () => {
  const primaDi = one(
    'SELECT count(*) n FROM expenses WHERE user_id = ? AND amount_base IS NOT NULL', userId,
  ).n;
  assert.ok(primaDi > 0);

  run("UPDATE users SET base_currency = 'CHF' WHERE id = ?", userId);
  assert.equal(
    one('SELECT count(*) n FROM expenses WHERE user_id = ? AND amount_base IS NOT NULL', userId).n, 0,
    'in franchi nessuno dei controvalori di prima vale piu\'',
  );

  fx.allinea(userId);
  // Ora i conti in euro sono quelli da convertire, e quelli in franchi no.
  assert.equal(
    one(`SELECT amount_base FROM expenses WHERE account_id = ? ORDER BY id LIMIT 1`, italia).amount_base,
    28.8, '30 euro a 0,96 fanno 28,80 franchi',
  );
  run("UPDATE users SET base_currency = 'EUR' WHERE id = ?", userId);
  fx.allinea(userId);
});

test('senza il cambio il movimento resta scoperto, e lo si viene a sapere', () => {
  const sterline = conto('Londra', 'GBP');
  spesa(sterline, '50.00');

  fx.allinea(userId);   // non deve lanciare: chi salvava una spesa non c'entra

  assert.deepEqual(fx.senzaControvalore(userId), [{ valuta: 'GBP', movimenti: 1 }]);

  run("INSERT INTO exchange_rates (user_id, quote, rate_date, rate) VALUES (?, 'GBP', '2025-06-01', 0.85)", userId);
  assert.equal(fx.allinea(userId), 1);
  assert.deepEqual(fx.senzaControvalore(userId), []);
});
