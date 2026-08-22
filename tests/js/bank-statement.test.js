// Lettura degli estratti conto: ogni banca esporta a modo suo, e sbagliare
// una colonna vuol dire scrivere spese sbagliate nel database. Qui si verifica
// che il tracciato giusto venga riconosciuto e che quello di Banca Sella —
// l'unico che l'app leggeva prima dei profili — continui a essere letto uguale.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyExpense, extractCounterparty, extractIban, loadAndDecode,
  parseBankAmountSigned, parseStatementDate, looksLikeBankJargon,
} from '../../server/bank-statement.js';
import { builtinProfiles, matchProfiles, normalizeHeader } from '../../server/bank-profiles.js';
import { resolveAmountMode } from '../../server/routes/bank-import.js';

/** I preimpostati come li vedrebbe il codice dopo averli letti dal database. */
const profili = () => builtinProfiles().map((p, i) => ({ ...p, id: i + 1 }));
const profile = (key) => profili().filter((p) => p.builtin_key === key);

const rows = (text) => text.split('\n');

// ─── Date ───────────────────────────────────────────────────────────────────

test('le date escono sempre ISO, in qualunque ordine arrivino', () => {
  assert.equal(parseStatementDate('20/08/2026'), '2026-08-20');
  assert.equal(parseStatementDate('5/3/2026'), '2026-03-05');
  assert.equal(parseStatementDate('2026-08-20'), '2026-08-20');
  assert.equal(parseStatementDate('20.08.2026'), '2026-08-20');
  assert.equal(parseStatementDate('12/03/2026 14:07'), '2026-03-12');
  assert.equal(parseStatementDate('03/12/2026', 'mdy'), '2026-03-12');
  assert.equal(parseStatementDate('2026/08/20', 'ymd'), '2026-08-20');
});

test("l'anno a due cifre sopra il 70 e' del secolo scorso", () => {
  assert.equal(parseStatementDate('01/02/26'), '2026-02-01');
  assert.equal(parseStatementDate('01/02/98'), '1998-02-01');
});

test('una data illeggibile e\' un errore, non una data a caso', () => {
  assert.throws(() => parseStatementDate(''), /mancante/);
  assert.throws(() => parseStatementDate('ieri'), /non valida/);
});

// ─── Importi ────────────────────────────────────────────────────────────────

test('gli importi arrivano con le migliaia, la valuta e il segno dove capita', () => {
  assert.deepEqual(parseBankAmountSigned('1.234,56'), { value: 1234.56, negative: false });
  assert.deepEqual(parseBankAmountSigned('1,234.56'), { value: 1234.56, negative: false });
  assert.deepEqual(parseBankAmountSigned('€ 12,00'), { value: 12, negative: false });
  assert.deepEqual(parseBankAmountSigned('-1234.56'), { value: 1234.56, negative: true });
  assert.deepEqual(parseBankAmountSigned('1.234,56-'), { value: 1234.56, negative: true });
  assert.deepEqual(parseBankAmountSigned('(1.234,56)'), { value: 1234.56, negative: true });
});

test('un importo non numerico e\' un errore', () => {
  assert.throws(() => parseBankAmountSigned(''), /vuoto/);
  assert.throws(() => parseBankAmountSigned('molti soldi'), /non valido/);
});

// ─── Riconoscimento del tracciato ───────────────────────────────────────────

const SELLA = `Estratto conto
Intestato a: MARIO ROSSI
IBAN: IT60X0542811101000000123456

Operazione;Valuta;Tipologia Operazione;Descrizione;Uscite;Entrate
12/03/2026;13/03/2026;Pagamenti;PAGAMENTO POS ESSELUNGA COD. MCC 5411;-45,20;
14/03/2026;14/03/2026;Stipendi;ACCREDITO STIPENDIO;;1.800,00
`;

test('il tracciato di Banca Sella viene riconosciuto come prima', () => {
  const { best } = matchProfiles(rows(SELLA), profili());
  assert.equal(best.profile.builtin_key, 'sella');
  assert.equal(best.delimiter, ';');
  assert.equal(best.headerIdx, 4);
  assert.deepEqual(best.mapping, {
    op_date: 0, value_date: 1, tipologia: 2, description: [3], outflow: 4, inflow: 5,
  });
  assert.equal(resolveAmountMode(best.profile.amount_mode, best.mapping), 'in_out');
  assert.equal(extractIban(rows(SELLA).slice(0, best.headerIdx)), 'IT60X0542811101000000123456');
});

