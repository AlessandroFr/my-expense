// Cifrare un database che esiste già, con dentro dei dati veri.
//
// È il passaggio che fa più paura di tutto il lavoro: gira una volta sola, sul
// database di una persona che ha anni di spese dentro, e se va storto a metà
// non c'è un secondo tentativo. Quindi si prova che i dati ci siano ancora
// dopo, che la copia di sicurezza venga fatta prima, e che il file sul disco
// smetta davvero di essere leggibile — non che «la funzione non lancia».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MY_EXPENSE_DATA_DIR = mkdtempSync(join(tmpdir(), 'my-expense-cifra-'));
process.env.MY_EXPENSE_SCRYPT_N = String(2 ** 14);

const { migrate } = await import('../../database/migrate.js');
const { apri, chiudi, databasePath, db, one, run } = await import('../../server/db.js');
const lock = await import('../../server/lock.js');

const file = databasePath();
const inChiaro = () => readFileSync(file).subarray(0, 15).toString('latin1') === 'SQLite format 3';

// ── Un database come quello di prima: in chiaro, con dentro qualcosa ─────────
apri();
migrate(db());
run("INSERT INTO users (username, password_hash) VALUES ('io', '')");
const userId = one('SELECT id FROM users').id;
run(`INSERT INTO accounts (user_id, name, type, color, opening_balance, sort_order)
     VALUES (?, 'Conto', 'checking', '#6c757d', '2000.00', 0)`, userId);
const contoId = one('SELECT id FROM accounts').id;
for (let i = 1; i <= 25; i += 1) {
  run(`INSERT INTO expenses (user_id, account_id, amount, description, payment_method, expense_date)
       VALUES (?, ?, ?, ?, 'card', '2026-03-01')`, userId, contoId, `${i}.50`, `Spesa numero ${i}`);
}
const sommaPrima = one('SELECT ROUND(SUM(amount), 2) s FROM expenses').s;
chiudi();

test('prima di cifrare il database si legge come un file qualunque', () => {
  assert.equal(inChiaro(), true);
  assert.equal(lock.stato(), 'da-proteggere');
});

test('dopo la cifratura i dati ci sono tutti e il file non si legge più', () => {
  const chiaveRecupero = lock.cifraEsistente('la-mia-password-nuova');

  assert.match(chiaveRecupero, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/);
  assert.equal(inChiaro(), false, 'il file sul disco deve essere illeggibile');
  assert.equal(lock.stato(), 'aperto');

  assert.equal(one('SELECT count(*) n FROM expenses').n, 25);
  assert.equal(one('SELECT ROUND(SUM(amount), 2) s FROM expenses').s, sommaPrima);
  assert.equal(one('SELECT username FROM users').username, 'io');
});

test('la copia di prima resta sul disco, e resta leggibile', () => {
  const copia = lock.copiaInChiaro();
  assert.ok(copia, 'la copia di sicurezza deve esistere');
  assert.equal(existsSync(copia), true);
  assert.equal(
    readFileSync(copia).subarray(0, 15).toString('latin1'), 'SQLite format 3',
    'la copia serve proprio a essere apribile se la cifratura fosse andata male',
  );
});

test('richiuso, si riapre solo con la password giusta', () => {
  const dati = one('SELECT count(*) n FROM expenses');
  lock.blocca();
  assert.equal(lock.stato(), 'chiuso');

  assert.equal(lock.sblocca('un-altra-password'), null);
  assert.equal(lock.sblocca('la-mia-password-nuova'), 'password');
  assert.deepEqual(one('SELECT count(*) n FROM expenses'), dati);
});

test('cifrare due volte non si può', () => {
  assert.throws(() => lock.cifraEsistente('qualsiasi'), /gia' protetto/);
});
