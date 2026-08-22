// La lettura delle risposte della borsa. Niente rete qui dentro: si prova la
// scelta del titolo e la lettura delle quotazioni su risposte registrate.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NavError, symbolCandidates, pickSymbol, seriesFromChart } from '../../server/nav-fetch.js';

test('fra piu\' borse vince Milano, che quota in euro', () => {
  const quotes = [
    { symbol: 'IWDA.L', currency: 'USD' },
    { symbol: 'SWDA.MI', currency: 'EUR' },
    { symbol: 'EUNL.DE', currency: 'EUR' },
  ];
  assert.equal(pickSymbol(quotes, 'EUR'), 'SWDA.MI');
});

test('senza Milano si prende un\'altra piazza europea, non quella in dollari', () => {
  const quotes = [
    { symbol: 'IWDA.L', currency: 'USD' },
    { symbol: 'EUNL.DE', currency: 'EUR' },
  ];
  assert.equal(pickSymbol(quotes, 'EUR'), 'EUNL.DE');
});

test('se nessuno quota nella valuta giusta si propone comunque qualcosa', () => {
  // Meglio proporre e far correggere che non trovare niente: la valuta viene
  // poi verificata prima di salvare i NAV.
  assert.equal(pickSymbol([{ symbol: 'IWDA.L', currency: 'USD' }], 'EUR'), 'IWDA.L');
  assert.equal(pickSymbol([], 'EUR'), null);
  assert.equal(pickSymbol(undefined, 'EUR'), null);
});

const chart = (timestamp, close, extra = {}) => ({
  chart: {
    result: [{
      meta: { symbol: 'SWDA.MI', currency: 'EUR', ...extra },
      timestamp,
      indicators: { quote: [{ close }] },
    }],
  },
});

test('le quotazioni escono come data e valore', () => {
  const r = seriesFromChart(chart(
    [Date.UTC(2026, 0, 2) / 1000, Date.UTC(2026, 0, 5) / 1000],
    [126.98, 127.5],
  ));
  assert.equal(r.symbol, 'SWDA.MI');
  assert.equal(r.currency, 'EUR');
  assert.deepEqual(r.punti, [
    { nav_date: '2026-01-02', nav: 126.98 },
    { nav_date: '2026-01-05', nav: 127.5 },
  ]);
});

test('i giorni senza scambi si buttano invece di valere zero', () => {
  const r = seriesFromChart(chart(
    [Date.UTC(2026, 0, 2) / 1000, Date.UTC(2026, 0, 3) / 1000, Date.UTC(2026, 0, 4) / 1000],
    [126.98, null, 0],
  ));
  assert.deepEqual(r.punti.map((p) => p.nav_date), ['2026-01-02']);
});

test('una risposta senza dati e\' un errore parlante, non un elenco vuoto', () => {
  assert.throws(() => seriesFromChart({ chart: { error: { description: 'No data found' } } }), NavError);
  assert.throws(() => seriesFromChart({}), /non leggibile/);
});
