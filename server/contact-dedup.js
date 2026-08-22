/**
 * Trova le anagrafiche che sono la stessa cosa scritta in due modi.
 *
 * Nascono dall'import dell'estratto conto: la banca scrive il negozio come
 * capita ("R8 VIGONOVO", "R8 VIGONOVO CARTA N"), lo tronca a lunghezza fissa
 * ("SUPERMERCATO COOP CAOR" per "…CAORLE") o gli attacca la citta'. Il
 * risultato sono tre fornitori dove ce n'e' uno.
 *
 * Modulo puro: niente database, solo nomi. Chi decide di fondere e' sempre
 * l'utente — qui si propone, non si tocca niente.
 */

/**
 * Sigle societarie e parole di servizio: non distinguono due fornitori.
 *
 * «Coop» qui non c'e' e non deve entrarci: in Italia e' un'insegna, non una
 * forma societaria. Toglierla faceva diventare «Supermercato Coop» un semplice
 * «Supermercato», che si portava dietro il «Supermercato Aurora» di fianco.
 */
const RUMORE = new Set([
  'srl', 'srls', 's', 'r', 'l', 'spa', 'snc', 'sas', 'ss', 'sa',
  'soc', 'societa', 'di', 'de', 'e', 'c', 'da', 'del', 'della', 'the',
]);

/** Minuscolo, senza accenti, senza punteggiatura, spazi collassati. */
export function normalizza(nome) {
  return String(nome ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Il nome ridotto a quel che lo distingue davvero. */
export const nocciolo = (nome) => normalizza(nome)
  .split(' ')
  .filter((t) => t !== '' && !RUMORE.has(t))
  .join(' ');

/**
 * Sotto questa lunghezza «uno comincia con l'altro» non vuol dire niente:
 * "Bar" starebbe dentro mezza rubrica.
 */
const MIN_PREFISSO = 6;

/**
 * Perche' due nomi sono la stessa cosa, o null se non lo sono.
 * Il motivo finisce sotto gli occhi dell'utente: e' lui a decidere.
 */
export function perche(a, b) {
  const na = nocciolo(a);
  const nb = nocciolo(b);
  if (na === '' || nb === '') return null;
  if (na === nb) return 'stesso nome';

  // Nome e cognome scambiati: e' il doppione piu' comune di tutti, perche' la
  // banca scrive «ROSSI MARIO» e la persona si chiama Mario Rossi.
  const ordinato = (s) => s.split(' ').sort().join(' ');
  if (ordinato(na) === ordinato(nb)) return 'nome e cognome invertiti';

  // Stesse lettere, spazi diversi: «MC DONALD'S» e «MCDONALD'S».
  if (na.replace(/ /g, '') === nb.replace(/ /g, '')) return 'stesso nome';

  const [corto, lungo] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (corto.length >= MIN_PREFISSO && lungo.startsWith(corto)) return 'uno comincia con l\'altro';
  return null;
}

/**
 * Raggruppa le anagrafiche che si somigliano.
 *
 * @param {{id:number, name:string, usage_total?:number}[]} contatti
 * @returns {{members:object[], suggested_winner_id:number, reason:string}[]}
 *
 * ponytail: confronto tutti con tutti. Sono le anagrafiche di una persona
 * sola, qualche centinaio: O(n²) qui vuol dire qualche millisecondo. Se un
 * giorno fossero decine di migliaia, la strada e' indicizzare per prima
 * parola e confrontare solo dentro il secchio.
 */
export function gruppiDoppioni(contatti) {
  const items = contatti.filter((c) => nocciolo(c.name) !== '');
  const padre = items.map((_, i) => i);
  const radice = (i) => (padre[i] === i ? i : (padre[i] = radice(padre[i])));
  const motivi = new Map();

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const motivo = perche(items[i].name, items[j].name);
      if (motivo === null) continue;
      const [ri, rj] = [radice(i), radice(j)];
      if (ri !== rj) padre[rj] = ri;
      // Il motivo del gruppo e' il primo trovato: «stesso nome» e' piu' forte
      // e non deve essere sovrascritto da un prefisso trovato dopo.
      const r = radice(i);
      if (!motivi.has(r) || motivo === 'stesso nome') motivi.set(r, motivo);
    }
  }

  const perRadice = new Map();
  items.forEach((c, i) => {
    const r = radice(i);
    if (!perRadice.has(r)) perRadice.set(r, []);
    perRadice.get(r).push(c);
  });

  const gruppi = [];
  for (const [r, membri] of perRadice) {
    if (membri.length < 2) continue;
    // Vince chi ha piu' movimenti: e' l'anagrafica che l'utente usa davvero.
    // A pari movimenti il nome piu' corto, che di solito e' quello pulito.
    const ordinati = [...membri].sort((a, b) => (b.usage_total ?? 0) - (a.usage_total ?? 0)
      || a.name.length - b.name.length
      || a.id - b.id);
    gruppi.push({
      members: ordinati,
      suggested_winner_id: ordinati[0].id,
      reason: motivi.get(r) ?? 'stesso nome',
    });
  }

  // Prima i gruppi che pesano di piu': piu' anagrafiche, poi piu' movimenti.
  gruppi.sort((a, b) => b.members.length - a.members.length
    || b.members.reduce((s, m) => s + (m.usage_total ?? 0), 0)
     - a.members.reduce((s, m) => s + (m.usage_total ?? 0), 0)
    || a.members[0].name.localeCompare(b.members[0].name));
  return gruppi;
}
