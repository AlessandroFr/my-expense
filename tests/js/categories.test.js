// La normalizzazione delle categorie in Node deve comportarsi come
// CategoryService::normalize in PHP: durante la migrazione i due percorsi
// convivono, e una differenza qui si vedrebbe come dato salvato diverso a
// seconda di chi ha servito la richiesta.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../../server/routes/categories.js';

test('il nome e\' obbligatorio', () => {
  assert.throws(() => normalize({ name: '' }), /obbligatorio/);
  assert.throws(() => normalize({ name: '   ' }), /obbligatorio/);
  assert.throws(() => normalize({}), /obbligatorio/);
});

test('il nome si ferma a 64 caratteri', () => {
  assert.equal(normalize({ name: 'a'.repeat(64) }).name, 'a'.repeat(64));
  assert.throws(() => normalize({ name: 'a'.repeat(65) }), /64/);
});

test('il limite del nome conta i caratteri, non i byte', () => {
  // PHP usa mb_strlen: 64 accentate passano, anche se sono 128 byte in UTF-8.
  assert.equal(normalize({ name: 'à'.repeat(64) }).name, 'à'.repeat(64));
  assert.throws(() => normalize({ name: 'à'.repeat(65) }), /64/);
});

test('il nome viene ripulito dagli spazi', () => {
  assert.equal(normalize({ name: '  Spesa  ' }).name, 'Spesa');
});

test('colore assente o vuoto usa il grigio di default', () => {
  assert.equal(normalize({ name: 'x' }).color, '#6c757d');
  assert.equal(normalize({ name: 'x', color: '' }).color, '#6c757d');
  assert.equal(normalize({ name: 'x', color: '   ' }).color, '#6c757d');
});

test('il colore deve essere un hex a sei cifre, salvato minuscolo', () => {
  assert.equal(normalize({ name: 'x', color: '#FF8800' }).color, '#ff8800');
  assert.throws(() => normalize({ name: 'x', color: 'rosso' }), /hex/);
  assert.throws(() => normalize({ name: 'x', color: '#fff' }), /hex/);
  assert.throws(() => normalize({ name: 'x', color: '#ff88000' }), /hex/);
});

test('icona: vuota o assente diventa null, oltre 32 caratteri e\' errore', () => {
  assert.equal(normalize({ name: 'x' }).icon, null);
  assert.equal(normalize({ name: 'x', icon: '' }).icon, null);
  assert.equal(normalize({ name: 'x', icon: '  ' }).icon, null);
  assert.equal(normalize({ name: 'x', icon: 'bi-cart' }).icon, 'bi-cart');
  assert.throws(() => normalize({ name: 'x', icon: 'a'.repeat(33) }), /32/);
});

test('sort_order non numerico vale zero', () => {
  assert.equal(normalize({ name: 'x' }).sort_order, 0);
  assert.equal(normalize({ name: 'x', sort_order: '7' }).sort_order, 7);
  assert.equal(normalize({ name: 'x', sort_order: 'abc' }).sort_order, 0);
});
