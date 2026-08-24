// Marcare una spesa dell'estratto come acquisto di titoli.
//
// Qui i soldi devono uscire una volta sola: l'acquisto e' gia' sul conto, e
// registrarlo anche fra gli investimenti non deve creare una seconda uscita.
// Si prova che il movimento resta com'era ma smette di contare come spesa, che
// il prezzo per quota viene dall'importo meno le commissioni, e che disfare
// riporta la spesa in elenco invece di cancellarla.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MY_EXPENSE_DATA_DIR = mkdtempSync(join(tmpdir(), 'my-expense-test-'));

const { migrate } = await import('../../database/migrate.js');
const { apri, db, ensureUser, one, run } = await import('../../server/db.js');
const { setExpenseTrade, tradeOfExpense, holdingsForUser,
        insertDownloadedPrice } = await import('../../server/routes/securities.js');
const { withBalances } = await import('../../server/routes/accounts.js');

// Senza chiave: il database di un test e' usa e getta, cifrarlo costerebbe
// solo il tempo di scrypt e non proteggerebbe niente.
apri();
migrate(db());
const userId = ensureUser();

const conto = (name, type) => {
  run(`INSERT INTO accounts (user_id, name, type, color, icon, opening_balance, sort_order)
       VALUES (?, ?, ?, '#6c757d', NULL, '0.00', 0)`, userId, name, type);
  return one('SELECT id FROM accounts WHERE user_id = ? AND name = ?', userId, name).id;
};
const banca = conto('Banca', 'checking');
const dossier = conto('Titoli', 'deposit');

run(`INSERT INTO securities_instruments (user_id, account_id, name, currency)
     VALUES (?, ?, 'ETF Core SP500', 'EUR')`, userId, dossier);
const strumento = one('SELECT id FROM securities_instruments WHERE user_id = ?', userId).id;

// La riga vera dell'estratto: 1.894,00 usciti dalla banca il 2 gennaio.
run(`INSERT INTO expenses (user_id, account_id, amount, description, payment_method, expense_date)
     VALUES (?, ?, '1894.00', 'ACQUISTO TITOLI PER CONTANTI', 'transfer', '2026-01-02')`, userId, banca);
const spesa = one('SELECT id FROM expenses WHERE user_id = ?', userId).id;

const saldi = (id) => withBalances(userId, true).find((a) => a.id === id);

test('la spesa diventa un acquisto e smette di contare come spesa', () => {
  const id = setExpenseTrade(userId, spesa, { instrument_id: strumento, quantity: '3', fee: '4,00' });
  assert.ok(id > 0);

  const riga = one('SELECT amount, is_transfer, transfer_id FROM expenses WHERE id = ?', spesa);
  assert.equal(Number(riga.amount), 1894, "l'importo del movimento non si tocca");
  assert.equal(riga.is_transfer, 1);
  assert.ok(riga.transfer_id > 0);

  // 1894 - 4 di commissioni = 1890 di titoli, cioe' 630 a quota.
  const op = one('SELECT quantity, price, fee, gross_amount, net_amount FROM securities_transactions WHERE id = ?', id);
  assert.equal(Number(op.quantity), 3);
  assert.equal(Number(op.price), 630);
  assert.equal(Number(op.fee), 4);
  assert.equal(Number(op.gross_amount), 1890);
  assert.equal(Number(op.net_amount), 1894);

  // I soldi sono usciti una volta sola: fuori dalla banca, dentro il dossier.
  assert.equal(saldi(banca).balance, -1894);
  assert.equal(saldi(dossier).balance, 1894);
  assert.equal(saldi(banca).expenses_total, 0, 'comprare titoli non e\' spendere');

  const pos = holdingsForUser(userId).find((h) => h.instrument_id === strumento);
  assert.equal(pos.qty, 3);
});

test('rifare la marcatura non raddoppia niente', () => {
  setExpenseTrade(userId, spesa, { instrument_id: strumento, quantity: '2', fee: '0' });
  assert.equal(one('SELECT COUNT(*) AS n FROM securities_transactions WHERE user_id = ?', userId).n, 1);
  assert.equal(one('SELECT COUNT(*) AS n FROM transfers WHERE user_id = ?', userId).n, 1);
  assert.equal(Number(tradeOfExpense(userId, spesa).price), 947);
  assert.equal(saldi(banca).balance, -1894);
});

test('disfare riporta la spesa in elenco, non la cancella', () => {
  setExpenseTrade(userId, spesa, { quantity: '0' });

  const riga = one('SELECT amount, is_transfer, transfer_id FROM expenses WHERE id = ?', spesa);
  assert.equal(Number(riga.amount), 1894, 'la riga dell\'estratto resta: e\' successa davvero');
  assert.equal(riga.is_transfer, 0);
  assert.equal(riga.transfer_id, null);
  assert.equal(tradeOfExpense(userId, spesa), null);
  assert.equal(one('SELECT COUNT(*) AS n FROM transfers WHERE user_id = ?', userId).n, 0);
  assert.equal(saldi(banca).expenses_total, 1894, 'torna a essere una spesa');
});

test('il prezzo scaricato non copre quello scritto a mano', () => {
  // `source` ha un CHECK nello schema: se la parola non e' fra quelle previste
  // l'inserimento fallisce, e lo scarico si romperebbe solo in produzione.
  assert.equal(insertDownloadedPrice(strumento, '2026-02-02', 640), 1);
  assert.equal(Number(one("SELECT price FROM securities_prices WHERE price_date = '2026-02-02'").price), 640);

  run(`INSERT INTO securities_prices (instrument_id, price_date, price, source)
       VALUES (?, '2026-03-03', '700.000000', 'manual')`, strumento);
  assert.equal(insertDownloadedPrice(strumento, '2026-03-03', 650), 0);
  assert.equal(Number(one("SELECT price FROM securities_prices WHERE price_date = '2026-03-03'").price), 700);
});

// La cartella temporanea resta: su Windows il file del database e' aperto
// finche' il processo vive. Ci pensa il sistema, e' in %TEMP%.
