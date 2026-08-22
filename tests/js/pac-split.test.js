// La divisione di una spesa fra piu' piani di accumulo. Qui si tocca del
// denaro: se la somma delle quote non fa l'importo del movimento, la
// differenza finisce su un fondo che non l'ha ricevuta e il rendimento del
// piano mente per sempre. Quindi si prova al centesimo.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeShares, sharesMismatch, suggestShares } from '../../server/pac-split.js';

const plans = [
  { id: 1, name: 'PAC CTO', amount: '100.00', beneficiary_keyword: null },
  { id: 2, name: 'PAC CPE', amount: '100.00', beneficiary_keyword: null },
  { id: 3, name: 'PAC CNA', amount: '300.00', beneficiary_keyword: 'MOLEINVEST' },
];

test('le quote a zero spariscono, le altre restano com\'erano', () => {
  assert.deepEqual(
    normalizeShares([{ plan_id: 1, amount: '100,00' }, { plan_id: 2, amount: '0' }, { plan_id: 3, amount: '' }]),
    [{ plan_id: 1, amount: 100 }],
  );
});

test('lo stesso piano due volte e\' un errore, non una somma', () => {
  assert.throws(() => normalizeShares([{ plan_id: 1, amount: 50 }, { plan_id: 1, amount: 50 }]), /due volte/);
});

test('la somma delle quote deve fare l\'importo, al centesimo', () => {
  const q = [{ plan_id: 1, amount: 100 }, { plan_id: 2, amount: 400 }];
  assert.equal(sharesMismatch(q, 500), null);
  assert.match(sharesMismatch(q, 500.01), /Mancano 0\.01/);
  assert.match(sharesMismatch(q, 499.99), /Ci sono 0\.01 euro di troppo/);
});

test('la proposta arriva solo se i piani fanno esattamente l\'importo', () => {
  // 100 + 100 + 300: e' il totale dei piani, quindi la divisione e' quella.
  assert.deepEqual(suggestShares(plans, 500, 'ADDEBITO PAC'), [
    { plan_id: 1, amount: 100 }, { plan_id: 2, amount: 100 }, { plan_id: 3, amount: 300 },
  ]);
  // 450 non e' il totale di niente: meglio nessuna proposta di una inventata.
  assert.equal(suggestShares(plans, 450, 'ADDEBITO PAC'), null);
});

test('se la descrizione nomina un piano, si guarda solo a quello', () => {
  assert.deepEqual(suggestShares(plans, 300, 'BONIFICO A MOLEINVEST SPA'), [{ plan_id: 3, amount: 300 }]);
  // Nominato quel piano, l'importo dev'essere il suo: 500 non lo e' piu'.
  assert.equal(suggestShares(plans, 500, 'BONIFICO A MOLEINVEST SPA'), null);
});

test('senza piani non si propone niente', () => {
  assert.equal(suggestShares([], 100, 'qualsiasi cosa'), null);
});
