// Le pagine HTML.
//
// Ogni pagina è una funzione che restituisce il contenuto; `page()` lo avvolge
// nel layout comune. I dati che servono al primo rendering (categorie, conti,
// anagrafiche) si leggono qui: il resto lo carica il JS della pagina via JSON.

import { all, one, currentUserId } from '../db.js';
import { HttpError, int, str } from '../http.js';
import { page } from '../view.js';
import { GENERIC_COLUMNS } from '../bank-profiles.js';
import { copiaInChiaro } from '../lock.js';
import { listForUser as profiliBanca } from './bank-profiles.js';

import * as accountsPage from '../pages/accounts.js';
import * as bankProfilesPage from '../pages/bank-profiles.js';
import * as budgetsPage from '../pages/budgets.js';
import * as categoriesPage from '../pages/categories.js';
import * as categoriesEditPage from '../pages/categories-edit.js';
import * as contactsPage from '../pages/contacts.js';
import * as contactsDetailPage from '../pages/contacts-detail.js';
import * as dashboardPage from '../pages/dashboard.js';
import * as expensesPage from '../pages/expenses.js';
import * as incomesPage from '../pages/incomes.js';
import * as pacPage from '../pages/pac.js';
import * as pacPlanPage from '../pages/pac-plan.js';
import * as recurringPage from '../pages/recurring.js';
import * as reportsPage from '../pages/reports.js';
import * as securitiesPage from '../pages/securities.js';
import * as securitiesInstrumentPage from '../pages/securities-instrument.js';
import * as settingsPage from '../pages/settings.js';
import * as transfersPage from '../pages/transfers.js';
import * as wikiPage from '../pages/wiki.js';

const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];
const PAYMENT_LABELS = { cash: 'Contanti', card: 'Carta', transfer: 'Bonifico', other: 'Altro' };

const today = () => new Date().toISOString().slice(0, 10);

const username = () => one('SELECT username FROM users ORDER BY id LIMIT 1')?.username ?? '';

const categoriesForUser = (userId) => all(
  `SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
   FROM categories WHERE user_id = ? ORDER BY sort_order ASC, name ASC`, userId,
);

const activeAccounts = (userId) => all(
  `SELECT id, name, type, color, icon, opening_balance, iban, bic, bank_name,
          account_holder, account_number, notes, archived, is_default_cash,
          sort_order, created_at, updated_at
   FROM accounts WHERE user_id = ? AND archived = 0 ORDER BY sort_order ASC, name ASC`, userId,
);

const contactsForUser = (userId) => all(
  `SELECT id, name, name_norm, type, vat_number, iban, email, notes, color,
          archived, created_at, updated_at
   FROM contacts WHERE user_id = ? AND archived = 0 ORDER BY name ASC`, userId,
);

const defaultCashAccount = (userId) => one(
  `SELECT id, user_id, name, type, color, icon, opening_balance, archived, is_default_cash, sort_order
   FROM accounts WHERE user_id = ? AND type = 'cash'
   ORDER BY is_default_cash DESC, sort_order ASC, id ASC LIMIT 1`, userId,
);

/** Manda la pagina al browser, insieme al cookie col token CSRF. */
function sendHtml(res, html, csrfToken) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    // Leggibile da JS di proposito: FetchRequest.js lo rimanda come header.
    'Set-Cookie': `csrf_token=${csrfToken}; Path=/; SameSite=Lax`,
  });
  res.end(body);
}

/**
 * Costruisce la funzione che serve una pagina.
 * `dati` riceve (userId, req) e restituisce quel che serve al template.
 */
const pageHandler = (title, pageModule, dati = () => ({})) => async (req, res) => {
  const userId = currentUserId();
  const { pathname } = new URL(req.url, 'http://localhost');
  const csrfToken = req.csrfToken;

  const content = pageModule.render({ csrfToken, ...dati(userId, req) });
  sendHtml(res, page({ title, path: pathname, username: username(), csrfToken, content }), csrfToken);
};

const dashboard = pageHandler('Dashboard', dashboardPage, () => ({ username: username() }));

