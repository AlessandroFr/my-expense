// Le chiavi che aprono il database.
//
// Qui non si prova che AES funzioni — quello lo fa Node. Si prova che l'incarto
// doppio si comporti come deve: che la password sbagliata non apra, che la
// chiave di recupero apra lo stesso, che cambiare la password non spenga la
// chiave di recupero (e viceversa). Sono le tre cose che, sbagliate, si
// scoprirebbero il giorno in cui uno degli amici resta chiuso fuori.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MY_EXPENSE_DATA_DIR = mkdtempSync(join(tmpdir(), 'my-expense-vault-'));
// Il costo minimo: qui non c'e' niente da proteggere e le derivazioni sono
// tante. Quale chiave apre cosa non cambia con N.
process.env.MY_EXPENSE_SCRYPT_N = String(2 ** 14);

const vault = await import('../../server/vault.js');

const PW = 'una-password-lunga-abbastanza';

test('la password apre, una sbagliata no', () => {
  const { dek } = vault.crea(PW);

  const aperto = vault.apri(PW);
  assert.equal(aperto.con, 'password');
  assert.deepEqual(aperto.dek, dek);

  assert.equal(vault.apri('quasi-giusta'), null);
  assert.equal(vault.apri(''), null);
});

test('la chiave di recupero apre come la password', () => {
  const { dek, chiaveRecupero } = vault.crea(PW);

  const aperto = vault.apri(chiaveRecupero);
  assert.equal(aperto.con, 'recupero');
  assert.deepEqual(aperto.dek, dek);
});

test('la chiave di recupero si ricopia come viene: minuscole, spazi, senza trattini', () => {
  const { chiaveRecupero } = vault.crea(PW);

  for (const variante of [
    chiaveRecupero.toLowerCase(),
    chiaveRecupero.replace(/-/g, ''),
    chiaveRecupero.replace(/-/g, ' '),
    `  ${chiaveRecupero.toLowerCase().replace(/-/g, '')}  `,
  ]) {
    assert.equal(vault.apri(variante)?.con, 'recupero', `non apre con "${variante}"`);
  }
});

test('cambiare password non tocca la chiave di recupero', () => {
  const { dek, chiaveRecupero } = vault.crea(PW);

  assert.equal(vault.cambiaPassword('non-e-questa', 'nuova-password-lunga'), false);
  assert.equal(vault.cambiaPassword(PW, 'nuova-password-lunga'), true);

  assert.equal(vault.apri(PW), null, 'la vecchia password deve smettere di funzionare');
  assert.deepEqual(vault.apri('nuova-password-lunga').dek, dek);
  assert.deepEqual(vault.apri(chiaveRecupero).dek, dek, 'la chiave di recupero deve reggere');
});

test('rigenerare la chiave di recupero spegne la vecchia e lascia la password', () => {
  const { dek, chiaveRecupero } = vault.crea(PW);

  const nuova = vault.rigeneraChiaveRecupero(dek);
  assert.notEqual(nuova, chiaveRecupero);
  assert.equal(vault.apri(chiaveRecupero), null);
  assert.deepEqual(vault.apri(nuova).dek, dek);
  assert.deepEqual(vault.apri(PW).dek, dek);
});

test('chi entra con la chiave di recupero puo\' mettere una password nuova senza sapere la vecchia', () => {
  const { chiaveRecupero } = vault.crea(PW);
  const { dek } = vault.apri(chiaveRecupero);

  vault.impostaPassword(dek, 'la-password-che-mi-ricordo');

  assert.equal(vault.apri(PW), null);
  assert.deepEqual(vault.apri('la-password-che-mi-ricordo').dek, dek);
  assert.deepEqual(vault.apri(chiaveRecupero).dek, dek);
});

test('la chiave di recupero non contiene caratteri che si scambiano a ricopiarli', () => {
  for (let i = 0; i < 20; i += 1) {
    const chiave = vault.generaChiaveRecupero();
    assert.match(chiave, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/);
    assert.equal(/[OIL01]/.test(chiave), false, `${chiave} ha caratteri ambigui`);
  }
});

test('due chiavi di recupero non sono mai uguali', () => {
  const viste = new Set();
  for (let i = 0; i < 200; i += 1) viste.add(vault.generaChiaveRecupero());
  assert.equal(viste.size, 200);
});

test('il backup cifrato si riapre solo con la sua password', () => {
  const dentro = Buffer.from('PK finto zip di backup', 'utf8');
  const cifrato = vault.cifraConPassword(dentro, 'password-del-backup');

  assert.equal(cifrato.includes(dentro), false, 'il contenuto non deve restare in chiaro');
  assert.deepEqual(vault.decifraConPassword(cifrato, 'password-del-backup'), dentro);

  assert.throws(() => vault.decifraConPassword(cifrato, 'un\'altra'), /password del backup/);
  assert.throws(() => vault.decifraConPassword(Buffer.from('roba a caso'), 'x'), /non e' un backup/);
});
