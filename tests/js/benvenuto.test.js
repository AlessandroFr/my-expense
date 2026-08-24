// Il primo avvio, dal cancello chiuso all'app pronta.
//
// È il pezzo che ogni persona a cui l'app viene data vede una volta sola, e
// quella volta deve funzionare: qui si prova il giro intero passando dagli
// endpoint veri, perché il rischio non è nel singolo pezzo ma nell'ordine —
// che una pagina si apra prima di aver dato la password, che l'utente venga
// creato due volte, che il conto nasca senza valuta.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MY_EXPENSE_DATA_DIR = mkdtempSync(join(tmpdir(), 'my-expense-benv-'));
process.env.MY_EXPENSE_SCRYPT_N = String(2 ** 14);

const { start } = await import('../../server/index.js');
const { one, all } = await import('../../server/db.js');

const { url, close } = await start(0);
const base = url.replace(/\/$/, '');

let cookie = '';

/** Una richiesta come la farebbe il browser: cookie di sessione compreso. */
async function chiama(percorso, opzioni = {}) {
  const risposta = await fetch(base + percorso, {
    redirect: 'manual',
    ...opzioni,
    headers: { ...(opzioni.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  const set = risposta.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { stato: risposta.status, dove: risposta.headers.get('location'), corpo: await risposta.text() };
}

const pagina = (p) => chiama(p, { headers: { accept: 'text/html' } });
const json = (p) => chiama(p, { headers: { accept: 'application/json' } });

const invia = async (percorso, dati) => {
  const r = await chiama(percorso, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...dati, _csrf: cookie.split('=')[1] }),
  });
  return { ...r, dati: JSON.parse(r.corpo) };
};

test('a freddo ogni strada porta al benvenuto', async () => {
  // Il cookie CSRF nasce alla prima pagina servita.
  const primo = await pagina('/benvenuto');
  assert.equal(primo.stato, 200);
  assert.match(primo.corpo, /data-modo="nuovo"/);

  assert.deepEqual(
    (await pagina('/dashboard')),
    { stato: 302, dove: '/benvenuto', corpo: '' },
  );
  assert.equal((await pagina('/settings')).dove, '/benvenuto');
  assert.equal((await pagina('/expenses')).dove, '/benvenuto');
});

test('una chiamata del frontend a database chiuso riceve un no, non una pagina', async () => {
  const r = await json('/expenses/list');
  assert.equal(r.stato, 423);
  const corpo = JSON.parse(r.corpo);
  assert.equal(corpo.ok, false);
  assert.equal(corpo.error.code, 'locked');
  assert.equal(corpo.error.redirect, '/benvenuto');
});

test('la password corta non basta', async () => {
  const r = await invia('/sicurezza/proteggi', { password: 'corta' });
  assert.equal(r.stato, 400);
  assert.match(r.dati.error.message, /almeno 8/);
});

test('creata la protezione, esce la chiave di recupero', async () => {
  const r = await invia('/sicurezza/proteggi', { password: 'la-mia-password' });
  assert.equal(r.stato, 200);
  assert.match(r.dati.data.chiaveRecupero, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/);

  // Due volte no: la seconda cancellerebbe la chiave della prima.
  assert.equal((await invia('/sicurezza/proteggi', { password: 'un-altra-ancora' })).stato, 409);
});

test('finché la procedura non è finita, l\'app non si apre', async () => {
  assert.equal((await pagina('/dashboard')).dove, '/benvenuto');
  assert.match((await pagina('/benvenuto')).corpo, /data-modo="da-configurare"/);
});

test('la valuta dev\'essere una sigla di tre lettere', async () => {
  const r = await invia('/sicurezza/completa', {
    username: 'Mario', base_currency: 'euro',
    conto_nome: 'Conto', conto_tipo: 'checking', conto_valuta: 'EUR', conto_saldo: '0',
  });
  assert.equal(r.stato, 400);
  assert.match(r.dati.error.message, /tre lettere/);
});

test('finita la procedura ci sono l\'utente, il conto e le categorie di partenza', async () => {
  const r = await invia('/sicurezza/completa', {
    username: 'Mario', base_currency: 'CHF',
    conto_nome: 'Conto svizzero', conto_tipo: 'checking', conto_valuta: 'CHF',
    conto_saldo: '1.234,50',
  });
  assert.equal(r.stato, 200);

  assert.deepEqual(
    one('SELECT username, base_currency FROM users'),
    { username: 'Mario', base_currency: 'CHF' },
  );
  assert.deepEqual(
    one('SELECT name, currency, opening_balance FROM accounts'),
    // Il saldo scritto come si legge in banca, migliaia comprese: con il
    // vecchio parser sarebbero stati 1,23 euro.
    { name: 'Conto svizzero', currency: 'CHF', opening_balance: 1234.5 },
  );
  assert.ok(all('SELECT id FROM categories').length >= 5, 'si parte con delle categorie');
});

test('adesso l\'app si apre, e il benvenuto non si ripresenta', async () => {
  const dashboard = await pagina('/dashboard');
  assert.equal(dashboard.stato, 200);
  assert.match(dashboard.corpo, /Mario/);

  assert.equal((await pagina('/benvenuto')).dove, '/dashboard');
  assert.equal((await pagina('/sblocca')).dove, '/dashboard');
  // Rifare la procedura creerebbe un secondo utente, e tutti i dati sono
  // agganciati al primo: il secondo giro si rifiuta.
  assert.equal((await invia('/sicurezza/completa', { base_currency: 'EUR', conto_valuta: 'EUR' })).stato, 409);
  assert.equal(all('SELECT id FROM users').length, 1);
});

test.after(() => close());
