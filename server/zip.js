/**
 * Lettura e scrittura di archivi ZIP.
 *
 * Node comprime (node:zlib) ma non impacchetta: qui c'e' il minimo per
 * costruire e leggere gli archivi di backup, senza dipendenze. Sono supportati
 * i due metodi che servono: 0 (nessuna compressione) e 8 (deflate).
 *
 * ponytail: niente cifratura, niente ZIP64, niente archivi oltre i 4 GB. Un
 * backup personale non ci arriva; se un giorno servisse, la strada e' un
 * pacchetto vero, non allargare questo file.
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib';

const TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

/** Data e ora nel formato a 16 bit usato dallo ZIP. */
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * @param {Array<{name: string, data: Buffer}>} entries
 * @returns {Buffer} l'archivio completo
 */
export function createZip(entries, now = new Date()) {
  const { time, day } = dosDateTime(now);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = entry.data;
    const compressed = deflateRawSync(raw);
    // Se comprimere non conviene, si archivia il file cosi' com'e'.
    const useDeflate = compressed.length < raw.length;
    const payload = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;
    const sum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // versione minima
    local.writeUInt16LE(0x0800, 6);      // nomi in UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + payload.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

/**
 * Legge un archivio partendo dalla central directory, che e' l'indice
 * autorevole: i local header possono mentire sulle dimensioni.
 *
 * @returns {Array<{name: string, data: Buffer}>}
 */
export function readZip(buffer) {
  // L'end-of-central-directory sta in fondo, dopo un commento di lunghezza ignota.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 65536; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Archivio ZIP non valido: indice non trovato.');

  const count = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);
  const out = [];

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');

    // La lunghezza dei campi variabili va riletta dal local header.
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const payload = buffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) data = payload;
    else if (method === 8) data = inflateRawSync(payload);
    else throw new Error(`Metodo di compressione non supportato (${method}) per "${name}".`);

    out.push({ name, data });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}
