// L'andamento di un piano di accumulo. Qui si toccano soldi: i numeri si
// verificano contro casi calcolati a mano, non contro se' stessi.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { performanceSeries, summary, irr } from '../../server/pac-performance.js';

const contribution = (data, amount, nav) => ({
  contribution_date: data,
  amount: amount,
  nav,
  units: nav ? amount / nav : null,
});

test('un solo versamento raddoppiato in un anno rende il 100%', () => {
  const r = irr([
    { date: '2025-01-01', amount: -1000 },
    { date: '2026-01-01', amount: 2000 },
  ]);
  assert.ok(Math.abs(r - 1) < 0.005, `atteso ~1, ottenuto ${r}`);
});

test('quel che entra e quel che esce uguali fanno rendimento zero', () => {
  const r = irr([
    { date: '2025-01-01', amount: -1000 },
    { date: '2026-01-01', amount: 1000 },
  ]);
  assert.ok(Math.abs(r) < 0.0001, `atteso ~0, ottenuto ${r}`);
});

test('il TIR pesa i versamenti per quanto sono rimasti dentro', () => {
  // Due versamenti da 1000, a un anno di distanza, valore finale 2200.
  // Il montante e' cresciuto del 10%, ma il secondo versamento e' entrato solo
  // oggi: il rendimento annuo e' quindi piu' alto del 10%.
  const r = irr([
    { date: '2025-01-01', amount: -1000 },
    { date: '2026-01-01', amount: -1000 },
    { date: '2026-01-01', amount: 2200 },
  ]);
  assert.ok(Math.abs(r - 0.2) < 0.01, `atteso ~0.20, ottenuto ${r}`);
});

test('senza un\'uscita e un\'entrata il rendimento non esiste', () => {
  assert.equal(irr([{ date: '2025-01-01', amount: -1000 }]), null);
  assert.equal(irr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: -500 }]), null);
  assert.equal(irr([]), null);
});

test('la curva mette insieme versato e valore a ogni data utile', () => {
  const contributi = [contribution('2026-01-01', 100, 10), contribution('2026-02-01', 100, 20)];
  const navs = [{ nav_date: '2026-03-01', nav: 25 }];

  const points = performanceSeries(contributi, navs);
  assert.deepEqual(points.map((p) => p.date), ['2026-01-01', '2026-02-01', '2026-03-01']);
  // 10 quote a 10, poi +5 quote a 20 = 15 quote; a marzo valgono 25 l'una.
  assert.deepEqual(points.map((p) => p.contributed), [100, 200, 200]);
  assert.deepEqual(points.map((p) => p.units), [10, 15, 15]);
  assert.deepEqual(points.map((p) => p.value), [100, 300, 375]);
});

test('prima del primo NAV il valore resta vuoto invece di essere inventato', () => {
  const contributi = [{ contribution_date: '2026-01-01', amount: 100, nav: null, units: null }];
  const points = performanceSeries(contributi, []);
  assert.deepEqual(points, [{ date: '2026-01-01', contributed: 100, units: 0, value: null }]);
});

test('il riepilogo dice versato, valore, guadagno e ritmo', () => {
  const contributi = [contribution('2025-01-01', 1000, 10), contribution('2026-01-01', 1000, 10)];
  // 200 quote in tutto; a 11 valgono 2200.
  const r = summary(contributi, [{ nav_date: '2026-01-01', nav: 11 }], '2026-01-01');

  assert.equal(r.contributed, 2000);
  assert.equal(r.value, 2200);
  assert.equal(r.gain, 200);
  assert.equal(r.gain_pct, 10);
  // Il 10% e' del montante; il ritmo annuo e' piu' alto perche' meta' dei soldi
  // e' entrata oggi.
  assert.ok(r.irr > 15 && r.irr < 25, `TIR fuori scala: ${r.irr}`);
});

test('senza NAV il riepilogo non inventa un valore', () => {
  const r = summary([{ contribution_date: '2026-01-01', amount: 100, nav: null, units: null }], [], '2026-02-01');
  assert.equal(r.contributed, 100);
  assert.equal(r.value, null);
  assert.equal(r.gain, null);
  assert.equal(r.irr, null);
});

test('un piano senza versamenti non ha andamento', () => {
  const r = summary([], [{ nav_date: '2026-01-01', nav: 11 }], '2026-01-01');
  assert.deepEqual(r.series, []);
  assert.equal(r.contributed, 0);
  assert.equal(r.value, null);
});
