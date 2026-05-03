// Sample test harness — verifica che `node --test` sia configurato.
// Definisce due funzioni pure (parser money/data) e le testa con input
// sintetici. Niente DOM, niente fetch, niente fs.
//
// Per scrivere nuovi test:
//   1. crea un file `<nome>.test.js` sotto `tests/js/`
//   2. import { describe, it } from 'node:test'  +  import assert from 'node:assert/strict'
//   3. esegui  npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function parseItalianAmount(raw) {
    let clean = String(raw).replace(/[€\s]/gu, '').replace(/EUR/g, '').trim();
    if (clean === '') throw new Error('empty');
    let negative = false;
    if (clean.startsWith('-')) { negative = true; clean = clean.slice(1); }
    else if (clean.startsWith('+')) clean = clean.slice(1);
    const hasDot = clean.includes('.');
    const hasComma = clean.includes(',');
    if (hasDot && hasComma) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (hasComma && !hasDot) {
        clean = clean.replace(',', '.');
    }
    const v = Number(clean);
    if (!Number.isFinite(v)) throw new Error(`invalid: ${raw}`);
    return negative ? Math.abs(v) : v;
}

function parseItalianDate(raw) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw).trim());
    if (!m) throw new Error(`bad date: ${raw}`);
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

describe('parseItalianAmount', () => {
    it('parses negative with euro symbol', () => {
        assert.equal(parseItalianAmount('-12.34 €'), 12.34);
    });
    it('parses italian thousands + decimal', () => {
        assert.equal(parseItalianAmount('5.039,56 €'), 5039.56);
    });
    it('parses positive plain', () => {
        assert.equal(parseItalianAmount('1500.00 €'), 1500);
    });
    it('throws on garbage', () => {
        assert.throws(() => parseItalianAmount('abc'));
    });
});

describe('parseItalianDate', () => {
    it('returns ISO YYYY-MM-DD', () => {
        assert.equal(parseItalianDate('15/04/2026'), '2026-04-15');
    });
    it('zero-pads single digits', () => {
        assert.equal(parseItalianDate('1/4/2026'), '2026-04-01');
    });
    it('throws on invalid input', () => {
        assert.throws(() => parseItalianDate('2026-04-15'));
    });
});
