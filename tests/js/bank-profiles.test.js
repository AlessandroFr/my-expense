// Il riconoscimento del tracciato, provato sul pezzo di un estratto conto vero
// di Banca Mediolanum (gennaio-luglio 2026). Il file ha il BOM, gli importi con
// il punto decimale e uno spazio unificatore prima dell'euro: tre modi diversi
// di far leggere un numero sbagliato a chi non li gestisce.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { builtinProfiles, matchProfiles } from '../../server/bank-profiles.js';
import { extractIban, loadAndDecode, parseBankAmountSigned, parseStatementDate } from '../../server/bank-statement.js';
import { splitCsvLine } from '../../server/routes/csv.js';

const NBSP = ' ';

const ESTRATTO = [
  'Nickname;IBAN;Saldo contabile;Saldo disponibile',
  `MROSSI;IT60X0542811101000000123456;4.404,02${NBSP}€;4.391,03${NBSP}€`,
  'Numero del conto 001/00123456/01;;;Intestato a: Mario Rossi',
  '"', '"', '"', '"',
  'Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate',
  `31/07/2026;31/07/2026;Bonifici;VOSTRA DISPOSIZIONE BIANCHI LUIGI NOTE: PARCHEGGIO;-2.30${NBSP}€;`,
  `20/07/2026;20/07/2026;Bonifici;DISPOSIZIONE VS. FAVORE VERDI ANNA NOTE: REGALO;;15.00${NBSP}€`,
  `02/01/2026;02/01/2026;Acquisti - Aggiuntivi;ACQUISTO TITOLI PER CONTANTI QTA: 5 TITOLO : ETFS INVESC GOLD MTF;-1800.25${NBSP}€;`,
].join('\r\n');

/** Il file come arriva dalla banca: UTF-8 con il BOM davanti. */
const file = () => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(ESTRATTO, 'utf8')]);

const righe = () => loadAndDecode(file()).split(/\r\n|\n|\r/);

const profilo = (key) => builtinProfiles().filter((p) => p.builtin_key === key);

test('il profilo Mediolanum riconosce tutte e sei le colonne', () => {
  const esito = matchProfiles(righe(), profilo('mediolanum'));
  assert.ok(esito.best, 'nessun profilo ha riconosciuto il file');

  assert.equal(esito.best.headerIdx, 7);
  assert.equal(esito.best.delimiter, ';');
  assert.deepEqual(esito.best.mapping, {
    op_date: 0, value_date: 1, tipologia: 2, description: [3], outflow: 4, inflow: 5,
  });
});

test('l\'IBAN del conto si legge dalle righe prima dell\'intestazione', () => {
  const lines = righe();
  assert.equal(extractIban(lines.slice(0, 7)), 'IT60X0542811101000000123456');
});

test('le righe si leggono con date, segno e importi giusti', () => {
  const lines = righe();
  const { mapping, delimiter } = matchProfiles(lines, profilo('mediolanum')).best;

  const leggi = (i) => {
    const cols = splitCsvLine(lines[i], delimiter);
    const uscita = cols[mapping.outflow] ?? '';
    const entrata = cols[mapping.inflow] ?? '';
    const spesa = uscita.trim() !== '';
    return {
      data: parseStatementDate(cols[mapping.op_date], 'dmy'),
      spesa,
      importo: parseBankAmountSigned(spesa ? uscita : entrata).value,
    };
  };

  assert.deepEqual(leggi(8), { data: '2026-07-31', spesa: true, importo: 2.3 });
  assert.deepEqual(leggi(9), { data: '2026-07-20', spesa: false, importo: 15 });
  // Il punto qui e' decimale, non separatore delle migliaia: 1800.25, non 180025.
  assert.deepEqual(leggi(10), { data: '2026-01-02', spesa: true, importo: 1800.25 });
});

test('il tracciato di Mediolanum e Sella e\' lo stesso: entrambi leggono il file', () => {
  // Nessuna delle due si distingue dall'intestazione, ed e' il motivo per cui
  // il profilo si assegna al conto invece di indovinarlo a ogni import.
  for (const key of ['mediolanum', 'sella']) {
    const esito = matchProfiles(righe(), profilo(key));
    assert.ok(esito.best, `il profilo ${key} non riconosce il file`);
    assert.equal(esito.best.score, 6);
  }
});
