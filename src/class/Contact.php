<?php
declare(strict_types=1);

namespace App;

use InvalidArgumentException;
use PDOException;
use RuntimeException;

/**
 * Anagrafica fornitori/clienti. Tabella unica `contacts` con
 * type ∈ {supplier, customer, both}; collegata in modo opzionale a
 * expenses/incomes/recurring_expenses (FK ON DELETE SET NULL).
 *
 * `name_norm` viene calcolato in PHP via Contact::normalize() ed e' usato
 * per matching case-insensitive durante l'import dell'estratto conto.
 */
final class Contact
{
    public const TYPES = ['supplier', 'customer', 'both'];

    /**
     * Normalizza un nome per il match case-insensitive: lower, trim,
     * spazi multipli collassati. Stesso pattern usato in
     * BankStatementImporter::computeImportHash.
     */
    public static function normalize(string $name): string
    {
        $n = mb_strtolower(trim($name));
        $n = preg_replace('/\s+/', ' ', $n) ?? $n;
        return $n;
    }

    /**
     * Cliente e fornitore coincidono: il parametro $type viene mantenuto per
     * back-compat ma e' un no-op — l'UI adesso non distingue piu' i due ruoli.
     *
     * Opts (tutte opzionali, default = back-compat con i caller esistenti):
     *   - search (?string): filtro LIKE %term% su name/vat_number/iban/email
     *   - limit  (?int)   : se valorizzato applica LIMIT/OFFSET
     *   - offset (int)    : default 0
     *
     * @param  ?string             $type Ignorato (kept for API compat).
     * @param  array<string,mixed> $opts
     * @return array<int, array<string,mixed>>
     */
    public static function allForUser(
        int $userId,
        bool $includeArchived = false,
        ?string $type = null,
        array $opts = []
    ): array {
        [$where, $params] = self::buildListWhereClause($userId, $includeArchived, $opts);
        $sql = 'SELECT id, name, name_norm, type, vat_number, iban, email, notes,
                       color, archived, created_at, updated_at
                FROM contacts'
              . $where
              . ' ORDER BY name ASC';

        $limit  = isset($opts['limit'])  ? (int) $opts['limit']  : null;
        $offset = isset($opts['offset']) ? max(0, (int) $opts['offset']) : 0;

        $stmt = Database::pdo()->prepare(
            $limit !== null ? $sql . ' LIMIT ? OFFSET ?' : $sql
        );
        $i = 1;
        foreach ($params as $p) {
            $stmt->bindValue($i++, $p, is_int($p) ? \PDO::PARAM_INT : \PDO::PARAM_STR);
        }
        if ($limit !== null) {
            $stmt->bindValue($i++, $limit,  \PDO::PARAM_INT);
            $stmt->bindValue($i,   $offset, \PDO::PARAM_INT);
        }
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /**
     * Conta i contatti che soddisfano gli stessi predicati di allForUser
     * (escluso LIMIT/OFFSET). Usato dalla paginazione di /contacts.
     *
     * @param array<string,mixed> $opts
     */
    public static function countForUser(
        int $userId,
        bool $includeArchived = false,
        array $opts = []
    ): int {
        [$where, $params] = self::buildListWhereClause($userId, $includeArchived, $opts);
        $sql = 'SELECT COUNT(*) FROM contacts' . $where;
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Costruisce la WHERE clause condivisa fra allForUser e countForUser.
     * Ritorna [SQL, params] dove SQL inizia con " WHERE …".
     *
     * @param array<string,mixed> $opts
     * @return array{0:string, 1:array<int,mixed>}
     */
    private static function buildListWhereClause(
        int $userId,
        bool $includeArchived,
        array $opts
    ): array {
        $sql    = ' WHERE user_id = ?';
        $params = [$userId];

        if (!$includeArchived) {
            $sql .= ' AND archived = 0';
        }

        $search = isset($opts['search']) ? trim((string) $opts['search']) : '';
        if ($search !== '') {
            // Escapa wildcard LIKE — stesso pattern di previewBackfillCount.
            $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search);
            $like    = '%' . $escaped . '%';
            $sql    .= ' AND (name LIKE ? OR vat_number LIKE ? OR iban LIKE ? OR email LIKE ?)';
            array_push($params, $like, $like, $like, $like);
        }

        return [$sql, $params];
    }

    public static function findForUser(int $id, int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, user_id, name, name_norm, type, vat_number, iban, email, notes,
                    color, archived, created_at, updated_at
             FROM contacts WHERE id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** Cerca per name_norm gia' normalizzato (lookup esistenza in import). */
    public static function findByNormalizedName(int $userId, string $nameNorm): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, type, color FROM contacts
             WHERE user_id = ? AND name_norm = ? LIMIT 1'
        );
        $stmt->execute([$userId, $nameNorm]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Lookup case-insensitive per nome; se non esiste lo crea (tipo 'both' —
     * cliente e fornitore coincidono).
     *
     * Usato dai form ("crea al volo") e dall'import bancario. Il parametro
     * $type e' mantenuto solo per back-compat, viene ignorato.
     */
    public static function findOrCreate(int $userId, string $name, string $type = 'both'): int
    {
        $name = trim($name);
        if ($name === '') {
            throw new InvalidArgumentException('Nome anagrafica obbligatorio.');
        }
        $norm = self::normalize($name);
        $existing = self::findByNormalizedName($userId, $norm);
        if ($existing !== null) {
            // Promuovi sempre a 'both' (cliente e fornitore coincidono).
            if ((string) ($existing['type'] ?? 'both') !== 'both') {
                $stmt = Database::pdo()->prepare(
                    'UPDATE contacts SET type = \'both\' WHERE id = ? AND user_id = ?'
                );
                $stmt->execute([(int) $existing['id'], $userId]);
            }
            return (int) $existing['id'];
        }
        return self::create($userId, $name, 'both', []);
    }

    /**
     * @param array<string,mixed> $details Optional: vat_number, iban, email, notes, color
     */
    public static function create(int $userId, string $name, string $type, array $details = []): int
    {
        // Cliente e fornitore coincidono: ignora il type passato dal caller.
        $row = self::validate($name, 'both', $details);
        try {
            $stmt = Database::pdo()->prepare(
                'INSERT INTO contacts
                    (user_id, name, name_norm, type, vat_number, iban, email, notes, color)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $userId, $row['name'], $row['name_norm'], $row['type'],
                $row['vat_number'], $row['iban'], $row['email'], $row['notes'], $row['color'],
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Esiste gia' un'anagrafica '{$row['name']}'.");
            }
            throw $e;
        }
        $newId = (int) Database::pdo()->lastInsertId();

        // Backfill: scansiona descrizioni esistenti senza contact_id e collega
        // quelle che menzionano il nome del nuovo contatto. Best-effort: in caso
        // di errore non impedisce la creazione del contatto.
        try { self::applyBackfill($userId, $newId, $row['name']); } catch (\Throwable $e) { /* silent */ }

        return $newId;
    }

    /**
     * @param array<string,mixed> $details Optional: vat_number, iban, email, notes, color
     */
    public static function update(
        int $id, int $userId, string $name, string $type,
        array $details = [], bool $archived = false
    ): void {
        $row = self::validate($name, $type, $details);
        try {
            $stmt = Database::pdo()->prepare(
                'UPDATE contacts
                 SET name = ?, name_norm = ?, type = ?,
                     vat_number = ?, iban = ?, email = ?, notes = ?, color = ?,
                     archived = ?
                 WHERE id = ? AND user_id = ?'
            );
            $stmt->execute([
                $row['name'], $row['name_norm'], $row['type'],
                $row['vat_number'], $row['iban'], $row['email'], $row['notes'], $row['color'],
                $archived ? 1 : 0,
                $id, $userId,
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new RuntimeException("Esiste gia' un'anagrafica '{$row['name']}'.");
            }
            throw $e;
        }
    }

    public static function archive(int $id, int $userId, bool $archived): void
    {
        $stmt = Database::pdo()->prepare(
            'UPDATE contacts SET archived = ? WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$archived ? 1 : 0, $id, $userId]);
    }

    public static function delete(int $id, int $userId): void
    {
        $stmt = Database::pdo()->prepare(
            'DELETE FROM contacts WHERE id = ? AND user_id = ?'
        );
        $stmt->execute([$id, $userId]);
    }

    /**
     * Fonde 2+ anagrafiche in una sola: per ogni "perdente" sposta
     * tutti i riferimenti (expenses.contact_id, incomes.contact_id,
     * recurring_expenses.contact_id) sul "vincitore" e poi cancella
     * il record del perdente. Tutto in UNA sola transazione.
     *
     * @param array<int> $loserIds
     * @return array{
     *     merged:int,
     *     reassigned:array{expenses:int,incomes:int,recurring:int},
     *     winner_id:int,
     *     winner_name:string
     * }
     */
    public static function merge(int $userId, int $winnerId, array $loserIds): array
    {
        if ($winnerId <= 0) {
            throw new InvalidArgumentException('Anagrafica vincitrice non valida.');
        }
        // Dedup + filter losers (numeric, > 0, != winner).
        $losers = [];
        foreach ($loserIds as $lid) {
            $i = (int) $lid;
            if ($i > 0 && $i !== $winnerId) $losers[$i] = true;
        }
        $losers = array_keys($losers);
        if ($losers === []) {
            throw new InvalidArgumentException('Nessuna anagrafica da fondere selezionata.');
        }
        if (count($losers) > 100) {
            throw new InvalidArgumentException('Troppe anagrafiche in una sola fusione (max 100).');
        }

        $pdo = Database::pdo();

        // Verifica ownership di tutti gli id in un colpo.
        $allIds  = array_merge([$winnerId], $losers);
        $in      = implode(',', array_fill(0, count($allIds), '?'));
        $stmt    = $pdo->prepare(
            "SELECT id, name FROM contacts WHERE user_id = ? AND id IN ({$in})"
        );
        $stmt->execute([$userId, ...$allIds]);
        $found = [];
        foreach ($stmt->fetchAll() as $r) {
            $found[(int) $r['id']] = (string) $r['name'];
        }
        if (!isset($found[$winnerId])) {
            throw new InvalidArgumentException('Anagrafica vincitrice non trovata.');
        }
        foreach ($losers as $lid) {
            if (!isset($found[$lid])) {
                throw new InvalidArgumentException('Una delle anagrafiche da fondere non e\' stata trovata.');
            }
        }

        $stats   = ['expenses' => 0, 'incomes' => 0, 'recurring' => 0];
        $merged  = 0;

        $alreadyInTx = $pdo->inTransaction();
        if (!$alreadyInTx) $pdo->beginTransaction();
        try {
            $upExp = $pdo->prepare('UPDATE expenses           SET contact_id = ? WHERE user_id = ? AND contact_id = ?');
            $upInc = $pdo->prepare('UPDATE incomes            SET contact_id = ? WHERE user_id = ? AND contact_id = ?');
            $upRec = $pdo->prepare('UPDATE recurring_expenses SET contact_id = ? WHERE user_id = ? AND contact_id = ?');
            $del   = $pdo->prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?');

            foreach ($losers as $lid) {
                $upExp->execute([$winnerId, $userId, $lid]); $stats['expenses']  += $upExp->rowCount();
                $upInc->execute([$winnerId, $userId, $lid]); $stats['incomes']   += $upInc->rowCount();
                $upRec->execute([$winnerId, $userId, $lid]); $stats['recurring'] += $upRec->rowCount();
                $del->execute([$lid, $userId]);              $merged             += $del->rowCount();
            }

            if (!$alreadyInTx) $pdo->commit();
        } catch (\Throwable $e) {
            if (!$alreadyInTx && $pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }

        return [
            'merged'      => $merged,
            'reassigned'  => $stats,
            'winner_id'   => $winnerId,
            'winner_name' => $found[$winnerId],
        ];
    }

    /**
     * Lista unificata dei movimenti (spese + entrate + ricorrenti) collegati
     * a un'anagrafica, ordinata per data DESC. Usata dal modal di
     * riassegnazione su /contacts/detail.
     *
     * Opts:
     *   - limit  (?int)
     *   - offset (int)  default 0
     *
     * @param array<string,mixed> $opts
     * @return array<int, array<string,mixed>>
     */
    public static function movementsForUser(
        int $userId,
        int $contactId,
        array $opts = []
    ): array {
        $sql = '
            SELECT
                "expense" AS kind,
                e.id AS id,
                e.expense_date AS date,
                e.description AS description,
                e.amount AS amount,
                c.name  AS category_name,
                c.color AS category_color,
                NULL AS last_generated_date
            FROM expenses e
            LEFT JOIN categories c ON c.id = e.category_id
            WHERE e.user_id = ? AND e.contact_id = ?
            UNION ALL
            SELECT
                "income" AS kind,
                i.id AS id,
                i.income_date AS date,
                i.description AS description,
                i.amount AS amount,
                NULL AS category_name,
                NULL AS category_color,
                NULL AS last_generated_date
            FROM incomes i
            WHERE i.user_id = ? AND i.contact_id = ?
            UNION ALL
            SELECT
                "recurring" AS kind,
                r.id AS id,
                COALESCE(r.last_generated_date, r.start_date) AS date,
                r.description AS description,
                r.amount AS amount,
                c.name  AS category_name,
                c.color AS category_color,
                r.last_generated_date AS last_generated_date
            FROM recurring_expenses r
            LEFT JOIN categories c ON c.id = r.category_id
            WHERE r.user_id = ? AND r.contact_id = ?
            ORDER BY date DESC, kind ASC, id DESC';

        $limit  = isset($opts['limit'])  ? (int) $opts['limit']  : null;
        $offset = isset($opts['offset']) ? max(0, (int) $opts['offset']) : 0;

        $stmt = Database::pdo()->prepare(
            $limit !== null ? $sql . ' LIMIT ? OFFSET ?' : $sql
        );
        $i = 1;
        // 6 placeholders per i 3 SELECT (user_id + contact_id ciascuno).
        for ($k = 0; $k < 3; $k++) {
            $stmt->bindValue($i++, $userId,    \PDO::PARAM_INT);
            $stmt->bindValue($i++, $contactId, \PDO::PARAM_INT);
        }
        if ($limit !== null) {
            $stmt->bindValue($i++, $limit,  \PDO::PARAM_INT);
            $stmt->bindValue($i,   $offset, \PDO::PARAM_INT);
        }
        $stmt->execute();
        $rows = $stmt->fetchAll();

        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'kind'                => (string) $r['kind'],
                'id'                  => (int)    $r['id'],
                'date'                => (string) $r['date'],
                'description'         => $r['description'] !== null ? (string) $r['description'] : '',
                'amount'              => round((float) $r['amount'], 2),
                'category_name'       => $r['category_name']  !== null ? (string) $r['category_name']  : null,
                'category_color'      => $r['category_color'] !== null ? (string) $r['category_color'] : null,
                'last_generated_date' => $r['last_generated_date'] !== null ? (string) $r['last_generated_date'] : null,
            ];
        }
        return $out;
    }

    /**
     * Riassegna in blocco un set di movimenti dal contatto sorgente verso
     * uno o più contatti destinazione (granularità per singolo movimento).
     *
     * $items = [
     *   ['kind' => 'expense'|'income'|'recurring', 'id' => int, 'target_contact_id' => int],
     *   ...
     * ]
     *
     * $sourceAction = 'leave' | 'archive' | 'delete'
     *   - leave   : il contatto sorgente resta invariato
     *   - archive : sorgente viene archiviato
     *   - delete  : sorgente viene eliminato (richiede 0 movimenti residui
     *                 dopo la riassegnazione, altrimenti rollback)
     *
     * Tutto in una singola transazione: se anche un solo UPDATE ha rowCount
     * inferiore a quanto richiesto (item non più collegato al sorgente, UI
     * stale, race) viene fatto rollback e lanciata RuntimeException.
     *
     * @param array<int, array{kind:string, id:int, target_contact_id:int}> $items
     * @return array{
     *   reassigned: array{expense:int, income:int, recurring:int},
     *   source_action_applied: string
     * }
     */
    public static function reassignMovements(
        int $userId,
        int $sourceContactId,
        array $items,
        string $sourceAction = 'leave'
    ): array {
        if (!in_array($sourceAction, ['leave', 'archive', 'delete'], true)) {
            throw new InvalidArgumentException('Azione sul contatto sorgente non valida.');
        }
        if ($sourceContactId <= 0) {
            throw new InvalidArgumentException('Contatto sorgente non valido.');
        }
        if (empty($items)) {
            throw new InvalidArgumentException('Nessun movimento selezionato.');
        }

        // Source deve esistere e appartenere all'utente.
        $source = self::findForUser($sourceContactId, $userId);
        if ($source === null) {
            throw new InvalidArgumentException('Anagrafica sorgente non trovata.');
        }

        // Validazione + raggruppamento per (kind, target_contact_id).
        // grouped[kind][target_id] = [movement_id, ...]
        $grouped = ['expense' => [], 'income' => [], 'recurring' => []];
        $targetIds = [];
        foreach ($items as $idx => $it) {
            $kind = isset($it['kind']) ? (string) $it['kind'] : '';
            if (!array_key_exists($kind, $grouped)) {
                throw new InvalidArgumentException("Tipo movimento non valido (item #{$idx}).");
            }
            $mid = (int) ($it['id'] ?? 0);
            $tid = (int) ($it['target_contact_id'] ?? 0);
            if ($mid <= 0 || $tid <= 0) {
                throw new InvalidArgumentException("Movimento o destinazione non valida (item #{$idx}).");
            }
            if ($tid === $sourceContactId) {
                throw new InvalidArgumentException('La destinazione non può coincidere con la sorgente.');
            }
            $grouped[$kind][$tid] = $grouped[$kind][$tid] ?? [];
            $grouped[$kind][$tid][] = $mid;
            $targetIds[$tid] = true;
        }

        // Pre-flight: tutti i target devono appartenere all'utente.
        $targetIdsArr = array_keys($targetIds);
        $pdo = Database::pdo();
        $in = implode(',', array_fill(0, count($targetIdsArr), '?'));
        $stmt = $pdo->prepare(
            "SELECT id FROM contacts WHERE user_id = ? AND id IN ({$in})"
        );
        $stmt->execute([$userId, ...$targetIdsArr]);
        $foundTargets = array_map('intval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
        $missing = array_diff($targetIdsArr, $foundTargets);
        if (!empty($missing)) {
            throw new InvalidArgumentException(
                'Una o più anagrafiche di destinazione non esistono o non sono accessibili.'
            );
        }

        $tableMap = [
            'expense'   => 'expenses',
            'income'    => 'incomes',
            'recurring' => 'recurring_expenses',
        ];

        $reassigned = ['expense' => 0, 'income' => 0, 'recurring' => 0];

        $pdo->beginTransaction();
        try {
            foreach ($grouped as $kind => $byTarget) {
                $table = $tableMap[$kind];
                foreach ($byTarget as $targetId => $movementIds) {
                    if (empty($movementIds)) continue;
                    $movementIds = array_values(array_unique($movementIds));
                    $expected    = count($movementIds);
                    $inIds = implode(',', array_fill(0, $expected, '?'));
                    $upd = $pdo->prepare(
                        "UPDATE {$table}
                         SET contact_id = ?
                         WHERE user_id = ? AND contact_id = ? AND id IN ({$inIds})"
                    );
                    $upd->execute([
                        $targetId, $userId, $sourceContactId,
                        ...$movementIds,
                    ]);
                    $rc = $upd->rowCount();
                    if ($rc !== $expected) {
                        throw new RuntimeException(
                            "Alcuni movimenti non sono più collegati a questa anagrafica " .
                            "(attesi {$expected}, aggiornati {$rc}). " .
                            'Ricarica la pagina e riprova.'
                        );
                    }
                    $reassigned[$kind] += $rc;
                }
            }

            // Azione sul sorgente.
            if ($sourceAction === 'archive') {
                $pdo->prepare('UPDATE contacts SET archived = 1 WHERE id = ? AND user_id = ?')
                    ->execute([$sourceContactId, $userId]);
            } elseif ($sourceAction === 'delete') {
                // Ricontrolla che non resti alcun movimento collegato (dentro la
                // transazione, dopo gli UPDATE).
                $usage = self::usageCount($sourceContactId, $userId);
                if ($usage['total'] > 0) {
                    throw new RuntimeException(
                        "Anagrafica ha ancora {$usage['total']} movimenti collegati: " .
                        'eliminazione annullata. Riassegna anche i movimenti residui.'
                    );
                }
                $pdo->prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?')
                    ->execute([$sourceContactId, $userId]);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        return [
            'reassigned'            => $reassigned,
            'source_action_applied' => $sourceAction,
        ];
    }

    /**
     * Conta quante spese/entrate/ricorrenti referenziano l'anagrafica.
     * @return array{expenses:int, incomes:int, recurring:int, total:int}
     */
    public static function usageCount(int $id, int $userId): array
    {
        $pdo = Database::pdo();
        $q = function (string $table, string $col) use ($pdo, $id, $userId): int {
            $stmt = $pdo->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE {$col} = ? AND user_id = ?"
            );
            $stmt->execute([$id, $userId]);
            return (int) $stmt->fetchColumn();
        };
        $e = $q('expenses', 'contact_id');
        $i = $q('incomes', 'contact_id');
        $r = $q('recurring_expenses', 'contact_id');
        return ['expenses' => $e, 'incomes' => $i, 'recurring' => $r, 'total' => $e + $i + $r];
    }

    /**
     * Bilancio sintetico per anagrafica nel periodo dato.
     * Combina spese ed entrate; ordina per |net| decrescente.
     *
     * @param ?string $type Filtro display 'supplier' | 'customer' | null
     * @return array<int, array<string,mixed>>
     */
    public static function balanceSummary(
        int $userId, string $fromDate, string $toDate, ?string $type = null
    ): array {
        $pdo = Database::pdo();

        $expSql = 'SELECT contact_id,
                          COALESCE(SUM(amount), 0) AS total,
                          COUNT(*)                 AS cnt
                   FROM expenses
                   WHERE user_id = ? AND contact_id IS NOT NULL
                     AND expense_date BETWEEN ? AND ?
                   GROUP BY contact_id';
        $stmt = $pdo->prepare($expSql);
        $stmt->execute([$userId, $fromDate, $toDate]);
        $exp = [];
        foreach ($stmt->fetchAll() as $r) {
            $exp[(int) $r['contact_id']] = [(float) $r['total'], (int) $r['cnt']];
        }

        $incSql = 'SELECT contact_id,
                          COALESCE(SUM(amount), 0) AS total,
                          COUNT(*)                 AS cnt
                   FROM incomes
                   WHERE user_id = ? AND contact_id IS NOT NULL
                     AND income_date BETWEEN ? AND ?
                   GROUP BY contact_id';
        $stmt = $pdo->prepare($incSql);
        $stmt->execute([$userId, $fromDate, $toDate]);
        $inc = [];
        foreach ($stmt->fetchAll() as $r) {
            $inc[(int) $r['contact_id']] = [(float) $r['total'], (int) $r['cnt']];
        }

        $ids = array_unique([...array_keys($exp), ...array_keys($inc)]);
        if (empty($ids)) return [];

        $in = implode(',', array_fill(0, count($ids), '?'));
        $sql = "SELECT id, name, type, color FROM contacts
                WHERE user_id = ? AND id IN ({$in})";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$userId, ...$ids]);
        $contacts = [];
        foreach ($stmt->fetchAll() as $c) {
            $contacts[(int) $c['id']] = $c;
        }

        $out = [];
        foreach ($ids as $cid) {
            if (!isset($contacts[$cid])) continue;
            $c = $contacts[$cid];
            if ($type === 'supplier' && !in_array($c['type'], ['supplier', 'both'], true)) continue;
            if ($type === 'customer' && !in_array($c['type'], ['customer', 'both'], true)) continue;

            $eTot = $exp[$cid][0] ?? 0.0;
            $eCnt = $exp[$cid][1] ?? 0;
            $iTot = $inc[$cid][0] ?? 0.0;
            $iCnt = $inc[$cid][1] ?? 0;
            $out[] = [
                'contact_id'      => $cid,
                'name'            => (string) $c['name'],
                'type'            => (string) $c['type'],
                'color'           => (string) $c['color'],
                'expenses_total'  => round($eTot, 2),
                'incomes_total'   => round($iTot, 2),
                'net'             => round($iTot - $eTot, 2),
                'expenses_count'  => $eCnt,
                'incomes_count'   => $iCnt,
            ];
        }
        usort($out, fn($a, $b) => abs($b['net']) <=> abs($a['net']));
        return $out;
    }

    /**
     * Distribuzione per categoria delle spese per un singolo contatto.
     * @return array<int, array<string,mixed>>
     */
    public static function breakdownByCategory(
        int $userId, int $contactId, string $fromDate, string $toDate
    ): array {
        $stmt = Database::pdo()->prepare(
            'SELECT c.id   AS category_id,
                    COALESCE(c.name, \'(senza categoria)\') AS category_name,
                    COALESCE(c.color, \'#6c757d\')          AS category_color,
                    COALESCE(c.icon,  \'tag\')              AS category_icon,
                    COALESCE(SUM(e.amount), 0)              AS total,
                    COUNT(*)                                AS cnt
             FROM expenses e
             LEFT JOIN categories c ON c.id = e.category_id
             WHERE e.user_id = ? AND e.contact_id = ?
               AND e.expense_date BETWEEN ? AND ?
             GROUP BY c.id, c.name, c.color, c.icon
             ORDER BY total DESC'
        );
        $stmt->execute([$userId, $contactId, $fromDate, $toDate]);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[] = [
                'category_id'    => $r['category_id'] !== null ? (int) $r['category_id'] : null,
                'category_name'  => (string) $r['category_name'],
                'category_color' => (string) $r['category_color'],
                'category_icon'  => (string) $r['category_icon'],
                'total'          => round((float) $r['total'], 2),
                'count'          => (int) $r['cnt'],
            ];
        }
        return $out;
    }

    /**
     * Conta (senza scrivere) quanti expenses/incomes/recurring verrebbero
     * collegati da applyBackfill se chiamato per il nome dato. Stessi
     * predicati LIKE / soglia minima 4 char di applyBackfill — usato dalla
     * preview dell'estratto conto per mostrare in anticipo l'effetto del
     * backfill al commit.
     *
     * @return array{expenses:int, incomes:int, recurring:int}
     */
    public static function previewBackfillCount(int $userId, string $name): array
    {
        $name = trim($name);
        if (mb_strlen($name) < 4) {
            return ['expenses' => 0, 'incomes' => 0, 'recurring' => 0];
        }
        $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $name);
        $like    = '%' . $escaped . '%';

        $pdo = Database::pdo();

        $exp = $pdo->prepare(
            'SELECT COUNT(*) FROM expenses
             WHERE user_id = ? AND contact_id IS NULL AND description LIKE ?'
        );
        $exp->execute([$userId, $like]);

        $inc = $pdo->prepare(
            'SELECT COUNT(*) FROM incomes
             WHERE user_id = ? AND contact_id IS NULL
               AND (description LIKE ? OR source LIKE ?)'
        );
        $inc->execute([$userId, $like, $like]);

        $rec = $pdo->prepare(
            'SELECT COUNT(*) FROM recurring_expenses
             WHERE user_id = ? AND contact_id IS NULL AND description LIKE ?'
        );
        $rec->execute([$userId, $like]);

        return [
            'expenses'  => (int) $exp->fetchColumn(),
            'incomes'   => (int) $inc->fetchColumn(),
            'recurring' => (int) $rec->fetchColumn(),
        ];
    }

    /**
     * Esegui un backfill manuale: collega expenses/incomes/recurring esistenti
     * senza contact_id che menzionano il nome del contatto in descrizione/source.
     *
     * @return array{expenses:int, incomes:int, recurring:int}
     */
    public static function backfillByDescription(int $userId, int $contactId): array
    {
        $contact = self::findForUser($contactId, $userId);
        if ($contact === null) return ['expenses' => 0, 'incomes' => 0, 'recurring' => 0];
        return self::applyBackfill($userId, $contactId, (string) $contact['name']);
    }

    /**
     * UPDATE LIKE-based su expenses/incomes/recurring_expenses per collegare
     * righe ancora orfane (`contact_id IS NULL`) la cui descrizione (o `source`
     * per incomes) contiene il nome del contatto. Case-insensitive grazie alla
     * collation utf8mb4_unicode_ci. Skippa nomi sotto i 4 char per limitare
     * i falsi positivi (es. "BB", "Sky").
     *
     * @return array{expenses:int, incomes:int, recurring:int}
     */
    private static function applyBackfill(int $userId, int $contactId, string $name): array
    {
        $name = trim($name);
        if (mb_strlen($name) < 4) {
            return ['expenses' => 0, 'incomes' => 0, 'recurring' => 0];
        }

        // Escapa wildcard LIKE prima di inserire nel pattern '%name%'.
        $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $name);
        $like    = '%' . $escaped . '%';

        $pdo = Database::pdo();

        $exp = $pdo->prepare(
            'UPDATE expenses SET contact_id = ?
             WHERE user_id = ? AND contact_id IS NULL AND description LIKE ?'
        );
        $exp->execute([$contactId, $userId, $like]);

        $inc = $pdo->prepare(
            'UPDATE incomes SET contact_id = ?
             WHERE user_id = ? AND contact_id IS NULL
               AND (description LIKE ? OR source LIKE ?)'
        );
        $inc->execute([$contactId, $userId, $like, $like]);

        $rec = $pdo->prepare(
            'UPDATE recurring_expenses SET contact_id = ?
             WHERE user_id = ? AND contact_id IS NULL AND description LIKE ?'
        );
        $rec->execute([$contactId, $userId, $like]);

        return [
            'expenses'  => $exp->rowCount(),
            'incomes'   => $inc->rowCount(),
            'recurring' => $rec->rowCount(),
        ];
    }

    /**
     * @return array{name:string, name_norm:string, type:string, vat_number:?string,
     *               iban:?string, email:?string, notes:?string, color:string}
     */
    private static function validate(string $name, string $type, array $details): array
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 120) {
            throw new InvalidArgumentException('Nome anagrafica obbligatorio (max 120 caratteri).');
        }
        if (!in_array($type, self::TYPES, true)) {
            throw new InvalidArgumentException('Tipo anagrafica non valido.');
        }

        $vat   = isset($details['vat_number']) ? trim((string) $details['vat_number']) : '';
        $iban  = isset($details['iban'])       ? trim((string) $details['iban'])       : '';
        $email = isset($details['email'])      ? trim((string) $details['email'])      : '';
        $notes = isset($details['notes'])      ? trim((string) $details['notes'])      : '';
        $color = isset($details['color'])      ? trim((string) $details['color'])      : '';

        if ($vat !== '' && mb_strlen($vat) > 32) {
            throw new InvalidArgumentException('P.IVA / CF troppo lungo (max 32 caratteri).');
        }
        if ($iban !== '') {
            $iban = strtoupper(preg_replace('/\s+/', '', $iban));
            if (mb_strlen($iban) > 34) {
                throw new InvalidArgumentException('IBAN troppo lungo.');
            }
            if (!preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/', $iban)) {
                throw new InvalidArgumentException('Formato IBAN non valido.');
            }
        }
        if ($email !== '') {
            if (mb_strlen($email) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException('Email non valida.');
            }
        }
        if ($color === '') $color = '#6c757d';
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            throw new InvalidArgumentException('Colore non valido.');
        }

        return [
            'name'       => $name,
            'name_norm'  => self::normalize($name),
            'type'       => $type,
            'vat_number' => $vat   === '' ? null : $vat,
            'iban'       => $iban  === '' ? null : $iban,
            'email'      => $email === '' ? null : $email,
            'notes'      => $notes === '' ? null : $notes,
            'color'      => strtolower($color),
        ];
    }
}
