/**
 * Divisione di una spesa in rate — traduce App\Services\InstallmentCalculator.
 *
 * I conti si fanno in centesimi interi: dividere 100,00 in 3 non da' tre volte
 * 33,33 ma 33,34 + 33,33 + 33,33, cosi' la somma delle rate e' esattamente il
 * totale. Il resto va sulla prima.
 */

import { HttpError } from './http.js';

export const FREQUENCIES = ['monthly', 'weekly', 'custom'];
const MIN_COUNT = 2;
const MAX_COUNT = 60;
const MIN_DAYS = 1;
const MAX_DAYS = 365;

export function validateSpec(spec) {
  const count = Number.parseInt(spec?.count ?? 0, 10) || 0;
  if (count < MIN_COUNT || count > MAX_COUNT) {
    throw HttpError.badRequest(`Numero di rate fuori intervallo (ammesso: ${MIN_COUNT}–${MAX_COUNT}).`);
  }

  const frequency = String(spec?.frequency ?? 'monthly');
  if (!FREQUENCIES.includes(frequency)) {
    throw HttpError.badRequest(`Frequenza rate non valida (ammesse: ${FREQUENCIES.join(', ')}).`);
  }

  let customDays = null;
  if (frequency === 'custom') {
    customDays = Number.parseInt(spec?.custom_days ?? 0, 10) || 0;
    if (customDays < MIN_DAYS || customDays > MAX_DAYS) {
      throw HttpError.badRequest(`Giorni tra rate fuori intervallo (ammesso: ${MIN_DAYS}–${MAX_DAYS}).`);
    }
  }

  return { count, frequency, custom_days: customDays };
}

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Aggiunge mesi tenendo il giorno dentro il mese: il 31 gennaio + 1 mese
 * diventa il 28 (o 29) febbraio, non il 3 marzo. Qui il comportamento e'
 * diverso dalle spese ricorrenti, ed e' voluto: una rata deve cadere nel mese
 * che le compete.
 */
function addMonthsClamped(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const totale = y * 12 + (m - 1) + months;
  const nuovoAnno = Math.floor(totale / 12);
  const nuovoMese = (totale % 12) + 1;
  const ultimoGiorno = new Date(Date.UTC(nuovoAnno, nuovoMese, 0)).getUTCDate();
  const giorno = Math.min(d, ultimoGiorno);
  return `${String(nuovoAnno).padStart(4, '0')}-${String(nuovoMese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}

function dateForSeq(start, seq, frequency, customDays) {
  const offset = seq - 1;
  if (offset === 0) return start;
  if (frequency === 'weekly') return addDays(start, offset * 7);
  if (frequency === 'custom') return addDays(start, offset * customDays);
  return addMonthsClamped(start, offset);
}

/** @returns {Array<{seq:number, date:string, amount:string}>} */
export function explodeInstallments(totalAmount, count, startDate, frequency, customDays = null) {
  if (count < MIN_COUNT || count > MAX_COUNT) throw HttpError.badRequest('Numero di rate non valido.');
  if (!FREQUENCIES.includes(frequency)) throw HttpError.badRequest('Frequenza rate non valida.');
  if (frequency === 'custom' && (customDays === null || customDays < 1)) {
    throw HttpError.badRequest('custom_days obbligatorio per frequency=custom.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw HttpError.badRequest('Data iniziale non valida (atteso YYYY-MM-DD).');
  }

  const totale = Number.parseFloat(String(totalAmount).replace(',', '.')) || 0;
  const centesimi = Math.round(totale * 100);
  if (centesimi < count) {
    throw HttpError.badRequest(`Importo troppo piccolo per ${count} rate (minimo 0.01€/rata).`);
  }

  const perRata = Math.floor(centesimi / count);
  const resto = centesimi - perRata * count;

  const rate = [];
  for (let i = 1; i <= count; i++) {
    const importo = perRata + (i === 1 ? resto : 0);
    rate.push({
      seq: i,
      date: dateForSeq(startDate, i, frequency, customDays),
      amount: (importo / 100).toFixed(2),
    });
  }
  return rate;
}
