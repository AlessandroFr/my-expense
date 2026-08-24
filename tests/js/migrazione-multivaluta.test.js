// La migration del multivaluta, provata su un database della versione di prima.
//
// Serve perché su un database *nuovo* le migration non vengono eseguite: lo
// schema è già aggiornato e vengono solo registrate. Quindi il codice SQL di
// `0005-multivaluta.sql` girerebbe soltanto sulle installazioni che esistono
// già — cioè esattamente lì dove non si può sbagliare, e da nessuna parte
// mentre lo si scrive.
//
// Qui il database della versione precedente si costruisce a ritroso: si parte
// da quello nuovo e gli si tolgono le colonne che la migration aggiunge.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MY_EXPENSE_DATA_DIR = mkdtempSync(join(tmpdir(), 'my-expense-mv-'));

const { migrate } = await import('../../database/migrate.js');
const { apri, db, one, run } = await import('../../server/db.js');

const MIGRATIONS = ['0005-multivaluta.sql', '0006-controvalore-scaduto.sql'];

apri();
migrate(db());

// ── Indietro nel tempo: com'era prima della migration ───────────────────────
// I trigger di 0006 parlano di colonne che qui stiamo per togliere: vanno via
// prima loro, o SQLite si rifiuta di lasciar cadere la colonna.
for (const t of [
  'tr_expenses_base_scaduto', 'tr_incomes_base_scaduto', 'tr_transfers_base_scaduto',
  'tr_recurring_base_scaduto', 'tr_accounts_valuta_cambiata', 'tr_users_valuta_principale_cambiata',
]) db().exec(`DROP TRIGGER IF EXISTS \`${t}\``);

for (const [tabella, colonna] of [
  ['users', 'base_currency'], ['accounts', 'currency'],
  ['expenses', 'amount_base'], ['expenses', 'share_amount_base'],
  ['incomes', 'amount_base'],
  ['transfers', 'amount_base'], ['transfers', 'destination_amount'],
  ['recurring_expenses', 'amount_base'],
]) {
  db().exec(`ALTER TABLE \`${tabella}\` DROP COLUMN \`${colonna}\``);
}
db().exec('DROP TABLE `exchange_rates`');
for (const m of MIGRATIONS) run('DELETE FROM schema_migrations WHERE name = ?', m);

// ── I dati che quella versione aveva ────────────────────────────────────────
run("INSERT INTO users (username, password_hash) VALUES ('io', '')");
const userId = one('SELECT id FROM users').id;
run(`INSERT INTO accounts (user_id, name, type, color, opening_balance, sort_order)
     VALUES (?, 'Conto', 'checking', '#6c757d', '0.00', 0)`, userId);
const conto = one('SELECT id FROM accounts').id;

run(`INSERT INTO expenses (user_id, account_id, amount, share_amount, description, payment_method, expense_date)
     VALUES (?, ?, '84.30', '42.15', 'Cena divisa', 'card', '2025-06-10')`, userId, conto);
run(`INSERT INTO expenses (user_id, account_id, amount, description, payment_method, expense_date)
     VALUES (?, ?, '19.99', 'Spesa senza quota', 'card', '2025-06-11')`, userId, conto);
run(`INSERT INTO incomes (user_id, account_id, amount, source, payment_method, income_date)
     VALUES (?, ?, '1500.00', 'Stipendio', 'transfer', '2025-06-01')`, userId, conto);
run(`INSERT INTO transfers (user_id, source_account_id, destination_account_id, amount, transfer_date)
     VALUES (?, ?, ?, '250.00', '2025-06-05')`, userId, conto, conto);
run(`INSERT INTO recurring_expenses (user_id, account_id, amount, description, payment_method, frequency, start_date)
     VALUES (?, ?, '9.99', 'Abbonamento', 'card', 'monthly', '2025-01-01')`, userId, conto);

// ── E adesso l'aggiornamento ────────────────────────────────────────────────
const applicate = migrate(db());

test('la migration gira, e gira una volta sola', () => {
  assert.deepEqual(applicate, MIGRATIONS);
  assert.deepEqual(migrate(db()), [], 'rieseguirla non deve fare niente');
});

test('chi aveva già dei movimenti se li ritrova con il controvalore giusto', () => {
  // Tutto quello che c'è oggi è in euro, e la valuta principale è l'euro:
  // il controvalore è l'importo. Se questa riga sbagliasse, ogni report di
  // chi aggiorna si azzererebbe senza dire niente.
  for (const tabella of ['expenses', 'incomes', 'transfers', 'recurring_expenses']) {
    const storte = one(
      `SELECT count(*) n FROM \`${tabella}\` WHERE amount_base IS NULL OR amount_base <> amount`,
    ).n;
    assert.equal(storte, 0, `${tabella}: ci sono righe senza controvalore`);
  }
});

test('la quota condivisa segue l\'importo, e il vuoto resta vuoto', () => {
  const divisa = one("SELECT share_amount, share_amount_base FROM expenses WHERE description = 'Cena divisa'");
  assert.equal(divisa.share_amount_base, divisa.share_amount);

  const intera = one("SELECT share_amount_base FROM expenses WHERE description = 'Spesa senza quota'");
  assert.equal(intera.share_amount_base, null, 'senza quota non se ne inventa una');
});

test('le valute nascono in euro per tutti', () => {
  assert.equal(one('SELECT base_currency FROM users').base_currency, 'EUR');
  assert.equal(one('SELECT currency FROM accounts').currency, 'EUR');
});

test('i trasferimenti hanno il posto per il secondo importo, ancora vuoto', () => {
  // Vuoto vuol dire «stessa valuta da tutte e due le parti»: l'importo è uno.
  assert.equal(one('SELECT destination_amount FROM transfers').destination_amount, null);
});

test('la tabella dei cambi c\'è e accetta un cambio solo per giorno', () => {
  run("INSERT INTO exchange_rates (user_id, quote, rate_date, rate) VALUES (?, 'CHF', '2025-06-10', 0.96)", userId);
  assert.throws(
    () => run("INSERT INTO exchange_rates (user_id, quote, rate_date, rate) VALUES (?, 'CHF', '2025-06-10', 0.97)", userId),
    /UNIQUE/,
    'due cambi diversi per lo stesso giorno renderebbero i totali indecidibili',
  );
  assert.throws(
    () => run("INSERT INTO exchange_rates (user_id, quote, rate_date, rate, source) VALUES (?, 'CHF', '2025-06-11', 1, 'inventata')", userId),
    /CHECK/,
  );
});
