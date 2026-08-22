// ─── format.js ───────────────────────────────────────────────────────────────
// Come si scrivono numeri, soldi e date, e come si legge il token CSRF.
//
// Erano quindici copie della stessa riga sparse per le pagine: bastava che una
// avesse un'opzione diversa perche' lo stesso importo comparisse in due modi.
// Le date restano in gg/mm/aaaa, che e' come si leggono qui.

const moneyFmt = new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });

/** Un importo con il simbolo dell'euro. Quel che non e' un numero vale zero. */
export const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

/** Un numero con al massimo `dec` decimali (le quote di un fondo ne vogliono sei). */
export const fmtNum = (n, dec = 4) => (Number(n) || 0).toLocaleString('it-IT', { maximumFractionDigits: dec });

/**
 * Una data ISO in gg/mm/aaaa. La mezzanotte locale evita che il fuso sposti
 * il giorno indietro; se la data non si legge, si mostra com'era.
 */
export function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(`${String(iso)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? String(iso) : dateFmt.format(d);
}

/** Il token CSRF dal cookie, da rimandare come header a ogni scrittura. */
export function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
}
