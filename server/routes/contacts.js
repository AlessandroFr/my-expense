// Anagrafiche fornitori/clienti — contratto identico a ContactController +
// App\Contact.
//
// Cliente e fornitore coincidono: il campo `type` sopravvive per compatibilita'
// ma le anagrafiche nuove nascono sempre 'both'.

import { all, one, run, transaction, currentUserId } from '../db.js';
import { HttpError, assertCsrf, int, isValidDate, ok, readBody, str } from '../http.js';
import { roundLikePhp } from '../amount.js';
import { duplicateGroups } from '../contact-dedup.js';
import { looksLikeBankJargon } from '../bank-statement.js';
import { inBase } from '../fx.js';

const TYPES = ['supplier', 'customer', 'both'];

// La lista non espone user_id (c'e' un solo utente e allForUser non lo
// seleziona); il dettaglio invece si', come findForUser.
const LIST_COLUMNS = `id, name, name_norm, type, vat_number, iban, email, notes,
                      color, archived, created_at, updated_at`;
const DETAIL_COLUMNS = `id, user_id, name, name_norm, type, vat_number, iban, email, notes,
                        color, archived, created_at, updated_at`;

const round2 = (n) => roundLikePhp(n, 2);

/** Nome normalizzato per il confronto: minuscolo, spazi collassati. */
export const normalizeName = (name) => str(name).toLowerCase().replace(/\s+/g, ' ');

/** I caratteri jolly di LIKE vanno neutralizzati prima di finire nel pattern. */
const escapeLike = (s) => s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

const findForUser = (id, userId) =>
  one(`SELECT ${DETAIL_COLUMNS} FROM contacts WHERE id = ? AND user_id = ? LIMIT 1`, id, userId);

const findByNormalizedName = (userId, nameNorm) =>
  one('SELECT id, name, type, color FROM contacts WHERE user_id = ? AND name_norm = ? LIMIT 1',
    userId, nameNorm);

/** Traduce Contact::validate. */
function validate(rawName, type, details) {
  const name = str(rawName);
  if (name === '' || [...name].length > 120) {
    throw HttpError.badRequest('Nome anagrafica obbligatorio (max 120 caratteri).');
  }
  if (!TYPES.includes(type)) throw HttpError.badRequest('Tipo anagrafica non valido.');

  const vat = str(details.vat_number);
  if (vat !== '' && [...vat].length > 32) {
    throw HttpError.badRequest('P.IVA / CF troppo lungo (max 32 caratteri).');
  }

  let iban = str(details.iban);
  if (iban !== '') {
    iban = iban.replace(/\s+/g, '').toUpperCase();
    if ([...iban].length > 34) throw HttpError.badRequest('IBAN troppo lungo.');
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) throw HttpError.badRequest('Formato IBAN non valido.');
  }

  const email = str(details.email);
  if (email !== '') {
    // Stesso criterio di FILTER_VALIDATE_EMAIL per i casi che contano.
    if ([...email].length > 120 || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
      throw HttpError.badRequest('Email non valida.');
    }
  }

  const notes = str(details.notes);
  const color = str(details.color) || '#6c757d';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw HttpError.badRequest('Colore non valido.');

  return {
    name,
    name_norm: normalizeName(name),
    type,
    vat_number: vat === '' ? null : vat,
    iban: iban === '' ? null : iban,
    email: email === '' ? null : email,
    notes: notes === '' ? null : notes,
    color,
  };
}

const asConflict = (err, name) => {
  if (String(err.message).includes('UNIQUE')) {
    return HttpError.conflict(`Esiste gia' un'anagrafica '${name}'.`);
  }
  return err;
};

/**
 * Collega i movimenti ancora orfani la cui descrizione cita il nome del
 * contatto. Sotto i quattro caratteri non si tenta nemmeno: "Bar" o "Sky"
 * aggancerebbero mezzo archivio.
 */
