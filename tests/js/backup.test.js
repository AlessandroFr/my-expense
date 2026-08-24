// Backup e ripristino, andata e ritorno.
//
// Non era coperto da niente, e infatti era rotto in due punti diversi e in
// silenzio: il dump si scriveva in una variabile coperta da un'altra con lo
// stesso nome (quindi non usciva nemmeno un'INSERT), e gli allegati venivano
// riscritti leggendo un campo che non esisteva, dentro un try/catch vuoto —
// tornavano sempre zero file e nessuno se ne accorgeva.
//
// Un backup è l'ultima rete che c'è: che funzioni non si può dedurre, va provato.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MY_EXPENSE_DATA_DIR = mkdtempSync(join(tmpdir(), 'my-expense-backup-'));
process.env.MY_EXPENSE_SCRYPT_N = String(2 ** 14);

const { migrate } = await import('../../database/migrate.js');
const { apri, db, all, one, run } = await import('../../server/db.js');
const { generateSqlDump } = await import('../../server/routes/backup.js');
const { createZip, readZip } = await import('../../server/zip.js');
const vault = await import('../../server/vault.js');
const { uploadsDir } = await import('../../server/paths.js');

const PASSWORD = 'la-password-del-backup';

apri();
migrate(db());
run("INSERT INTO users (username, password_hash) VALUES ('io', '')");
const userId = one('SELECT id FROM users').id;
run(`INSERT INTO categories (user_id, name, color, sort_order) VALUES (?, 'Casa', '#198754', 0)`, userId);
run(`INSERT INTO accounts (user_id, name, type, color, opening_balance, currency, sort_order)
     VALUES (?, 'Conto', 'checking', '#6c757d', '1000.00', 'EUR', 0)`, userId);
const conto = one('SELECT id FROM accounts').id;
run(`INSERT INTO expenses (user_id, category_id, account_id, amount, description, payment_method, expense_date)
     VALUES (?, 1, ?, '42.50', 'Una spesa con l''apice', 'card', '2026-05-01')`, userId, conto);
run(`INSERT INTO incomes (user_id, account_id, amount, source, payment_method, income_date)
     VALUES (?, ?, '1500.00', 'Stipendio', 'transfer', '2026-05-02')`, userId, conto);

// Un allegato vero su disco, che il ripristino deve rimettere al suo posto.
const cartellaAllegati = uploadsDir(userId, true);
writeFileSync(join(cartellaAllegati, 'scontrino.pdf'), Buffer.from('%PDF-1.4 finto'));

test('il dump contiene davvero le righe', () => {
  const dump = generateSqlDump(userId);

  assert.match(dump, /INSERT INTO `expenses`/);
  assert.match(dump, /INSERT INTO `incomes`/);
  assert.match(dump, /INSERT INTO `accounts`/);
  // L'apice dentro la descrizione va raddoppiato, o il ripristino si spacca a
  // metà riga su un dato che l'utente ha scritto in buona fede.
  assert.match(dump, /Una spesa con l''apice/);
});

test('il file di backup non si legge senza password', () => {
  const zip = createZip([{ name: 'dump.sql', data: Buffer.from(generateSqlDump(userId)) }], new Date());
  const archivio = vault.cifraConPassword(zip, PASSWORD);

  assert.equal(archivio.includes(Buffer.from('INSERT INTO')), false);
  assert.equal(archivio.subarray(0, 4).toString(), 'MXB1');
  assert.throws(() => vault.decifraConPassword(archivio, 'un-altra'), /password del backup/);

  const riaperto = readZip(vault.decifraConPassword(archivio, PASSWORD));
  assert.equal(riaperto[0].name, 'dump.sql');
  assert.match(riaperto[0].data.toString('utf8'), /INSERT INTO `expenses`/);
});

test('gli allegati stanno nell\'archivio con il nome giusto', () => {
  // Il campo si chiama `name`, e il ripristino leggeva `nome`: è la ragione per
  // cui gli allegati non tornavano mai indietro.
  const nomi = readdirSync(cartellaAllegati);
  const voci = nomi.map((n) => ({
    name: `uploads/${n}`, data: readFileSync(join(cartellaAllegati, n)),
  }));

  const riaperto = readZip(createZip(voci, new Date()));
  assert.equal(riaperto.length, 1);
  assert.equal(riaperto[0].name, 'uploads/scontrino.pdf');
  assert.ok(riaperto[0].data.length > 0);
  assert.equal(typeof riaperto[0].name, 'string');
  assert.equal(riaperto[0].nome, undefined, 'il campo con il nome è `name`, non `nome`');
});

test('quello che entra nel backup è tutto quello che serve a ricostruire', () => {
  const dump = generateSqlDump(userId);
  // Ogni tabella con dei dati dev'essere rappresentata: una tabella che finisce
  // nel backup ma non nel ripristino (o viceversa) perde dati in silenzio, ed è
  // già successo con trasferimenti e investimenti.
  for (const tabella of ['users', 'categories', 'accounts', 'expenses', 'incomes']) {
    assert.match(dump, new RegExp(`INSERT INTO \`${tabella}\``), `manca ${tabella}`);
  }
  assert.equal(all('SELECT id FROM expenses').length, 1);
});
