// L'avanzamento delle ricorrenze deve coincidere con
// DateTimeImmutable::modify() di PHP, sbordo di fine mese compreso: una
// differenza qui sposterebbe la data delle spese generate automaticamente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avanza } from '../../server/routes/recurring.js';

test('un mese avanti da fine mese sborda, come in PHP', () => {
  // PHP: (new DateTimeImmutable('2026-01-31'))->modify('+1 month') = 2026-03-03.
  // Febbraio non ha il 31, quindi la data trabocca nel mese dopo.
  assert.equal(avanza('2026-01-31', 'monthly'), '2026-03-03');
  assert.equal(avanza('2026-01-30', 'monthly'), '2026-03-02');
  assert.equal(avanza('2026-03-31', 'monthly'), '2026-05-01');
  assert.equal(avanza('2026-05-31', 'monthly'), '2026-07-01');
});

test('un mese avanti da una data normale resta nello stesso giorno', () => {
  assert.equal(avanza('2026-02-28', 'monthly'), '2026-03-28');
  assert.equal(avanza('2026-01-15', 'monthly'), '2026-02-15');
  assert.equal(avanza('2026-12-31', 'monthly'), '2027-01-31');
});

test('gli anni bisestili si comportano come in PHP', () => {
  assert.equal(avanza('2024-01-29', 'monthly'), '2024-02-29');
  assert.equal(avanza('2024-02-29', 'yearly'), '2025-03-01');
});

test('settimane e anni', () => {
  assert.equal(avanza('2026-08-20', 'weekly'), '2026-08-27');
  assert.equal(avanza('2026-12-28', 'weekly'), '2027-01-04');
  assert.equal(avanza('2026-08-20', 'yearly'), '2027-08-20');
});

test('una frequenza sconosciuta e\' un errore, non un avanzamento a caso', () => {
  assert.throws(() => avanza('2026-08-20', 'daily'), /Frequenza non valida/);
});
