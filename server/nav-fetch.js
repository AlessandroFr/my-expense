/**
 * Le quotazioni dei fondi, prese da Internet invece che a mano.
 *
 * E' l'unica cosa del server che esce dal computer, e lo fa solo quando
 * l'utente preme il bottone: nessun aggiornamento in sottofondo, nessuna
 * chiamata all'avvio. Quel che parte e' un ISIN o un simbolo di borsa, niente
 * di personale.
 *
 * La fonte e' Yahoo Finance, che non ha una API dichiarata: puo' cambiare da un
 * giorno all'altro. Per questo il NAV a mano resta, e resta la strada
 * principale — questa e' una comodita', non una dipendenza. Se smette di
 * funzionare, l'unica cosa che si rompe e' il bottone.
 *
 * Niente pacchetti: `fetch` e' nella libreria standard di Node.
 */

const CERCA = 'https://query1.finance.yahoo.com/v1/finance/search';
const STORICO = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Senza uno User-Agent da browser la risposta e' un 429.
const TESTATE = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

/** Piazze europee in euro, in ordine di preferenza per chi investe in Italia. */
const BORSE_PREFERITE = ['.MI', '.DE', '.AS', '.PA'];

/** Gli stessi mercati come li chiama la ricerca, che non sempre dice la valuta. */
const MERCATI_PREFERITI = ['MIL', 'GER', 'AMS', 'PAR', 'EBS'];

class NavError extends Error {}
export { NavError };

/**
 * Fra i risultati della ricerca, il titolo da usare.
 *
 * Lo stesso ETF e' quotato su piu' borse e in valute diverse: preso quello
 * sbagliato, i NAV sarebbero in dollari e il piano risulterebbe cresciuto o
 * calato per il cambio. Si preferisce Milano, poi le altre piazze europee.
 */
export function symbolCandidates(quotes, valuta = 'EUR') {
  const utili = (quotes ?? []).filter((q) => q && q.symbol);
  const perValuta = utili.filter((q) => !q.currency || q.currency.toUpperCase() === valuta.toUpperCase());
  const list = perValuta.length > 0 ? perValuta : utili;

  // La ricerca non dice sempre la valuta, ma dice la borsa: vale come indizio.
  const punteggio = (q) => {
    const symbol = String(q.symbol).toUpperCase();
    const i = BORSE_PREFERITE.findIndex((s) => symbol.endsWith(s));
    if (i >= 0) return i;
    const m = MERCATI_PREFERITI.indexOf(String(q.exchange ?? '').toUpperCase());
    return m >= 0 ? m : 90;
  };
  return [...list]
    .sort((a, b) => punteggio(a) - punteggio(b))
    .map((q) => q.symbol);
}

/** Il migliore fra i candidati, o null se non c'e' niente. */
export const pickSymbol = (quotes, valuta = 'EUR') => symbolCandidates(quotes, valuta)[0] ?? null;

/**
 * Le quotazioni dentro la risposta del grafico.
 *
 * I giorni senza scambi arrivano con la chiusura a `null`: vanno buttati, non
 * riportati come quotazione zero.
 */
export function seriesFromChart(json) {
  const res = json?.chart?.result?.[0];
  if (!res) {
    const error = json?.chart?.error?.description;
    throw new NavError(error ? `La borsa risponde: ${error}` : 'Risposta della borsa non leggibile.');
  }
  const tempi = res.timestamp ?? [];
  const chiusure = res.indicators?.quote?.[0]?.close ?? [];

  const points = [];
  for (let i = 0; i < tempi.length; i++) {
    const value = chiusure[i];
    if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) continue;
    points.push({
      nav_date: new Date(tempi[i] * 1000).toISOString().slice(0, 10),
      nav: Number(value.toFixed(6)),
    });
  }
  return {
    symbol: res.meta?.symbol ?? null,
    currency: (res.meta?.currency ?? '').toUpperCase() || null,
    points,
  };
}

async function readJson(url) {
  let response;
  try {
    response = await fetch(url, { headers: TESTATE, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    throw new NavError(`Internet non raggiungibile (${err.message}).`);
  }
  if (!response.ok) throw new NavError(`La borsa risponde ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new NavError('La borsa ha risposto qualcosa che non e\' leggibile.');
  }
}

/**
 * I titoli che corrispondono a un ISIN, dal piu' probabile in giu'.
 *
 * Sono piu' d'uno di proposito: lo stesso ETF e' quotato su piu' borse, e la
 * ricerca spesso non dice in che valuta. Chi chiama li prova in ordine e tiene
 * il primo che quota nella valuta giusta.
 */
export async function symbolsFromIsin(isin, valuta = 'EUR') {
  const cerca = async (q) => (await readJson(`${CERCA}?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`))?.quotes ?? [];

  const perIsin = await cerca(isin);
  const found = symbolCandidates(perIsin, valuta);
  if (found.length === 0) throw new NavError(`Nessun titolo trovato per l'ISIN ${isin}.`);

  // Cercando l'ISIN spesso esce una borsa sola, e non e' detto sia quella
  // giusta: dell'iShares Core MSCI World, per dire, viene fuori solo Londra in
  // dollari. Il nome esteso invece le trova tutte, Milano compresa — quindi si
  // cerca una seconda volta per nome e si accodano gli altri listini.
  const name = perIsin.find((q) => q.longname || q.shortname);
  if (name) {
    try {
      const perNome = symbolCandidates(await cerca(name.longname ?? name.shortname), valuta);
      for (const s of perNome) if (!found.includes(s)) found.push(s);
      // Il piu' probabile torna in testa: l'ordine per borsa vale su tutti.
      return symbolCandidates(found.map((symbol) => ({ symbol })), valuta);
    } catch { /* la seconda ricerca e' un di piu': se fallisce restano i primi */ }
  }
  return found;
}

/**
 * Lo storico delle quotazioni di un titolo.
 *
 * @param {string} symbol simbolo di borsa (es. SWDA.MI)
 * @param {string} [da] data ISO da cui partire; senza, gli ultimi due anni
 */
export async function priceHistory(symbol, da = null) {
  const periodo = da
    ? `period1=${Math.floor(new Date(`${da}T00:00:00Z`).getTime() / 1000)}&period2=${Math.floor(Date.now() / 1000)}`
    : 'range=2y';
  const url = `${STORICO}/${encodeURIComponent(symbol)}?${periodo}&interval=1d`;
  return seriesFromChart(await readJson(url));
}