export const pageRoutes = {
  'GET /': dashboard,
  'GET /dashboard': dashboard,

  'GET /expenses': pageHandler('Spese', expensesPage, (userId) => ({
    categories: categoriesForUser(userId),
    accounts: activeAccounts(userId),
    bankProfiles: profiliBanca(userId),
    contacts: contactsForUser(userId),
    defaultCash: defaultCashAccount(userId),
    today: today(),
    paymentMethods: PAYMENT_METHODS,
    paymentLabels: PAYMENT_LABELS,
  })),

  'GET /incomes': pageHandler('Entrate', incomesPage, (userId) => ({
    accounts: activeAccounts(userId),
    contacts: contactsForUser(userId),
    today: today(),
  })),

  'GET /categories': pageHandler('Categorie', categoriesPage, (userId) => ({
    categories: categoriesForUser(userId),
  })),

  'GET /categories/edit': pageHandler('Modifica categoria', categoriesEditPage, (userId, req) => {
    const id = int(new URL(req.url, 'http://localhost').searchParams.get('id'));
    return {
      cat: one(
        `SELECT id, user_id, name, color, icon, sort_order, created_at, updated_at
         FROM categories WHERE id = ? AND user_id = ? LIMIT 1`, id, userId,
      ),
    };
  }),

  'GET /budgets': pageHandler('Budget mensili', budgetsPage, () => ({
    currentMonth: new Date().toISOString().slice(0, 7),
  })),

  'GET /accounts': pageHandler('Conti', accountsPage, (userId) => ({
    bankProfiles: profiliBanca(userId),
  })),

  'GET /bank-profiles': pageHandler('Profili banca', bankProfilesPage, (userId) => ({
    profiles: profiliBanca(userId),
    genericColumns: GENERIC_COLUMNS,
  })),
  'GET /transfers': pageHandler('Trasferimenti', transfersPage, (userId) => ({
    accounts: activeAccounts(userId),
  })),

  'GET /recurring': pageHandler('Spese ricorrenti', recurringPage, (userId) => ({
    contacts: contactsForUser(userId),
    today: today(),
  })),

  'GET /contacts': pageHandler('Anagrafiche', contactsPage),
  'GET /contacts/detail': pageHandler('Anagrafica', contactsDetailPage, (userId, req) => {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const id = int(params.get('id'));
    const year = int(params.get('year'), new Date().getFullYear());
    return {
      contact: one(
        `SELECT id, user_id, name, name_norm, type, vat_number, iban, email, notes,
                color, archived, created_at, updated_at
         FROM contacts WHERE id = ? AND user_id = ? LIMIT 1`, id, userId,
      ),
      year,
    };
  }),

  'GET /securities': pageHandler('Investimenti', securitiesPage),
  'GET /securities/instrument': pageHandler('Strumento', securitiesInstrumentPage, (userId, req) => {
    const id = int(new URL(req.url, 'http://localhost').searchParams.get('id'));
    const instrument = one(
      `SELECT s.id, s.name, s.isin, s.ticker, s.currency, s.notes, s.archived,
              s.account_id, s.asset_class_id,
              ac.name AS asset_class_name, ac.color AS asset_class_color,
              a.name AS account_name
       FROM securities_instruments s
       LEFT JOIN asset_classes ac ON ac.id = s.asset_class_id
       LEFT JOIN accounts a ON a.id = s.account_id
       WHERE s.id = ? AND s.user_id = ? LIMIT 1`, id, userId,
    );
    if (!instrument) throw HttpError.notFound('Strumento non trovato.');
    return { instrument };
  }),

  'GET /pac': pageHandler('Piani di Accumulo', pacPage),
  'GET /pac/plan': pageHandler('Piano di Accumulo', pacPlanPage, (userId, req) => {
    const id = int(new URL(req.url, 'http://localhost').searchParams.get('id'));
    const plan = one(
      `SELECT p.id, p.name, p.frequency, p.amount, p.fund_id, p.source_account_id,
              p.account_id, p.active, p.start_date, p.end_date,
              f.name AS fund_name, ac.name AS asset_class_name, ac.color AS asset_class_color
       FROM pac_plans p
       INNER JOIN pac_funds f ON f.id = p.fund_id
       LEFT JOIN asset_classes ac ON ac.id = f.asset_class_id
       WHERE p.id = ? AND p.user_id = ? LIMIT 1`, id, userId,
    );
    if (!plan) throw HttpError.notFound('Piano non trovato.');
    const labels = { weekly: 'Settimanale', monthly: 'Mensile', quarterly: 'Trimestrale', yearly: 'Annuale' };
    return { plan, freqLabel: labels[plan.frequency] ?? plan.frequency };
  }),

  'GET /reports': pageHandler('Report annuale', reportsPage, () => ({
    thisYear: new Date().getFullYear(),
  })),

  'GET /settings': pageHandler('Impostazioni', settingsPage, () => ({
    copiaInChiaro: copiaInChiaro(),
  })),
  'GET /wiki': pageHandler('Guida', wikiPage),
};
