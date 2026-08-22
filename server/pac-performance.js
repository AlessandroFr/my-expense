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

const day = 24 * 60 * 60 * 1000;
const toDate = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00Z`).getTime();
const yearsBetween = (da, a) => (toDate(a) - toDate(da)) / (day * 365);
const round2 = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Il valore delle quote a una certa data, cioe' l'ultimo NAV conosciuto fino a
 * quel giorno. Prima del primo NAV non si sa, e non si inventa.
 *
 * @param {{nav_date: string, nav: number}[]} navs ordinati per data crescente
 */
function navOnDay(navs, data) {
  let found = null;
  for (const n of navs) {
    if (toDate(n.nav_date) > toDate(data)) break;
    found = Number(n.nav);
  }
  return found;
}

/**
 * Tutti i NAV che si conoscono, da due fonti: lo storico del fondo e il NAV
 * che ogni versamento si porta dietro. A parita' di data vince lo storico.
 */
export function mergedNavs(navs, contributi) {
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
export function performanceSeries(contributi, navs, today = null) {
  const contributions = [...contributi]
    .filter((c) => c.contribution_date)
    .sort((a, b) => String(a.contribution_date).localeCompare(String(b.contribution_date)));
  if (contributions.length === 0) return [];

  const allNavs = mergedNavs(navs, contributions);
  const primoVersamento = String(contributions[0].contribution_date).slice(0, 10);

  const date = new Set(contributions.map((c) => String(c.contribution_date).slice(0, 10)));
  for (const n of allNavs) if (n.nav_date >= primoVersamento) date.add(n.nav_date);
  if (today) date.add(String(today).slice(0, 10));

  const points = [];
  for (const data of [...date].sort()) {
    let contributed = 0;
    let units = 0;
    for (const c of contributions) {
      if (String(c.contribution_date).slice(0, 10) > data) break;
      contributed += Number(c.amount) || 0;
      units += Number(c.units) || 0;
    }
    const nav = navOnDay(allNavs, data);
    points.push({
      date: data,
      contributed: round2(contributed),
      units: round2(units, 6),
      // Senza NAV il valore non si sa: meglio un buco nel grafico che una
      // linea inventata.
      value: nav !== null && units > 0 ? round2(units * nav) : null,
    });
  }
  return points;
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
export function irr(flows) {
  const f = flows.filter((x) => Number.isFinite(Number(x.amount)) && Number(x.amount) !== 0);
  if (f.length < 2) return null;
  // Serve almeno un'uscita e un'entrata, altrimenti nessun tasso azzera la somma.
  if (!f.some((x) => x.amount < 0) || !f.some((x) => x.amount > 0)) return null;

  const start = f.reduce((min, x) => (x.date < min ? x.date : min), f[0].date);
  const duration = f.map((x) => ({ t: yearsBetween(start, x.date), a: Number(x.amount) }));
  if (duration.every((x) => x.t === 0)) return null;

  // -99,99% e' la perdita quasi totale, +1000% il guadagno oltre il quale la
  // domanda non e' piu' «quanto rende» ma «cosa e' successo».
  const value = (r) => duration.reduce((s, x) => s + x.a / (1 + r) ** x.t, 0);
  let basso = -0.9999;
  let alto = 10;
  let vBasso = value(basso);
  if (vBasso * value(alto) > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mezzo = (basso + alto) / 2;
    const vMezzo = value(mezzo);
    if (vMezzo === 0) return mezzo;
    if (vBasso * vMezzo < 0) { alto = mezzo; } else { basso = mezzo; vBasso = vMezzo; }
  }
  return (basso + alto) / 2;
}

/**
 * Il riepilogo che finisce sotto gli occhi: quanto hai messo, quanto vale,
 * quanto ci hai guadagnato e a che ritmo.
 */
export function summary(contributi, navs, today) {
  const points = performanceSeries(contributi, navs, today);
  const last = [...points].reverse().find((p) => p.value !== null) ?? null;

  // La data del NAV con cui e' stato fatto il conto, che non e' per forza
  // oggi: un NAV vecchio di sei mesi valorizza lo stesso, ma chi legge deve
  // sapere che sta guardando il fondo di sei mesi fa.
  const allNavs = mergedNavs(navs, contributi);
  const navUsed = last === null
    ? null
    : [...allNavs].reverse().find((n) => n.nav_date <= last.date) ?? null;

  const contributed = points.length > 0 ? points[points.length - 1].contributed : 0;
  const units = points.length > 0 ? points[points.length - 1].units : 0;
  const value = last?.value ?? null;

  const flows = contributi.map((c) => ({
    date: String(c.contribution_date).slice(0, 10),
    amount: -(Number(c.amount) || 0),
  }));
  if (value !== null) flows.push({ date: last.date, amount: value });

  return {
    contributed: round2(contributed),
    units: round2(units, 6),
    value,
    value_at: last?.date ?? null,
    nav_at: navUsed?.nav_date ?? null,
    nav: navUsed?.nav ?? null,
    gain: value === null ? null : round2(value - contributed),
    // La percentuale secca sul versato: dice quanto e' cresciuto il montante,
    // non a che ritmo. Per quello c'e' il TIR.
    gain_pct: value === null || contributed === 0 ? null : round2(((value - contributed) / contributed) * 100),
    irr: value === null ? null : (() => {
      const r = irr(flows);
      return r === null ? null : round2(r * 100);
    })(),
    series: points,
  };
}
