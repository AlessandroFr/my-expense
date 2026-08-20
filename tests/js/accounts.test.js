// Regole dei conti in Node: devono corrispondere ad App\Account::validate e
// normalizeDetails. Finche' i due backend convivono, una differenza qui
// significa che lo stesso form accetta o rifiuta a seconda di chi risponde.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Le funzioni sono interne al modulo: si esercitano attraverso l'unico punto
// che le mette insieme, replicandone qui la firma minima. Per tenere il test
// indipendente dal database si importa il modulo e si usano le sole funzioni
// pure esportate.
import { parseAmountLikePhp } from '../../server/amount.js';

test('gli importi si leggono come li legge PHP', () => {
  // PHP fa (float) str_replace(',', '.', $v): "1.234,56" diventa "1.234.56",
  // che si ferma a 1.234. Il comportamento e' discutibile ma va riprodotto,
  // altrimenti lo stesso valore darebbe risultati diversi nei due backend.
  assert.equal(parseAmountLikePhp('1.234,56'), 1.234);
  assert.equal(parseAmountLikePhp('250,50'), 250.5);
  assert.equal(parseAmountLikePhp('10.5'), 10.5);
  assert.equal(parseAmountLikePhp('-3,7'), -3.7);
});

test('un importo non numerico vale zero, non NaN', () => {
  assert.equal(parseAmountLikePhp('abc'), 0);
  assert.equal(parseAmountLikePhp(''), 0);
  assert.equal(parseAmountLikePhp(null), 0);
  assert.equal(parseAmountLikePhp(undefined), 0);
});

test('gli spazi non contano', () => {
  assert.equal(parseAmountLikePhp('  42,5  '), 42.5);
});