test('le colonne si riconoscono per nome, anche in ordine diverso', () => {
  const file = rows([
    'Descrizione;Data Contabile;Importo;Data Valuta',
    'BONIFICO A FAV. MARIO ROSSI BONIFICO;12/03/2026;-100,00;12/03/2026',
  ].join('\n'));
  const { best } = matchProfiles(file, profili());
  assert.equal(best.mapping.op_date, 1);
  assert.equal(best.mapping.description[0], 0);
  assert.equal(best.mapping.amount, 2);
  assert.equal(best.mapping.value_date, 3);
  assert.equal(resolveAmountMode(best.profile.amount_mode, best.mapping), 'signed');
});

test('una colonna importo sola: il segno dice se e\' spesa o entrata', () => {
  const file = rows([
    'Data contabile;Data valuta;Descrizione;Importo',
    '12/03/2026;12/03/2026;SPESA SUPERMERCATO;-45,20',
    '14/03/2026;14/03/2026;ACCREDITO STIPENDIO;1.800,00',
  ].join('\n'));
  const { best } = matchProfiles(file, profile('mediolanum'));
  assert.equal(resolveAmountMode(best.profile.amount_mode, best.mapping), 'signed');

  const values = rows(file.slice(best.headerIdx + 1).join('\n'))
    .filter((r) => r.trim() !== '')
    .map((r) => parseBankAmountSigned(r.split(';')[best.mapping.amount]));
  assert.deepEqual(values, [
    { value: 45.2, negative: true },
    { value: 1800, negative: false },
  ]);
});

test('la descrizione spezzata su piu\' colonne si riunisce nell\'ordine del file', () => {
  const file = rows([
    'Data;Dettagli;Importo;Descrizione',
    '12/03/2026;POS;-45,20;ESSELUNGA MILANO',
  ].join('\n'));
  const { best } = matchProfiles(file, profile('generico'));
  assert.deepEqual(best.mapping.description, [1, 3]);
});

test('una colonna presa da un campo non finisce anche in un altro', () => {
  // Fineco ha due colonne di testo: la corta fa da tipologia, la lunga da
  // descrizione. Nessuna delle due viene usata due volte.
  const file = rows([
    'Data Operazione;Data Valuta;Entrate;Uscite;Descrizione;Descrizione Completa',
    '12/03/2026;12/03/2026;;45,20;POS;ESSELUNGA MILANO',
  ].join('\n'));
  const { best } = matchProfiles(file, profile('fineco'));
  assert.equal(best.mapping.tipologia, 4);
  assert.deepEqual(best.mapping.description, [5]);
});

test('i nomi di colonna si confrontano senza accenti, maiuscole e punteggiatura', () => {
  assert.equal(normalizeHeader('  Descrizione Operazione* '), 'descrizione operazione');
  assert.equal(normalizeHeader('Valuta'), 'valuta');
  const file = rows('DATA_CONTABILE|DESCRIZIONE|IMPORTO\n12/03/2026|SPESA|-10,00');
  const { best } = matchProfiles(file, profili());
  assert.equal(best.delimiter, '|');
  assert.equal(best.mapping.amount, 2);
});

test('un file senza colonne riconoscibili non viene importato', () => {
  const file = rows('pippo;pluto;paperino\n1;2;3');
  const outcome = matchProfiles(file, profili());
  assert.equal(outcome.best, null);
  // L'errore mostra all'utente cosa c'era scritto nel file.
  assert.deepEqual(outcome.headersSeen[0], ['pippo', 'pluto', 'paperino']);
});

test('il profilo scelto a mano non riconosce un file di un\'altra banca', () => {
  const file = rows('Started Date,Description,Amount\n2026-03-12,SPESA,-10.00');
  assert.equal(matchProfiles(file, profile('sella')).best, null);
  assert.equal(matchProfiles(file, profile('revolut')).best.mapping.amount, 2);
});

test('il modo di leggere l\'importo ripiega su quello che c\'e\' nel file', () => {
  assert.equal(resolveAmountMode('in_out', { outflow: 1 }), 'in_out');
  assert.equal(resolveAmountMode('signed', { amount: 2 }), 'signed');
  // Configurato male: il file comanda.
  assert.equal(resolveAmountMode('in_out', { amount: 2 }), 'signed');
  assert.equal(resolveAmountMode('signed', { outflow: 1, inflow: 2 }), 'in_out');
});

// ─── Codifica e regole di significato, che valgono per tutte le banche ──────

test('un file Windows-1252 non diventa un file di punti interrogativi', () => {
  const text = loadAndDecode(Buffer.from([0x50, 0x45, 0x52, 0xd2]));
  assert.equal(text, 'PERÒ');
  assert.equal(loadAndDecode(Buffer.from('PERÒ', 'utf8')), 'PERÒ');
});

