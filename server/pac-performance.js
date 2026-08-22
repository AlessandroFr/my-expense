/**
 * L'andamento vero di un piano di accumulo.
 *
 * Il guadagno di un PAC non e' «valore meno versato» diviso il versato: i soldi
 * messi il mese scorso non hanno avuto il tempo di rendere quanto quelli di tre
 * anni fa. La percentuale onesta e' il **tasso interno di rendimento**, che
 * pesa ogni versamento per quanto tempo e' rimasto dentro — e' quello che le
 * banche chiamano rendimento annuo.
 *
 * Modulo puro: date e numeri, nessun database.
 */

const giorno = 24 * 60 * 60 * 1000;
const aData = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00Z`).getTime();
const anni = (da, a) => (aData(a) - aData(da)) / (giorno * 365);
const arrotonda = (n, cifre = 2) => Math.round(n * 10 ** cifre) / 10 ** cifre;

/**
 * Il valore delle quote a una certa data, cioe' l'ultimo NAV conosciuto fino a
 * quel giorno. Prima del primo NAV non si sa, e non si inventa.
 *
 * @param {{nav_date: string, nav: number}[]} navs ordinati per data crescente
 */
function navAlGiorno(navs, data) {
  let trovato = null;
  for (const n of navs) {
    if (aData(n.nav_date) > aData(data)) break;
    trovato = Number(n.nav);
  }
  return trovato;
}

/**
 * Tutti i NAV che si conoscono, da due fonti: lo storico del fondo e il NAV
 * che ogni versamento si porta dietro. A parita' di data vince lo storico.
 */
export function navUnificati(navs, contributi) {
  const perData = new Map();
  for (const c of contributi) {
    if (c.nav === null || c.nav === undefined) continue;
    perData.set(String(c.contribution_date).slice(0, 10), Number(c.nav));
  }
  for (const n of navs) {
    if (n.nav === null || n.nav === undefined) continue;
    perData.set(String(n.nav_date).slice(0, 10), Number(n.nav));
  }
  return [...perData.entries()]
    .map(([nav_date, nav]) => ({ nav_date, nav }))
    .sort((a, b) => a.nav_date.localeCompare(b.nav_date));
}

/**
 * La curva da disegnare: a ogni data utile, quanto avevi versato e quanto
 * valeva. Le due linee insieme sono l'andamento — la distanza fra loro e' il
 * guadagno.
 *
 * @param {{contribution_date: string, amount: number|string, units: number|null, nav: number|null}[]} contributi
 * @param {{nav_date: string, nav: number}[]} navs
 * @param {string} [oggi] per valorizzare anche il giorno corrente
 */
export function andamento(contributi, navs, oggi = null) {
  const versamenti = [...contributi]
    .filter((c) => c.contribution_date)
    .sort((a, b) => String(a.contribution_date).localeCompare(String(b.contribution_date)));
  if (versamenti.length === 0) return [];

  const tuttiNav = navUnificati(navs, versamenti);
  const primoVersamento = String(versamenti[0].contribution_date).slice(0, 10);

  const date = new Set(versamenti.map((c) => String(c.contribution_date).slice(0, 10)));
  for (const n of tuttiNav) if (n.nav_date >= primoVersamento) date.add(n.nav_date);
  if (oggi) date.add(String(oggi).slice(0, 10));

  const punti = [];
  for (const data of [...date].sort()) {
    let versato = 0;
    let quote = 0;
    for (const c of versamenti) {
      if (String(c.contribution_date).slice(0, 10) > data) break;
      versato += Number(c.amount) || 0;
      quote += Number(c.units) || 0;
    }
    const nav = navAlGiorno(tuttiNav, data);
    punti.push({
      date: data,
      versato: arrotonda(versato),
      quote: arrotonda(quote, 6),
      // Senza NAV il valore non si sa: meglio un buco nel grafico che una
      // linea inventata.
      valore: nav !== null && quote > 0 ? arrotonda(quote * nav) : null,
    });
  }
  return punti;
}

/**
 * Tasso interno di rendimento annuo dei flussi (il TIR, o XIRR nei fogli di
 * calcolo): il tasso al quale, scontando ogni versamento dalla sua data, si
 * ottiene il valore di oggi.
 *
 * Si cerca per bisezione invece che con Newton: e' piu' lenta di qualche
 * millesimo di secondo e non diverge mai, che su un numero mostrato come
 * «rendimento» conta di piu'.
 *
 * @param {{date: string, amount: number}[]} flussi negativi in uscita (versamenti),
 *   positivi in entrata (il valore finale, o un disinvestimento).
 * @returns {number|null} il tasso annuo (0.07 = 7%), null se non e' calcolabile.
 */
export function tir(flussi) {
  const f = flussi.filter((x) => Number.isFinite(Number(x.amount)) && Number(x.amount) !== 0);
  if (f.length < 2) return null;
  // Serve almeno un'uscita e un'entrata, altrimenti nessun tasso azzera la somma.
  if (!f.some((x) => x.amount < 0) || !f.some((x) => x.amount > 0)) return null;

  const inizio = f.reduce((min, x) => (x.date < min ? x.date : min), f[0].date);
  const durata = f.map((x) => ({ t: anni(inizio, x.date), a: Number(x.amount) }));
  if (durata.every((x) => x.t === 0)) return null;

  // -99,99% e' la perdita quasi totale, +1000% il guadagno oltre il quale la
  // domanda non e' piu' «quanto rende» ma «cosa e' successo».
  const valore = (r) => durata.reduce((s, x) => s + x.a / (1 + r) ** x.t, 0);
  let basso = -0.9999;
  let alto = 10;
  let vBasso = valore(basso);
  if (vBasso * valore(alto) > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mezzo = (basso + alto) / 2;
    const vMezzo = valore(mezzo);
    if (vMezzo === 0) return mezzo;
    if (vBasso * vMezzo < 0) { alto = mezzo; } else { basso = mezzo; vBasso = vMezzo; }
  }
  return (basso + alto) / 2;
}

/**
 * Il riepilogo che finisce sotto gli occhi: quanto hai messo, quanto vale,
 * quanto ci hai guadagnato e a che ritmo.
 */
export function riepilogo(contributi, navs, oggi) {
  const punti = andamento(contributi, navs, oggi);
  const ultimo = [...punti].reverse().find((p) => p.valore !== null) ?? null;

  // La data del NAV con cui e' stato fatto il conto, che non e' per forza
  // oggi: un NAV vecchio di sei mesi valorizza lo stesso, ma chi legge deve
  // sapere che sta guardando il fondo di sei mesi fa.
  const tuttiNav = navUnificati(navs, contributi);
  const navUsato = ultimo === null
    ? null
    : [...tuttiNav].reverse().find((n) => n.nav_date <= ultimo.date) ?? null;

  const versato = punti.length > 0 ? punti[punti.length - 1].versato : 0;
  const quote = punti.length > 0 ? punti[punti.length - 1].quote : 0;
  const valore = ultimo?.valore ?? null;

  const flussi = contributi.map((c) => ({
    date: String(c.contribution_date).slice(0, 10),
    amount: -(Number(c.amount) || 0),
  }));
  if (valore !== null) flussi.push({ date: ultimo.date, amount: valore });

  return {
    versato: arrotonda(versato),
    quote: arrotonda(quote, 6),
    valore,
    valore_al: ultimo?.date ?? null,
    nav_al: navUsato?.nav_date ?? null,
    nav: navUsato?.nav ?? null,
    guadagno: valore === null ? null : arrotonda(valore - versato),
    // La percentuale secca sul versato: dice quanto e' cresciuto il montante,
    // non a che ritmo. Per quello c'e' il TIR.
    guadagno_pct: valore === null || versato === 0 ? null : arrotonda(((valore - versato) / versato) * 100),
    tir: valore === null ? null : (() => {
      const r = tir(flussi);
      return r === null ? null : arrotonda(r * 100);
    })(),
    serie: punti,
  };
}
