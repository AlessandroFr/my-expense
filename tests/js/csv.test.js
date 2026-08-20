// Lettura dei CSV: sono file scritti da altri programmi, quindi arrivano nei
// formati piu' vari. Le regole devono coincidere con quelle di CsvService.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDelimiter, parseAmount, parseDate, parsePayment, splitCsvLine } from '../../server/routes/csv.js';

test('le date si accettano in tre formati e escono sempre ISO', () => {
  assert.equal(parseDate('2026-08-20'), '2026-08-20');
  assert.equal(parseDate('20/08/2026'), '2026-08-20');
  assert.equal(parseDate('20-08-2026'), '2026-08-20');
  assert.equal(parseDate('5/3/2026'), '2026-03-05');
});

test('una data illeggibile e\' un errore, non una data a caso', () => {
  assert.throws(() => parseDate(''), /mancante/);
  assert.throws(() => parseDate('ieri'), /non valida/);
  assert.throws(() => parseDate('2026/08/20'), /non valida/);
});

test('gli importi arrivano all\'italiana o all\'inglese', () => {
  assert.equal(parseAmount('1.234,56'), '1234.56');
  assert.equal(parseAmount('1234.56'), '1234.56');
  assert.equal(parseAmount('12,50'), '12.50');
  assert.equal(parseAmount('€ 12,50'), '12.50');
  assert.equal(parseAmount('12.50 EUR'), '12.50');
});

test('un importo non numerico e\' un errore', () => {
  assert.throws(() => parseAmount(''), /mancante/);
  assert.throws(() => parseAmount('tanto'), /non valido/);
});

test('il metodo di pagamento accetta le etichette italiane', () => {
  assert.equal(parsePayment('contanti'), 'cash');
  assert.equal(parsePayment('Carta'), 'card');
  assert.equal(parsePayment('bonifico'), 'transfer');
  assert.equal(parsePayment('card'), 'card');
  assert.equal(parsePayment(''), 'card');
  assert.throws(() => parsePayment('assegno'), /non riconosciuto/);
});

test('il separatore si deduce dalla prima riga', () => {
  assert.equal(detectDelimiter('Data;Importo\n2026-01-01;10'), ';');
  assert.equal(detectDelimiter('Data,Importo\n2026-01-01,10'), ',');
  assert.equal(detectDelimiter('Data\tImporto'), '\t');
  assert.equal(detectDelimiter('SoloUnaColonna'), ';');
});

test('le virgolette proteggono i separatori dentro un campo', () => {
  assert.deepEqual(splitCsvLine('a;b;c', ';'), ['a', 'b', 'c']);
  assert.deepEqual(splitCsvLine('a;"b;c";d', ';'), ['a', 'b;c', 'd']);
  assert.deepEqual(splitCsvLine('"con ""virgolette""";x', ';'), ['con "virgolette"', 'x']);
  assert.deepEqual(splitCsvLine('a;;c', ';'), ['a', '', 'c']);
});
