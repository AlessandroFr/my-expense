/**
 * I profili di tracciato degli estratti conto: uno per banca.
 *
 * Ogni banca esporta i movimenti a modo suo — colonne diverse, in ordine
 * diverso, con nomi diversi. Un profilo dice **come si chiamano le colonne di
 * quella banca**, non dove stanno: le colonne si riconoscono per nome, cosi'
 * un file con le stesse colonne in ordine diverso viene letto giusto invece
 * che letto storto in silenzio.
 *
 * Modulo puro: qui dentro non si tocca il database (quello e'
 * routes/bank-profiles.js), si legge solo testo.
 */

/** I campi che un tracciato puo' avere, in ordine di priorita' di assegnazione. */
export const FIELDS = ['op_date', 'value_date', 'tipologia', 'description', 'outflow', 'inflow', 'amount'];

export const FIELD_LABELS = {
  op_date: 'Data operazione',
  value_date: 'Data valuta',
  tipologia: 'Tipologia',
  description: 'Descrizione',
  outflow: 'Uscite',
  inflow: 'Entrate',
  amount: 'Importo con segno',
};

export const DELIMITERS = ['auto', ';', ',', 'tab', '|'];
export const ENCODINGS = ['auto', 'utf-8', 'windows-1252'];
export const AMOUNT_MODES = ['auto', 'in_out', 'signed'];
export const DATE_ORDERS = ['auto', 'dmy', 'ymd', 'mdy'];

/** I separatori da provare quando il profilo dice 'auto'. */
const DELIMITER_CANDIDATES = [';', ',', '\t', '|'];

/** Quante righe in testa al file possono precedere l'intestazione. */
const MAX_HEADER_SCAN = 40;

export const delimiterChar = (d) => (d === 'tab' ? '\t' : d);

/**
 * Nome di colonna in forma confrontabile: senza accenti, senza punteggiatura,
 * minuscolo, spazi collassati. "Data Valuta*" e "data valuta" sono la stessa.
 */
