// Il server dei test: database usa-e-getta, rifatto da zero a ogni giro.
//
// Cancellare e seminare stanno qui, e non in un globalSetup, per un motivo
// preciso: su Windows la cartella non si puo' cancellare mentre il server
// tiene aperto il file SQLite. Facendo tutto prima di avviarlo, quel problema
// non esiste.
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = join(import.meta.dirname, '.tmp');
rmSync(dataDir, { recursive: true, force: true });
process.env.MY_EXPENSE_DATA_DIR = dataDir;

const { seed } = await import('./seed.js');
await seed();

const { start } = await import('../server/index.js');
const server = await start(4599);
console.log(`e2e: server su ${server.url}`);
