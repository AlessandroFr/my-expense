// La scelta dell'installer da usare. Sbagliarla significa reinstallare in
// eterno la stessa versione, o peggio tornare indietro a una piu' vecchia.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, newestInstaller } from '../../electron/update.js';

test('le versioni si confrontano per numero, non per testo', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
  assert.ok(compareVersions('1.2.0', '1.2.1') < 0);
  assert.equal(compareVersions('1.2.0', '1.2.0'), 0);
  assert.ok(compareVersions('1.2', '1.2.0') === 0);
});

test('si aggiorna solo verso una versione piu\' recente', () => {
  const nomi = ['MyExpense-Setup-1.0.0.exe', 'MyExpense-Setup-1.1.0.exe'];
  assert.equal(newestInstaller(nomi, '1.0.0').versione, '1.1.0');
  assert.equal(newestInstaller(nomi, '1.1.0'), null);
  assert.equal(newestInstaller(nomi, '2.0.0'), null);
});

test('fra piu\' installer nuovi vince il piu\' recente', () => {
  const nomi = ['MyExpense-Setup-1.2.0.exe', 'MyExpense-Setup-1.10.0.exe', 'MyExpense-Setup-1.3.0.exe'];
  assert.equal(newestInstaller(nomi, '1.0.0').nome, 'MyExpense-Setup-1.10.0.exe');
});

test('gli altri file della cartella non contano', () => {
  const nomi = ['win-unpacked', 'builder-debug.yml', 'MyExpense-Setup-1.1.0.exe.blockmap', 'latest.yml'];
  assert.equal(newestInstaller(nomi, '1.0.0'), null);
});
