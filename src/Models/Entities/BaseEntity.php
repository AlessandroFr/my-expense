<?php
declare(strict_types=1);

namespace App\Models\Entities;

use JsonSerializable;

/**
 * Classe base per Entity. Le sottoclassi sono POPO immutabili (proprieta' readonly)
 * con costruttore che accetta solo dati gia' validati/coerciti.
 *
 * fromRow() esegue la hydratazione da row PDO.
 * toArray()/jsonSerialize() esponono i dati in forma serializzabile (per Response::json).
 *
 * Convenzione: la sottoclasse override fromRow() per gestire cast specifici
 * (es. DECIMAL stringa -> float, DATE stringa -> ISO 8601).
 */
abstract class BaseEntity implements JsonSerializable
{
    /**
     * Hydrata l'entita' da una row associativa fetched da PDO.
     *
     * @param array<string, mixed> $row
     */
    abstract public static function fromRow(array $row): static;

    /**
     * @return array<string, mixed>
     */
    abstract public function toArray(): array;

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