export function normalizeHeader(raw) {
  return String(raw ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ─── I profili che arrivano gia' pronti ─────────────────────────────────────
//
// Quelli con `verified` sono stati provati su un estratto conto vero. Gli
// altri sono compilati sui nomi di colonna tipici di quelle banche e vanno
// controllati la prima volta che si importa — per questo l'anteprima mostra
// sempre la mappatura.

const BUILTIN = [
  {
    key: 'sella', name: 'Banca Sella / Patavina', delimiter: ';', date_order: 'dmy', amount_mode: 'in_out',
    verified: true,
    columns: {
      op_date: ['operazione'], value_date: ['valuta'], tipologia: ['tipologia operazione'],
      description: ['descrizione'], outflow: ['uscite'], inflow: ['entrate'],
    },
  },
  {
    // Mediolanum esporta lo stesso tracciato di Sella: «Operazione» e' la data
    // contabile, non il tipo di movimento. Sui nomi lunghi ('data contabile' e
    // compagnia) non riconosceva niente e il file finiva letto dal profilo
    // Sella. Verificato su estratti veri, 01/2026-07/2026.
    key: 'mediolanum', name: 'Banca Mediolanum', delimiter: ';', date_order: 'dmy', amount_mode: 'in_out',
    verified: true,
    columns: {
      op_date: ['operazione', 'data contabile', 'data operazione', 'data'],
      value_date: ['valuta', 'data valuta'],
      tipologia: ['tipologia operazione', 'tipologia', 'causale'],
      description: ['descrizione', 'descrizione operazione', 'dettagli'],
      outflow: ['uscite', 'addebiti'], inflow: ['entrate', 'accrediti'],
      amount: ['importo'],
    },
  },
  {
    key: 'intesa', name: 'Intesa Sanpaolo',
    columns: {
      op_date: ['data', 'data contabile'], value_date: ['data valuta'],
      tipologia: ['operazione', 'categoria'], description: ['dettagli', 'descrizione'],
      amount: ['importo'],
    },
  },
  {
    key: 'unicredit', name: 'UniCredit',
    columns: {
      op_date: ['data registrazione', 'data contabile'], value_date: ['data valuta'],
      tipologia: ['causale', 'tipologia'], description: ['descrizione', 'descrizione operazione'],
      outflow: ['importo dare', 'dare'], inflow: ['importo avere', 'avere'],
      amount: ['importo'],
    },
  },
  {
    key: 'fineco', name: 'Fineco',
    columns: {
      op_date: ['data operazione', 'data'], value_date: ['data valuta'],
      tipologia: ['descrizione'], description: ['descrizione completa', 'descrizione'],
      outflow: ['uscite'], inflow: ['entrate'], amount: ['importo'],
    },
  },
  {
    key: 'bper', name: 'BPER Banca',
    columns: {
      op_date: ['data contabile', 'data operazione'], value_date: ['data valuta'],
      tipologia: ['causale', 'tipologia'], description: ['descrizione', 'descrizione operazione'],
      outflow: ['dare', 'uscite'], inflow: ['avere', 'entrate'], amount: ['importo'],
    },
  },
  {
    key: 'bancobpm', name: 'Banco BPM',
    columns: {
      op_date: ['data contabile', 'data operazione'], value_date: ['data valuta'],
      tipologia: ['causale'], description: ['descrizione', 'descrizione operazione'],
      outflow: ['dare', 'uscite'], inflow: ['avere', 'entrate'], amount: ['importo'],
    },
  },
  {
    key: 'bnl', name: 'BNL',
    columns: {
      op_date: ['data contabile', 'data'], value_date: ['data valuta'],
      tipologia: ['causale'], description: ['descrizione', 'descrizione operazione'],
      outflow: ['dare', 'uscite'], inflow: ['avere', 'entrate'], amount: ['importo'],
    },
  },
  {
    key: 'bancoposta', name: 'BancoPosta / Poste Italiane',
    columns: {
      op_date: ['data contabile', 'data'], value_date: ['data valuta', 'valuta'],
      tipologia: ['causale'], description: ['descrizione operazioni', 'descrizione'],
      outflow: ['addebiti', 'uscite'], inflow: ['accrediti', 'entrate'], amount: ['importo'],
    },
  },
  {
    key: 'credit-agricole', name: 'Crédit Agricole Italia',
    columns: {
      op_date: ['data contabile', 'data operazione'], value_date: ['data valuta'],
      tipologia: ['causale'], description: ['descrizione', 'descrizione operazione'],
      outflow: ['dare', 'uscite'], inflow: ['avere', 'entrate'], amount: ['importo'],
    },
  },
  {
    key: 'ing', name: 'ING Italia',
    columns: {
      op_date: ['data valuta', 'data'], value_date: ['data valuta'],
      tipologia: ['causale', 'tipo operazione'], description: ['descrizione', 'dettagli'],
      amount: ['importo'],
    },
  },
  {
    key: 'revolut', name: 'Revolut / N26', delimiter: ',', date_order: 'ymd',
    columns: {
      op_date: ['started date', 'completed date', 'booking date', 'value date', 'data'],
      value_date: ['completed date', 'value date'],
      tipologia: ['type', 'transaction type'],
      description: ['description', 'payment reference', 'partner name'],
      amount: ['amount', 'amount eur'],
    },
  },
  {
    // Rete di sicurezza: accetta l'unione dei nomi che girano.
    key: 'generico', name: 'Generico (riconoscimento largo)',
    columns: {
      op_date: ['data operazione', 'data contabile', 'data registrazione', 'data movimento', 'operazione', 'data', 'booking date', 'started date'],
      value_date: ['data valuta', 'valuta', 'value date', 'completed date'],
      tipologia: ['tipologia operazione', 'tipologia', 'causale', 'tipo operazione', 'type'],
      description: ['descrizione completa', 'descrizione operazione', 'descrizione operazioni', 'descrizione', 'dettagli', 'note', 'description', 'memo'],
      outflow: ['uscite', 'uscita', 'addebiti', 'importo dare', 'dare', 'debit'],
      inflow: ['entrate', 'entrata', 'accrediti', 'importo avere', 'avere', 'credit'],
      amount: ['importo', 'importo euro', 'importo eur', 'amount'],
    },
  },
];

/**
 * I nomi di colonna del profilo «Generico»: la pagina dei profili li usa per
 * indovinare i campi quando l'utente incolla la riga di intestazione del suo
 * file.
 */
export const GENERIC_COLUMNS = BUILTIN.find((p) => p.key === 'generico').columns;

/** I preimpostati in forma di riga, pronti per l'INSERT o per il ripristino. */
export const builtinProfiles = () => BUILTIN.map((p, i) => ({
  builtin_key: p.key,
  name: p.name,
  delimiter: p.delimiter ?? 'auto',
  encoding: p.encoding ?? 'auto',
  amount_mode: p.amount_mode ?? 'auto',
  date_order: p.date_order ?? 'auto',
  columns_json: JSON.stringify(p.columns),
  notes: p.verified ? null : 'Tracciato preimpostato, non verificato su un file reale: controlla la mappatura in anteprima.',
  sort_order: i * 10,
}));

// ─── Riconoscimento ─────────────────────────────────────────────────────────

const columnsOf = (profile) => {
  let cols;
  try { cols = JSON.parse(profile.columns_json ?? '{}'); } catch { cols = {}; }
  const out = {};
  for (const f of FIELDS) {
    const v = cols[f];
    out[f] = (Array.isArray(v) ? v : []).map(normalizeHeader).filter((s) => s !== '');
  }
  return out;
};

/**
 * Assegna le colonne del file ai campi del profilo. Una colonna sola per
 * campo (tranne la descrizione, che puo' unirne piu' d'una), e una colonna
 * gia' presa non si riusa: i campi si servono nell'ordine di FIELDS.
 */
function mapColumns(cells, wanted) {
  const taken = new Set();
  const mapping = {};

  for (const field of FIELDS) {
    const names = wanted[field];
    if (names.length === 0) continue;
    const trovate = [];
    // Il primo nome dell'elenco vince sul secondo: sono in ordine di preferenza.
    for (const name of names) {
      for (let i = 0; i < cells.length; i++) {
        if (taken.has(i) || cells[i] !== name) continue;
        taken.add(i);
        trovate.push(i);
        break;
      }
      if (trovate.length > 0 && field !== 'description') break;
    }
    // Le descrizioni spezzate su piu' colonne si uniscono nell'ordine del file,
    // non in quello dei sinonimi.
    if (trovate.length > 0) mapping[field] = field === 'description' ? trovate.sort((a, b) => a - b) : trovate[0];
  }
  return mapping;
}

const count = (mapping) => Object.values(mapping).flat().length;

/** Un tracciato serve a qualcosa solo se c'e' la data e c'e' un importo. */
const isUsable = (mapping) => mapping.op_date !== undefined
  && (mapping.amount !== undefined || mapping.outflow !== undefined || mapping.inflow !== undefined);

/**
 * Prova ogni profilo su ogni riga di intestazione plausibile.
 *
 * @returns {{best: object|null, candidates: object[], headersSeen: string[][]}}
 *   `best` e' `{profile, headerIdx, delimiter, mapping, score, cells}`.
 */
export function matchProfiles(lines, profiles) {
  const esiti = [];
  const headersSeen = [];
  const limite = Math.min(lines.length, MAX_HEADER_SCAN);

  for (let i = 0; i < limite; i++) {
    const row = lines[i] ?? '';
    if (row.trim() === '') continue;

    for (const profile of profiles) {
      const wanted = columnsOf(profile);
      const delimiters = profile.delimiter === 'auto'
        ? DELIMITER_CANDIDATES : [delimiterChar(profile.delimiter)];

      for (const d of delimiters) {
        const grezze = splitHeader(row, d);
        if (grezze.length < 2) continue;
        const cells = grezze.map(normalizeHeader);
        const mapping = mapColumns(cells, wanted);
        if (!isUsable(mapping)) continue;

        esiti.push({
          profile, headerIdx: i, delimiter: d, mapping, cells: grezze,
          score: count(mapping),
          avanzate: cells.filter((c) => c !== '').length - count(mapping),
        });
      }
    }
  }

  // Piu' colonne riconosciute vince; a pari merito, meno colonne del file
  // rimaste fuori; poi l'ordine dei profili, che mette Sella per primo.
  esiti.sort((a, b) => b.score - a.score
    || a.avanzate - b.avanzate
    || (a.profile.sort_order ?? 0) - (b.profile.sort_order ?? 0)
    || a.headerIdx - b.headerIdx);

  // Le intestazioni viste servono al messaggio d'errore quando non matcha niente.
  for (let i = 0; i < limite; i++) {
    const row = lines[i] ?? '';
    if (row.trim() === '') continue;
    const d = DELIMITER_CANDIDATES.map((c) => [c, splitHeader(row, c).length])
      .sort((a, b) => b[1] - a[1])[0];
    if (d[1] >= 1) headersSeen.push(splitHeader(row, d[0]).map((s) => s.trim()).filter((s) => s !== ''));
  }

  return { best: esiti[0] ?? null, candidates: esiti, headersSeen: headersSeen.slice(0, 5) };
}

/**
 * Divide la riga di intestazione. Non usa splitCsvLine perche' qui basta il
 * taglio secco: le intestazioni non contengono separatori quotati, e tenere
 * la funzione qui rende questo modulo indipendente dalle route.
 */
function splitHeader(line, delimiter) {
  return line.split(delimiter).map((c) => c.replace(/^"|"$/g, ''));
}