function applyBackfill(userId, contactId, name) {
  const trimmed = str(name);
  if ([...name].length < 4) return { expenses: 0, incomes: 0, recurring: 0 };

  const like = `%${escapeLike(name)}%`;
  const e = run(
    'UPDATE expenses SET contact_id = ? WHERE user_id = ? AND contact_id IS NULL AND description LIKE ?',
    contactId, userId, like);
  const i = run(
    `UPDATE incomes SET contact_id = ? WHERE user_id = ? AND contact_id IS NULL
       AND (description LIKE ? OR source LIKE ?)`,
    contactId, userId, like, like);
  const r = run(
    'UPDATE recurring_expenses SET contact_id = ? WHERE user_id = ? AND contact_id IS NULL AND description LIKE ?',
    contactId, userId, like);

  return { expenses: e.changes, incomes: i.changes, recurring: r.changes };
}

function insert(userId, row) {
  let id;
  try {
    const res = run(
      `INSERT INTO contacts (user_id, name, name_norm, type, vat_number, iban, email, notes, color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId, row.name, row.name_norm, row.type,
      row.vat_number, row.iban, row.email, row.notes, row.color,
    );
    id = Number(res.lastInsertRowid);
  } catch (err) {
    throw asConflict(err, row.name);
  }
  // Best-effort come in PHP: un backfill fallito non deve impedire la creazione.
  try { applyBackfill(userId, id, row.name); } catch { /* ignorato di proposito */ }
  return id;
}

/** Cerca per nome normalizzato, altrimenti crea. Usato dai campi a testo libero. */
export function findOrCreate(userId, name) {
  const trimmed = str(name);
  if (name === '') throw HttpError.badRequest('Nome anagrafica obbligatorio.');

  const existing = findByNormalizedName(userId, normalizeName(name));
  if (existing) {
    // Chi era solo cliente o solo fornitore diventa entrambi.
    if (existing.type !== 'both') {
      run("UPDATE contacts SET type = 'both' WHERE id = ? AND user_id = ?", existing.id, userId);
    }
    return existing.id;
  }
  return insert(userId, validate(name, 'both', {}));
}

function usageCount(id, userId) {
  const count = (table) =>
    one(`SELECT COUNT(*) AS n FROM ${table} WHERE contact_id = ? AND user_id = ?`, id, userId).n;
  const expenses = count('expenses');
  const incomes = count('incomes');
  const recurring = count('recurring_expenses');
  return { expenses, incomes, recurring, total: expenses + incomes + recurring };
}

function balanceSummary(userId, from, to, type) {
  const perContatto = (table, dateCol) => new Map(all(
    `SELECT contact_id, COALESCE(SUM(${inBase()}), 0) AS total, COUNT(*) AS cnt
     FROM ${table}
     WHERE user_id = ? AND contact_id IS NOT NULL AND ${dateCol} BETWEEN ? AND ?
     GROUP BY contact_id`,
    userId, from, to,
  ).map((r) => [r.contact_id, [Number(r.total), r.cnt]]));

  const exp = perContatto('expenses', 'expense_date');
  const inc = perContatto('incomes', 'income_date');

  const ids = [...new Set([...exp.keys(), ...inc.keys()])];
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const contacts = new Map(all(
    `SELECT id, name, type, color FROM contacts WHERE user_id = ? AND id IN (${placeholders})`,
    userId, ...ids,
  ).map((c) => [c.id, c]));

  const out = [];
  for (const cid of ids) {
    const c = contacts.get(cid);
    if (!c) continue;
    if (type === 'supplier' && !['supplier', 'both'].includes(c.type)) continue;
    if (type === 'customer' && !['customer', 'both'].includes(c.type)) continue;

    const [eTot = 0, eCnt = 0] = exp.get(cid) ?? [];
    const [iTot = 0, iCnt = 0] = inc.get(cid) ?? [];
    out.push({
      contact_id: cid,
      name: c.name,
      type: c.type,
      color: c.color,
      expenses_total: round2(eTot),
      incomes_total: round2(iTot),
      net: round2(iTot - eTot),
      expenses_count: eCnt,
      incomes_count: iCnt,
    });
  }
  // Prima chi pesa di piu', in un verso o nell'altro.
  out.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return out;
}

const breakdownByCategory = (userId, contactId, from, to) => all(
  `SELECT c.id AS category_id,
          COALESCE(c.name, '(senza categoria)') AS category_name,
          COALESCE(c.color, '#6c757d') AS category_color,
          COALESCE(c.icon, 'tag') AS category_icon,
          COALESCE(SUM(${inBase("e")}), 0) AS total,
          COUNT(*) AS cnt
   FROM expenses e
   LEFT JOIN categories c ON c.id = e.category_id
   WHERE e.user_id = ? AND e.contact_id = ? AND e.expense_date BETWEEN ? AND ?
   GROUP BY c.id, c.name, c.color, c.icon
   ORDER BY total DESC`,
  userId, contactId, from, to,
).map((r) => ({
  category_id: r.category_id ?? null,
  category_name: r.category_name,
  category_color: r.category_color,
  category_icon: r.category_icon,
  total: round2(r.total),
  count: r.cnt,
}));

/** Spese, entrate e ricorrenti di un contatto in un unico elenco ordinato. */
const movementsForUser = (userId, contactId, limit, offset) => all(
  `SELECT 'expense' AS kind, e.id AS id, e.expense_date AS date, e.description AS description,
          e.amount AS amount, c.name AS category_name, c.color AS category_color,
          NULL AS last_generated_date
   FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
   WHERE e.user_id = ? AND e.contact_id = ?
   UNION ALL
   SELECT 'income', i.id, i.income_date, i.description, i.amount, NULL, NULL, NULL
   FROM incomes i WHERE i.user_id = ? AND i.contact_id = ?
   UNION ALL
   SELECT 'recurring', r.id, COALESCE(r.last_generated_date, r.start_date), r.description,
          r.amount, c.name, c.color, r.last_generated_date
   FROM recurring_expenses r LEFT JOIN categories c ON c.id = r.category_id
   WHERE r.user_id = ? AND r.contact_id = ?
   ORDER BY date DESC, kind ASC, id DESC
   LIMIT ? OFFSET ?`,
  userId, contactId, userId, contactId, userId, contactId, limit, offset,
).map((r) => ({
  kind: r.kind,
  id: r.id,
  date: r.date,
  description: r.description ?? '',
  amount: round2(r.amount),
  category_name: r.category_name ?? null,
  category_color: r.category_color ?? null,
  last_generated_date: r.last_generated_date ?? null,
}));

const details = (body) => ({
  vat_number: body.vat_number, iban: body.iban, email: body.email,
  notes: body.notes, color: body.color,
});

// ─── Endpoint ───────────────────────────────────────────────────────────────

async function list(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const includeArchived = int(searchParams.get('include_archived')) === 1;
  const search = str(searchParams.get('search'));
  const page = Math.max(1, int(searchParams.get('page'), 1));
  let pageSize = int(searchParams.get('page_size'), 25);
  if (pageSize < 0) pageSize = 25;
  if (pageSize > 200) pageSize = 200;

  const clauses = ['user_id = ?'];
  const params = [userId];
  if (!includeArchived) clauses.push('archived = 0');
  if (search !== '') {
    const like = `%${escapeLike(search)}%`;
    clauses.push('(name LIKE ? OR vat_number LIKE ? OR iban LIKE ? OR email LIKE ?)');
    params.push(like, like, like, like);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;

  let contacts;
  let total;
  let totalPages;
  if (pageSize > 0) {
    contacts = all(`SELECT ${LIST_COLUMNS} FROM contacts ${where} ORDER BY name ASC LIMIT ? OFFSET ?`,
      ...params, pageSize, (page - 1) * pageSize);
    // Il totale ignora il filtro archiviati? No: usa gli stessi predicati della
    // lista tranne LIMIT/OFFSET, come countForUser.
    total = one(`SELECT COUNT(*) AS n FROM contacts ${where}`, ...params).n;
    totalPages = Math.max(1, Math.ceil(total / pageSize));
  } else {
    contacts = all(`SELECT ${LIST_COLUMNS} FROM contacts ${where} ORDER BY name ASC`, ...params);
    total = contacts.length;
    totalPages = 1;
  }

  if (pageSize > 0 && int(searchParams.get('with_usage')) === 1) {
    for (const c of contacts) c.usage = usageCount(c.id, userId);
  }

  ok(res, { contacts, total, page: pageSize > 0 ? page : 1, page_size: pageSize, total_pages: totalPages });
}

async function balance(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  let from = str(searchParams.get('from'));
  let to = str(searchParams.get('to'));
  if (!isValidDate(from) || !isValidDate(to)) {
    let year = int(searchParams.get('year'), new Date().getFullYear());
    if (year < 1970 || year > 2999) year = new Date().getFullYear();
    from = `${String(year).padStart(4, '0')}-01-01`;
    to = `${String(year).padStart(4, '0')}-12-31`;
  }

  const typeRaw = str(searchParams.get('type'));
  const type = typeRaw === 'supplier' || typeRaw === 'customer' ? typeRaw : null;
  const contactId = int(searchParams.get('contact_id'));

  if (contactId > 0) {
    const contact = findForUser(contactId, userId);
    if (!contact) throw HttpError.notFound('Anagrafica non trovata.');
    const summary = balanceSummary(userId, from, to, null);
    ok(res, {
      from,
      to,
      contact,
      totals: summary.find((r) => r.contact_id === contactId) ?? null,
      breakdown: breakdownByCategory(userId, contactId, from, to),
    });
    return;
  }

  ok(res, { from, to, type, summary: balanceSummary(userId, from, to, type) });
}

async function movements(req, res) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const userId = currentUserId();

  const contactId = int(searchParams.get('contact_id'));
  if (contactId <= 0) throw HttpError.badRequest('ID anagrafica mancante.');
  if (!findForUser(contactId, userId)) throw HttpError.notFound('Anagrafica non trovata.');

  const page = Math.max(1, int(searchParams.get('page'), 1));
  let pageSize = int(searchParams.get('page_size'), 50);
  if (pageSize < 1) pageSize = 50;
  if (pageSize > 200) pageSize = 200;

  const usage = usageCount(contactId, userId);
  const counts = {
    expense: usage.expenses, income: usage.incomes,
    recurring: usage.recurring, total: usage.total,
  };
  ok(res, {
    movements: movementsForUser(userId, contactId, pageSize, (page - 1) * pageSize),
    counts,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(counts.total / pageSize)),
  });
}

async function create(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();
  // Cliente e fornitore coincidono: il type passato dal form viene ignorato.
  ok(res, { id: insert(userId, validate(body.name, 'both', details(body))) });
}

async function quickCreate(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const name = str(body.name);
  if (name === '') throw HttpError.badRequest('Nome anagrafica obbligatorio.');

  const created = findByNormalizedName(userId, normalizeName(name)) === null;
  const id = findOrCreate(userId, name);
  const contact = findForUser(id, userId);

  ok(res, { id, name: contact?.name ?? name, color: contact?.color ?? '#6c757d', created });
}

async function update(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID anagrafica mancante.');

  const type = TYPES.includes(str(body.type)) ? str(body.type) : 'both';
  const row = validate(body.name, type, details(body));
  const archived = int(body.archived) === 1 ? 1 : 0;

  try {
    run(
      `UPDATE contacts
       SET name = ?, name_norm = ?, type = ?, vat_number = ?, iban = ?, email = ?,
           notes = ?, color = ?, archived = ?
       WHERE id = ? AND user_id = ?`,
      row.name, row.name_norm, row.type, row.vat_number, row.iban, row.email,
      row.notes, row.color, archived, id, userId,
    );
  } catch (err) {
    throw asConflict(err, row.name);
  }
  ok(res, { updated: true });
}

async function archive(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID anagrafica mancante.');

  const archived = body.archived === undefined ? true : int(body.archived) === 1;
  run('UPDATE contacts SET archived = ? WHERE id = ? AND user_id = ?',
    archived ? 1 : 0, id, currentUserId());
  ok(res, { archived });
}

async function remove(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);

  const id = int(body.id);
  if (id <= 0) throw HttpError.badRequest('ID anagrafica mancante.');

  // I movimenti collegati restano, con contact_id azzerato: FK ON DELETE SET NULL.
  run('DELETE FROM contacts WHERE id = ? AND user_id = ?', id, currentUserId());
  ok(res, { deleted: true });
}

async function merge(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const winnerId = int(body.winner_id);
  if (winnerId <= 0) throw HttpError.badRequest('ID anagrafica vincitrice mancante.');

  let losersRaw;
  try { losersRaw = JSON.parse(str(body.loser_ids)); } catch { losersRaw = null; }
  if (!Array.isArray(losersRaw) || losersRaw.length === 0) {
    throw HttpError.badRequest('Nessuna anagrafica da fondere selezionata.');
  }

  const losers = [...new Set(losersRaw.map((x) => int(x)).filter((x) => x > 0 && x !== winnerId))];
  if (losers.length === 0) throw HttpError.badRequest('Nessuna anagrafica da fondere selezionata.');
  if (losers.length > 100) throw HttpError.badRequest('Troppe anagrafiche in una sola fusione (max 100).');

  const allIds = [winnerId, ...losers];
  const placeholders = allIds.map(() => '?').join(',');
  const found = new Map(all(
    `SELECT id, name FROM contacts WHERE user_id = ? AND id IN (${placeholders})`, userId, ...allIds,
  ).map((r) => [r.id, r.name]));

  if (!found.has(winnerId)) throw HttpError.badRequest('Anagrafica vincitrice non trovata.');
  for (const lid of losers) {
    if (!found.has(lid)) throw HttpError.badRequest("Una delle anagrafiche da fondere non e' stata trovata.");
  }

  const reassigned = { expenses: 0, incomes: 0, recurring: 0 };
  let merged = 0;

  transaction(() => {
    for (const lid of losers) {
      for (const [table, key] of [['expenses', 'expenses'], ['incomes', 'incomes'], ['recurring_expenses', 'recurring']]) {
        const r = run(`UPDATE ${table} SET contact_id = ? WHERE user_id = ? AND contact_id = ?`,
          winnerId, userId, lid);
        reassigned[key] += r.changes;
      }
      merged += run('DELETE FROM contacts WHERE id = ? AND user_id = ?', lid, userId).changes;
    }
  });

  ok(res, {
    result: { merged, reassigned, winner_id: winnerId, winner_name: found.get(winnerId) },
  });
}

/**
 * I doppioni da fondere. Legge e basta: propone i gruppi e chi dovrebbe
 * vincere, poi e' l'utente a confermare passando da /contacts/merge.
 */
async function duplicates(req, res) {
  const userId = currentUserId();
  const contatti = all(
    'SELECT id, name, vat_number FROM contacts WHERE user_id = ? AND archived = 0 ORDER BY name ASC',
    userId,
  );
  // I movimenti di tutti in due query invece di una per anagrafica: con
  // qualche centinaio di nomi la differenza si sente.
  const usi = new Map(contatti.map((c) => [c.id, 0]));
  for (const table of ['expenses', 'incomes', 'recurring_expenses']) {
    for (const r of all(
      `SELECT contact_id, COUNT(*) AS n FROM ${table}
       WHERE user_id = ? AND contact_id IS NOT NULL GROUP BY contact_id`, userId,
    )) {
      if (usi.has(r.contact_id)) usi.set(r.contact_id, usi.get(r.contact_id) + r.n);
    }
  }

  const conUsi = contatti.map((c) => ({
    id: c.id, name: c.name, vat_number: c.vat_number, usage_total: usi.get(c.id) ?? 0,
  }));

  // Nomi nati dal gergo della banca prima che l'import imparasse a riconoscerlo
  // («Prel», «Vostra Disposizione», «Carta Di Debito»). Non sono doppioni: non
  // vanno uniti, vanno buttati. I movimenti restano, senza fornitore.
  const junk = conUsi.filter((c) => looksLikeBankJargon(c.name));

  ok(res, { groups: duplicateGroups(conUsi), junk, scanned: contatti.length });
}

async function reassign(req, res) {
  const body = await readBody(req);
  assertCsrf(req, body);
  const userId = currentUserId();

  const sourceId = int(body.source_contact_id);
  if (sourceId <= 0) throw HttpError.badRequest('ID anagrafica sorgente mancante.');

  const sourceAction = str(body.source_action) || 'leave';
  if (!['leave', 'archive', 'delete'].includes(sourceAction)) {
    throw HttpError.badRequest('Azione sul contatto sorgente non valida.');
  }

  let items;
  try { items = JSON.parse(str(body.items)); } catch { items = null; }
  if (!Array.isArray(items) || items.length === 0) throw HttpError.badRequest('Nessun movimento selezionato.');
  if (items.length > 5000) {
    throw HttpError.badRequest('Troppi movimenti in una sola operazione (max 5000). Procedi a piccoli blocchi.');
  }
  if (!findForUser(sourceId, userId)) throw HttpError.badRequest('Anagrafica sorgente non trovata.');

  const TABELLE = { expense: 'expenses', income: 'incomes', recurring: 'recurring_expenses' };
  const grouped = { expense: new Map(), income: new Map(), recurring: new Map() };
  const targetIds = new Set();

  items.forEach((it, idx) => {
    const kind = str(it?.kind);
    if (!(kind in grouped)) throw HttpError.badRequest(`Tipo movimento non valido (item #${idx}).`);
    const mid = int(it?.id);
    const tid = int(it?.target_contact_id);
    if (mid <= 0 || tid <= 0) throw HttpError.badRequest(`Movimento o destinazione non valida (item #${idx}).`);
    if (tid === sourceId) throw HttpError.badRequest('La destinazione non può coincidere con la sorgente.');
    if (!grouped[kind].has(tid)) grouped[kind].set(tid, []);
    grouped[kind].get(tid).push(mid);
    targetIds.add(tid);
  });

  const targets = [...targetIds];
  const placeholders = targets.map(() => '?').join(',');
  const found = new Set(all(
    `SELECT id FROM contacts WHERE user_id = ? AND id IN (${placeholders})`, userId, ...targets,
  ).map((r) => r.id));
  if (targets.some((t) => !found.has(t))) {
    throw HttpError.badRequest('Una o più anagrafiche di destinazione non esistono o non sono accessibili.');
  }

  const reassigned = { expense: 0, income: 0, recurring: 0 };

  transaction(() => {
    for (const [kind, byTarget] of Object.entries(grouped)) {
      for (const [targetId, movementIds] of byTarget) {
        const ids = [...new Set(movementIds)];
        const ph = ids.map(() => '?').join(',');
        const r = run(
          `UPDATE ${TABELLE[kind]} SET contact_id = ?
           WHERE user_id = ? AND contact_id = ? AND id IN (${ph})`,
          targetId, userId, sourceId, ...ids,
        );
        // Se qualche movimento non era piu' su questa anagrafica, la pagina di
        // chi sta operando e' vecchia: meglio annullare tutto che riassegnare
        // a meta'.
        if (r.changes !== ids.length) {
          throw HttpError.conflict(
            `Alcuni movimenti non sono più collegati a questa anagrafica ` +
            `(attesi ${ids.length}, aggiornati ${r.changes}). Ricarica la pagina e riprova.`,
          );
        }
        reassigned[kind] += r.changes;
      }
    }

    if (sourceAction === 'archive') {
      run('UPDATE contacts SET archived = 1 WHERE id = ? AND user_id = ?', sourceId, userId);
    } else if (sourceAction === 'delete') {
      const residui = usageCount(sourceId, userId);
      if (residui.total > 0) {
        throw HttpError.conflict(
          `Anagrafica ha ancora ${residui.total} movimenti collegati: eliminazione annullata. ` +
          'Riassegna anche i movimenti residui.',
        );
      }
      run('DELETE FROM contacts WHERE id = ? AND user_id = ?', sourceId, userId);
    }
  });

  ok(res, { result: { reassigned, source_action_applied: sourceAction } });
}

export const contactRoutes = {
  'GET /contacts/list': list,
  'GET /contacts/balance': balance,
  'GET /contacts/movements': movements,
  'GET /contacts/duplicates': duplicates,
  'POST /contacts/create': create,
  'POST /contacts/quick-create': quickCreate,
  'POST /contacts/update': update,
  'POST /contacts/archive': archive,
  'POST /contacts/delete': remove,
  'POST /contacts/merge': merge,
  'POST /contacts/reassign': reassign,
};
