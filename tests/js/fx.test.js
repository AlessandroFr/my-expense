// I cambi e il controvalore.
//
// Qui si sbaglia in un modo solo, ma è quello che conta: un cambio preso alla
// data sbagliata, o una divisione al posto di una moltiplicazione, non fa
// crashare niente — fa solo comparire un numero credibile e falso. Quindi si
// controllano i numeri, non che la funzione risponda.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MY_EXPENSE_DATA_DIR = mkdtempSync(join(tmpdir(), 'my-expense-fx-'));

const { migrate } = await import('../../database/migrate.js');
const { apri, db, one, run } = await import('../../server/db.js');
const fx = await import('../../server/fx.js');

apri();
migrate(db());
run("INSERT INTO users (username, password_hash, base_currency) VALUES ('io', '', 'EUR')");
const userId = one('SELECT id FROM users').id;

const cambio = (quote, data, rate) => run(
  'INSERT INTO exchange_rates (user_id, quote, rate_date, rate) VALUES (?, ?, ?, ?)',
  userId, quote, data, rate,
);

// Franchi per un euro, in tre giorni diversi.
cambio('CHF', '2025-01-10', 0.94);
cambio('CHF', '2025-06-15', 0.96);
cambio('CHF', '2025-12-31', 0.93);
// Dollari per un euro.
cambio('USD', '2025-06-15', 1.08);

test('il cambio è quello del giorno, se c\'è', () => {
  assert.equal(fx.rateOn(userId, 'CHF', '2025-06-15').rate, 0.96);
});

test('se quel giorno non c\'è, vale l\'ultimo noto prima', () => {
  // Il 20 giugno il cambio del 15 è l'ultimo che si conosceva.
  const r = fx.rateOn(userId, 'CHF', '2025-06-20');
  assert.equal(r.rate, 0.96);
  assert.equal(r.rate_date, '2025-06-15');

  assert.equal(fx.rateOn(userId, 'CHF', '2025-12-30').rate, 0.96);
  assert.equal(fx.rateOn(userId, 'CHF', '2026-03-01').rate, 0.93, 'oltre l\'ultimo, resta l\'ultimo');
});

test('per un movimento più vecchio di ogni cambio si usa il primo che c\'è', () => {
  // Approssimato, sì, ma con la sua data scritta accanto: meglio di un buco.
  const r = fx.rateOn(userId, 'CHF', '2024-01-01');
  assert.equal(r.rate, 0.94);
  assert.equal(r.rate_date, '2025-01-10');
});

test('una valuta senza cambi non esiste, e non se ne inventa uno', () => {
  assert.equal(fx.rateOn(userId, 'GBP', '2025-06-15'), null);
});

test('l\'euro è il perno e vale sempre uno', () => {
  assert.equal(fx.rateOn(userId, 'EUR', '2025-06-15').rate, 1);
});

test('convertire verso il perno divide, non moltiplica', () => {
  // 96 franchi al cambio 0,96 franchi per euro fanno 100 euro. Moltiplicando
  // ne farebbero 92,16: un numero credibile e sbagliato.
  assert.equal(fx.convert(userId, 96, 'CHF', 'EUR', '2025-06-15').amount, 100);
  assert.equal(fx.convert(userId, 100, 'EUR', 'CHF', '2025-06-15').amount, 96);
});

test('fra due valute che non sono il perno si triangola', () => {
  // 96 CHF = 100 EUR = 108 USD.
  assert.equal(fx.convert(userId, 96, 'CHF', 'USD', '2025-06-15').amount, 108);
  assert.equal(fx.convert(userId, 108, 'USD', 'CHF', '2025-06-15').amount, 96);
});

test('la stessa valuta non passa da nessun cambio', () => {
  const r = fx.convert(userId, 42.555, 'GBP', 'GBP', '2025-06-15');
  assert.equal(r.amount, 42.56, 'arrotondato come tutto il resto');
  assert.equal(r.rate, 1);
});

test('senza cambio si sbaglia rumorosamente, non in silenzio', () => {
  assert.throws(
    () => fx.convert(userId, 10, 'GBP', 'EUR', '2025-06-15'),
    /nessun cambio per GBP/,
  );
});

test('la data riportata è la più vecchia delle due, non la più comoda', () => {
  // Chi legge deve sapere quanto è vecchia la conversione: la parte più
  // stantia è quella che la data deve raccontare.
  cambio('SEK', '2025-01-05', 11.2);
  const r = fx.convert(userId, 100, 'SEK', 'USD', '2025-06-15');
  assert.equal(r.rate_date, '2025-01-05');
});

test('toBase non tocca niente quando la valuta è già quella principale', () => {
  assert.equal(fx.toBase(userId, 84.305, 'EUR', '2025-06-15'), 84.31);
  assert.equal(fx.toBase(userId, 96, 'CHF', '2025-06-15'), 100);
});

test('una quota che non c\'è resta senza controvalore', () => {
  assert.equal(fx.toBaseNullable(userId, null, 'CHF', '2025-06-15'), null);
  assert.equal(fx.toBaseNullable(userId, '', 'CHF', '2025-06-15'), null);
  assert.equal(fx.toBaseNullable(userId, 48, 'CHF', '2025-06-15'), 50);
});

test('con la valuta principale diversa dall\'euro cambia tutto, coerentemente', () => {
  run("UPDATE users SET base_currency = 'CHF' WHERE id = ?", userId);
  assert.equal(fx.valutaPrincipale(userId), 'CHF');
  // 100 euro valgono 96 franchi, e i franchi valgono se stessi.
  assert.equal(fx.toBase(userId, 100, 'EUR', '2025-06-15'), 96);
  assert.equal(fx.toBase(userId, 96, 'CHF', '2025-06-15'), 96);
  run("UPDATE users SET base_currency = 'EUR' WHERE id = ?", userId);
});

test('le valute in uso sono quella principale e quelle dei conti', () => {
  run(`INSERT INTO accounts (user_id, name, type, color, opening_balance, currency, sort_order)
       VALUES (?, 'Svizzera', 'checking', '#6c757d', '0.00', 'CHF', 0)`, userId);
  run(`INSERT INTO accounts (user_id, name, type, color, opening_balance, currency, sort_order)
       VALUES (?, 'Casa', 'cash', '#6c757d', '0.00', 'EUR', 0)`, userId);

  assert.deepEqual(fx.valuteInUso(userId), ['CHF', 'EUR']);
});
