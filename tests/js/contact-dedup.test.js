// Il riconoscimento dei doppioni fra le anagrafiche. Gli esempi vengono dai
// nomi che l'import dell'estratto conto produce davvero.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { duplicateGroups, coreName, whyDuplicate } from '../../server/contact-dedup.js';

const c = (id, name, usage_total = 0) => ({ id, name, usage_total });
const names = (gruppo) => gruppo.members.map((m) => m.name).sort();

test('il nocciolo del nome ignora sigle societarie e punteggiatura', () => {
  assert.equal(coreName('Centro Nuoto Riva S.R.L.'), 'centro nuoto riva');
  assert.equal(coreName('CENTRO NUOTO RIVA SRL'), 'centro nuoto riva');
  assert.equal(coreName('Anthropic* Claude'), 'anthropic claude');
});

test('due nomi sono lo stesso se coincidono o se uno comincia con l\'altro', () => {
  assert.equal(whyDuplicate('Coop Centrale', 'COOP CENTRALE S.R.L.'), 'stesso nome');
  // Il nome troncato dalla banca a lunghezza fissa.
  assert.equal(whyDuplicate('Supermercato Coop Centr', 'Supermercato Coop Centrale'), 'uno comincia con l\'altro');
  assert.equal(whyDuplicate('Anthropic', 'Anthropic* Claude Sub San Francisco'), 'uno comincia con l\'altro');
});

test('nome e cognome invertiti sono la stessa persona', () => {
  assert.equal(whyDuplicate('ROSSI MARIO', 'Mario Rossi'), 'nome e cognome invertiti');
  assert.equal(whyDuplicate('Neri Giulia', 'GIULIA NERI'), 'nome e cognome invertiti');
  assert.equal(whyDuplicate('Mario Gallo', 'Mario Ometto'), null);
});

test('gli spazi di troppo non fanno due negozi', () => {
  assert.equal(whyDuplicate("MC DONALD'S", "MCDONALD'S"), 'stesso nome');
});

test('due supermercati diversi restano due', () => {
  // «Coop» e' un'insegna: trattarla da sigla societaria faceva diventare
  // «Supermercato Coop» un «Supermercato» qualunque, che si prendeva il vicino.
  assert.equal(whyDuplicate('Supermercato Coop', 'Supermercato Aurora'), null);
  assert.equal(whyDuplicate('Supermercato Coop', 'Supermercato Coop Centrale'), 'uno comincia con l\'altro');
});

test('nomi corti e nomi diversi restano separati', () => {
  // Sotto i sei caratteri il prefisso non vuol dire niente.
  assert.equal(whyDuplicate('Bar', 'Bar Ristorante Pizzeria'), null);
  assert.equal(whyDuplicate('Coop', 'Coop Centrale'), null);
  assert.equal(whyDuplicate('Verdi Anna', 'Bianchi Luigi'), null);
  assert.equal(whyDuplicate('', 'Qualcosa'), null);
});

test('i nomi che si somigliano finiscono in un gruppo solo', () => {
  const groups = duplicateGroups([
    c(1, 'Anthropic', 3),
    c(2, 'Anthropic* Claude Sub San Francisco', 12),
    c(3, 'ANTHROPIC*CLAUDE'),
    c(4, 'Verdi Anna', 5),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(names(groups[0]), ['ANTHROPIC*CLAUDE', 'Anthropic', 'Anthropic* Claude Sub San Francisco']);
  // Vince chi ha piu' movimenti: e' l'anagrafica gia' in uso.
  assert.equal(groups[0].suggested_winner_id, 2);
});

test('a pari movimenti vince il nome piu\' corto', () => {
  const groups = duplicateGroups([c(1, 'Forno Aurora Centro Centro'), c(2, 'Forno Aurora Centro')]);
  assert.equal(groups[0].suggested_winner_id, 2);
});

test('chi non ha doppioni non compare', () => {
  assert.deepEqual(duplicateGroups([c(1, 'Verdi Anna'), c(2, 'Bianchi Luigi')]), []);
  assert.deepEqual(duplicateGroups([]), []);
});