test('la categoria proposta arriva dalla tipologia o dal codice MCC', () => {
  assert.equal(classifyExpense('Stipendi', 'ACCREDITO'), 'Trasferimenti');
  assert.equal(classifyExpense('', 'PAGAMENTO POS ESSELUNGA COD. MCC 5411'), 'Spesa');
  assert.equal(classifyExpense('', 'PRELIEVO DI CONTANTE'), 'Prelievo contante');
  assert.equal(classifyExpense('', 'QUALCOSA DI IGNOTO'), 'Pagamenti');
});

test('la controparte si pesca dalla descrizione, o non si pesca', () => {
  assert.equal(extractCounterparty('Bonifici', 'A FAV. MARIO ROSSI BONIFICO', 'expense'), 'Mario Rossi');
  assert.equal(extractCounterparty('', 'PRELIEVO DI CONTANTE C/O BANCA X', 'expense'), null);
});

// Le forme che scrive Mediolanum, prese dall'estratto conto vero.
test('il bonifico in uscita di Mediolanum non e\' intestato alla formula', () => {
  assert.equal(
    extractCounterparty('Bonifici', 'VOSTRA DISPOSIZIONE BIANCHI LUIGI BONIFICO DISPOSTO IN: INTERNET COOR.BENEF.: IT38 H030 NOTE: PARCHEGGIO', 'expense'),
    'Bianchi Luigi',
  );
  assert.equal(
    extractCounterparty('Bonifici', 'VOSTRA DISPOSIZIONE A FAV. ANGELA GOBBI BONIFICO DISPOSTO IN: INTERNET', 'expense'),
    'Angela Gobbi',
  );
});

test('il negozio si stacca dall\'indirizzo e da quel che la banca aggiunge dopo', () => {
  // Pagamento NFC a Venezia: dopo il negozio c'e' il sestiere, poi un trattino
  // e "SAMSUNG PAY". Prima di questa regola il fornitore risultava "Prel".
  assert.equal(
    extractCounterparty(
      'Prelievi - Pagamenti',
      'NFC -PREL./PAGAM. CARTA EUROPAY N. 5266981 DEL 31/10/22 22:02 IN ITALIA A VENEZIA ITA VALUTA EUR '
      + 'PAESE ITALIA C/O OLD WILD WEST SESTIERE CANNA PAGAMENTO NFC - SAMSUNG PAY COD. MCC 5814 000010420581',
      'expense',
    ),
    'Old Wild West',
  );
});

test('si riconosce un nome che e\' gergo della banca', () => {
  // La stessa regola serve a due cose: non proporre questi nomi, e ritrovare
  // quelli finiti in anagrafica prima che la regola esistesse.
  for (const n of ['Prel', 'Bonifico', 'Vostra Disposizione', 'Carta Di Debito',
    'Pagamenti Paesi Ue Carta', 'Trasferimento', 'IMPOSTA DI BOLLO']) {
    assert.equal(looksLikeBankJargon(n), true, n);
  }
  for (const n of ['Old Wild West', 'Poste Italiane', 'Verdi Anna', 'Supermercato Coop', 'Postemobile']) {
    assert.equal(looksLikeBankJargon(n), false, n);
  }
});

test('il gergo della banca non diventa un fornitore', () => {
  // Meglio nessun nome che un nome sbagliato: quello giusto si mette a mano
  // una volta, quello sbagliato va tolto da ogni movimento.
  assert.equal(extractCounterparty('Prelievi - Pagamenti', 'NFC -PREL./PAGAM. CARTA EUROPAY N. 5266981', 'expense'), null);
  assert.equal(extractCounterparty('Prelievi - Pagamenti', 'PAGAMENTI PAESI NON UE VALUTA EUR', 'expense'), null);
});

test('i movimenti del dossier titoli non hanno un fornitore', () => {
  assert.equal(
    extractCounterparty('Acquisti - Aggiuntivi', 'ACQUISTO TITOLI PER CONTANTI 30/12 001/41278450/000 QTA: 5 TITOLO : ETFS INVESC GOLD MTF', 'expense'),
    null,
  );
});

test('il negozio finisce dove comincia il numero della carta', () => {
  const carta = 'CARTA N. 537572******5048 - CIRCUITO MASTERCARD COD. MCC 5542 000010420581';
  assert.equal(
    extractCounterparty('Prelievi - Pagamenti', `PAGAMENTI PAESI UE CARTA N. 000 DEL 25/07/26 VALUTA EUR PAESE ITALIA C/O R8 VIGONOVO ${carta}`, 'expense'),
    'R8 Vigonovo',
  );
  // L'asterisco fa parte del nome del negozio, non lo interrompe.
  assert.equal(
    extractCounterparty('Prelievi - Pagamenti', `PAGAMENTI PAESI NON UE ... C/O ANTHROPIC* CLAUDE SUB SAN FRANCISCO ${carta}`, 'expense'),
    'Anthropic* Claude Sub San Francisco',
  );
});
