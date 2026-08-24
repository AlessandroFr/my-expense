// L'arrotondamento deve comportarsi come round() di PHP: finche' i due backend
// convivono, uno scarto di un centesimo si vede a schermo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountItaliano, parseAmountLikePhp, roundLikePhp } from '../../server/amount.js';

test('i valori esattamente a meta\' salgono, come in PHP', () => {
  // Math.round(263.585 * 100) / 100 darebbe 263.58, perche' 263.585 * 100 in
  // virgola mobile fa 26358.499999999996. E' il caso che si e' presentato
  // davvero: la media mensile del report 2022.
  assert.equal(roundLikePhp(263.585, 2), 263.59);
  assert.equal(roundLikePhp(1.005, 2), 1.01);
  assert.equal(roundLikePhp(2.675, 2), 2.68);
  assert.equal(roundLikePhp(0.145, 2), 0.15);
  assert.equal(roundLikePhp(1234.565, 2), 1234.57);
});

test('i negativi si allontanano da zero, come in PHP', () => {
  assert.equal(roundLikePhp(-263.585, 2), -263.59);
  assert.equal(roundLikePhp(-1.005, 2), -1.01);
});

test('sotto la meta\' si scende', () => {
  assert.equal(roundLikePhp(1.0049, 2), 1);
  assert.equal(roundLikePhp(2.674, 2), 2.67);
});

test('funziona anche con una cifra decimale, per le percentuali', () => {
  assert.equal(roundLikePhp(79.95, 1), 80);
  assert.equal(roundLikePhp(12.34, 1), 12.3);
  assert.equal(roundLikePhp(12.35, 1), 12.4);
});

test('un valore non numerico vale zero, non NaN', () => {
  assert.equal(roundLikePhp(Number.NaN, 2), 0);
  assert.equal(roundLikePhp(undefined, 2), 0);
});

test('gli interi restano interi', () => {
  assert.equal(roundLikePhp(100, 2), 100);
  assert.equal(roundLikePhp(0, 2), 0);
});

// ── parseAmountItaliano ─────────────────────────────────────────────────────
// Il fratello nuovo di parseAmountLikePhp, per i campi dove non c'e' niente di
// vecchio da rispettare: il primo e' il saldo iniziale nella procedura di
// benvenuto. Una persona che comincia scrive il saldo come lo legge in banca,
// e "1.234,50" deve fare milleduecentotrentaquattro e cinquanta.

test('legge il formato italiano completo, migliaia comprese', () => {
  assert.equal(parseAmountItaliano('1.234,50'), 1234.5);
  assert.equal(parseAmountItaliano('12.345.678,90'), 12345678.9);
  assert.equal(parseAmountItaliano('1.234'), 1234, 'senza decimali sono migliaia');
});

test('e\' la differenza con quella vecchia, che quel numero lo sbagliava', () => {
  assert.equal(parseAmountLikePhp('1.234,50'), 1.234);
  assert.notEqual(parseAmountItaliano('1.234,50'), parseAmountLikePhp('1.234,50'));
});

test('legge anche il formato inglese, senza doverlo sapere prima', () => {
  assert.equal(parseAmountItaliano('1,234.50'), 1234.5);
  assert.equal(parseAmountItaliano('1234.50'), 1234.5);
  assert.equal(parseAmountItaliano('1234,50'), 1234.5);
});

test('gli spazi, l\'euro e il vuoto non disturbano', () => {
  assert.equal(parseAmountItaliano(' 2 500,00 € '), 2500);
  assert.equal(parseAmountItaliano(''), 0);
  assert.equal(parseAmountItaliano(null), 0);
  assert.equal(parseAmountItaliano('non un numero'), 0);
});

test('i negativi restano negativi', () => {
  assert.equal(parseAmountItaliano('-1.234,50'), -1234.5);
});
