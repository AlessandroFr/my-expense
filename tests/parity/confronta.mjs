/**
 * Confronta quello che risponde Node con quello che produce PHP, sugli stessi
 * dati e sugli stessi filtri. E' il collaudo della migrazione: finche' i due
 * backend convivono, ogni dominio spostato deve superarlo prima di considerarsi
 * migrato.
 *
 * Serve il server Node avviato (avvia.cmd oppure `node server/index.js`):
 *
 *   node tests/parity/confronta.mjs                  # porta 8080
 *   PORT=8010 node tests/parity/confronta.mjs
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT ?? 8080);

/** Ogni caso: dominio, query per Node, filtri equivalenti per PHP, chiavi da confrontare. */
const CASI = [
  ['accounts', '', {}, ['accounts']],
  ['budgets', 'month=2026-08', { month: '2026-08' }, ['budgets', 'categories']],
  ['expenses', 'limit=50', { limit: 50 }, ['expenses', 'total']],
  ['expenses', 'limit=20&date_from=2024-01-01&date_to=2024-12-31',
    { limit: 20, date_from: '2024-01-01', date_to: '2024-12-31' }, ['expenses', 'total']],
  ['expenses', 'limit=20&search=a', { limit: 20, search: 'a' }, ['expenses', 'total']],
  ['expenses', 'limit=20&amount_min=50&amount_max=500',
    { limit: 20, amount_min: '50', amount_max: '500' }, ['expenses', 'total']],
  ['expenses', 'limit=10&offset=30', { limit: 10, offset: 30 }, ['expenses', 'total']],
  ['expenses', 'limit=500', { limit: 500 }, ['expenses', 'total']],
  ['incomes', 'limit=50', { limit: 50 }, ['incomes', 'total', 'sources']],
  ['transfers', 'limit=100', { limit: 100 }, ['transfers', 'total']],
  ['contacts', 'page=1&page_size=25', { page: 1, page_size: 25 }, ['contacts', 'total']],
  ['contacts', 'page=2&page_size=25', { page: 2, page_size: 25 }, ['contacts', 'total']],
  ['contacts', 'page=1&page_size=25&search=amazon', { page: 1, page_size: 25, search: 'amazon' }, ['contacts', 'total']],
  ['contacts-balance', 'from=2020-01-01&to=2030-12-31', { from: '2020-01-01', to: '2030-12-31' }, ['summary']],
  ['transfers', 'limit=20&account_id=3', { limit: 20, account_id: 3 }, ['transfers', 'total']],
  ['incomes', 'limit=20&search=bonifico', { limit: 20, search: 'bonifico' }, ['incomes', 'total']],
  ['incomes', 'limit=500', { limit: 500 }, ['incomes', 'total', 'sources']],
];

const daPhp = (dominio, filtri) =>
  JSON.parse(execFileSync('php', [join(root, 'tests/parity/php-query.php'), dominio, JSON.stringify(filtri)],
    { encoding: 'utf8', cwd: root }));

/** I domini con un trattino puntano a un endpoint diverso da /list. */
const percorso = (dominio) => (dominio.includes('-')
  ? `/${dominio.split('-')[0]}/${dominio.split('-').slice(1).join('-')}`
  : `/${dominio}/list`);

const daNode = async (dominio, query) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${percorso(dominio)}${query ? `?${query}` : ''}`);
  const body = await res.json();
  if (!body.ok) throw new Error(`${dominio}: ${body.error?.message}`);
  return body.data;
};

let ok = 0;
let diff = 0;

for (const [dominio, query, filtri, chiavi] of CASI) {
  const etichetta = `${dominio} ${query}`.trim();
  let php;
  let node;
  try {
    php = daPhp(dominio, filtri);
    node = await daNode(dominio, query);
  } catch (err) {
    console.log(`  ERRORE ${etichetta.padEnd(50)} ${err.message}`);
    diff++;
    continue;
  }

  const differenti = chiavi.filter((k) => JSON.stringify(php[k]) !== JSON.stringify(node[k]));
  if (differenti.length === 0) {
    const n = Array.isArray(php[chiavi[0]]) ? php[chiavi[0]].length : 1;
    console.log(`  OK     ${etichetta.padEnd(50)} ${n} righe`);
    ok++;
    continue;
  }

  console.log(`  DIVERSO ${etichetta.padEnd(49)} campi: ${differenti.join(', ')}`);
  diff++;
  for (const k of differenti) {
    const a = php[k];
    const b = node[k];
    if (!Array.isArray(a) || !Array.isArray(b)) {
      console.log(`         php : ${JSON.stringify(a)}`);
      console.log(`         node: ${JSON.stringify(b)}`);
      continue;
    }
    if (a.length !== b.length) console.log(`         lunghezze diverse: php ${a.length}, node ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const x = JSON.stringify(a[i]);
      const y = JSON.stringify(b[i]);
      if (x !== y) {
        console.log(`         prima differenza alla riga ${i}:`);
        console.log(`           php : ${x}`);
        console.log(`           node: ${y}`);
        break;
      }
    }
  }
}

console.log(`\n${ok} confronti identici, ${diff} differenze`);
process.exit(diff === 0 ? 0 : 1);
