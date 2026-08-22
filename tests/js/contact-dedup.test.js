// Il riconoscimento dei doppioni fra le anagrafiche. Gli esempi vengono dai
// nomi che l'import dell'estratto conto produce davvero.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gruppiDoppioni, nocciolo, perche } from '../../server/contact-dedup.js';

const c = (id, name, usage_total = 0) => ({ id, name, usage_total });
const nomi = (gruppo) => gruppo.members.map((m) => m.name).sort();

test('il nocciolo del nome ignora sigle societarie e punteggiatura', () => {
  assert.equal(nocciolo('Centro Nuoto Riva S.R.L.'), 'centro nuoto riva');
  assert.equal(nocciolo('CENTRO NUOTO RIVA SRL'), 'centro nuoto riva');
  assert.equal(nocciolo('Anthropic* Claude'), 'anthropic claude');
});

test('due nomi sono lo stesso se coincidono o se uno comincia con l\'altro', () => {
  assert.equal(perche('Coop Centrale', 'COOP CENTRALE S.R.L.'), 'stesso nome');
  // Il nome troncato dalla banca a lunghezza fissa.
  assert.equal(perche('Supermercato Coop Centr', 'Supermercato Coop Centrale'), 'uno comincia con l\'altro');
  assert.equal(perche('Anthropic', 'Anthropic* Claude Sub San Francisco'), 'uno comincia con l\'altro');
});

test('nome e cognome invertiti sono la stessa persona', () => {
  assert.equal(perche('ROSSI MARIO', 'Mario Rossi'), 'nome e cognome invertiti');
  assert.equal(perche('Neri Giulia', 'GIULIA NERI'), 'nome e cognome invertiti');
  assert.equal(perche('Mario Gallo', 'Mario Ometto'), null);
});

test('gli spazi di troppo non fanno due negozi', () => {
  assert.equal(perche("MC DONALD'S", "MCDONALD'S"), 'stesso nome');
});

test('due supermercati diversi restano due', () => {
  // «Coop» e' un'insegna: trattarla da sigla societaria faceva diventare
  // «Supermercato Coop» un «Supermercato» qualunque, che si prendeva il vicino.
  assert.equal(perche('Supermercato Coop', 'Supermercato Aurora'), null);
  assert.equal(perche('Supermercato Coop', 'Supermercato Coop Centrale'), 'uno comincia con l\'altro');
});

test('nomi corti e nomi diversi restano separati', () => {
  // Sotto i sei caratteri il prefisso non vuol dire niente.
  assert.equal(perche('Bar', 'Bar Ristorante Pizzeria'), null);
  assert.equal(perche('Coop', 'Coop Centrale'), null);
  assert.equal(perche('Verdi Anna', 'Bianchi Luigi'), null);
  assert.equal(perche('', 'Qualcosa'), null);
});

test('i nomi che si somigliano finiscono in un gruppo solo', () => {
  const gruppi = gruppiDoppioni([
    c(1, 'Anthropic', 3),
    c(2, 'Anthropic* Claude Sub San Francisco', 12),
    c(3, 'ANTHROPIC*CLAUDE'),
    c(4, 'Verdi Anna', 5),
  ]);

  assert.equal(gruppi.length, 1);
  assert.deepEqual(nomi(gruppi[0]), ['ANTHROPIC*CLAUDE', 'Anthropic', 'Anthropic* Claude Sub San Francisco']);
  // Vince chi ha piu' movimenti: e' l'anagrafica gia' in uso.
  assert.equal(gruppi[0].suggested_winner_id, 2);
});

test('a pari movimenti vince il nome piu\' corto', () => {
  const gruppi = gruppiDoppioni([c(1, 'Forno Aurora Centro Centro'), c(2, 'Forno Aurora Centro')]);
  assert.equal(gruppi[0].suggested_winner_id, 2);
});

test('chi non ha doppioni non compare', () => {
  assert.deepEqual(gruppiDoppioni([c(1, 'Verdi Anna'), c(2, 'Bianchi Luigi')]), []);
  assert.deepEqual(gruppiDoppioni([]), []);
});
