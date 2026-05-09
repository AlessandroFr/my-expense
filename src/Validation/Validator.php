<?php
declare(strict_types=1);

namespace App\Validation;

use App\Http\HttpException;
use DateTimeImmutable;

/**
 * Rule-based validator con sintassi pipe-separated:
 *   ['amount' => 'required|numeric|min:0.01|max:99999999.99']
 *
 * Regole built-in: required, nullable, string, integer, numeric, boolean,
 *                  min:N, max:N, in:a,b,c, date, date_format:..., email, regex:...,
 *                  array.
 *
 * I parametri di rule sono separati da `:` e i valori multipli da `,`.
 *
 * Per regole custom, passare istanze di App\Validation\Rule al posto della stringa.
 */
final class Validator
{
    private const INVALID = '__VALIDATOR_INVALID__';

    /** @var array<string, list<string>> */
    private array $errors = [];

    /** @var array<string, mixed> */
    private array $clean = [];

    /**
     * @param array<string, mixed>                              $data
     * @param array<string, string|list<string|Rule>|Rule>      $rules
     */
    public function __construct(
        private readonly array $data,
        private readonly array $rules,
    ) {
        $this->run();
    }

    /**
     * @param array<string, mixed>                              $data
     * @param array<string, string|list<string|Rule>|Rule>      $rules
     */
    public static function make(array $data, array $rules): self
    {
        return new self($data, $rules);
    }

    public function fails(): bool
    {
        return $this->errors !== [];
    }

    /**
     * @return array<string, list<string>>
     */
    public function errors(): array
    {
        return $this->errors;
    }

    /**
     * @return array<string, mixed>  Solo i campi presenti nelle regole, tipo-coerciti.
     */
    public function validated(): array
    {
        return $this->clean;
    }

    /**
     * @throws HttpException 422 con details = errori
     * @return array<string, mixed>
     */
    public function throw(): array
    {
        if ($this->fails()) {
            throw HttpException::unprocessable(
                $this->firstErrorMessage(),
                $this->errors,
            );
        }
        return $this->clean;
    }

    private function firstErrorMessage(): string
    {
        foreach ($this->errors as $messages) {
            if (isset($messages[0])) {
                return (string) $messages[0];
            }
        }
        return 'Validazione fallita.';
    }

    private function run(): void
    {
        foreach ($this->rules as $field => $ruleset) {
            $value = $this->data[$field] ?? null;
            $rules = $this->normalizeRules($ruleset);

            $isNullable = false;
            $isRequired = false;
            foreach ($rules as $r) {
                if ($r === 'nullable') {
                    $isNullable = true;
                }
                if ($r === 'required') {
                    $isRequired = true;
                }
            }

            if ($isRequired && $this->isEmpty($value)) {
                $this->addError($field, "Il campo {$field} e' obbligatorio.");
                continue;
            }

            if ($this->isEmpty($value)) {
                if ($isNullable || !$isRequired) {
                    $this->clean[$field] = null;
                }
                continue;
            }

            $finalValue = $value;
            foreach ($rules as $rule) {
                if ($rule === 'required' || $rule === 'nullable') {
                    continue;
                }
                if ($rule instanceof Rule) {
                    $result = $rule->passes($field, $finalValue, $this->data);
                    if ($result !== true) {
                        $this->addError($field, is_string($result) ? $result : "Il campo {$field} non e' valido.");
                    }
                    continue;
                }

                [$name, $args] = $this->parseRule($rule);
                $coerced = $this->applyRule($field, $finalValue, $name, $args);
                if ($coerced === self::INVALID) {
                    break;
                }
                $finalValue = $coerced;
            }

            if (!isset($this->errors[$field])) {
                $this->clean[$field] = $finalValue;
            }
        }
    }

    /**
     * @param string|list<string|Rule>|Rule $ruleset
     * @return list<string|Rule>
     */
    private function normalizeRules(string|array|Rule $ruleset): array
    {
        if ($ruleset instanceof Rule) {
            return [$ruleset];
        }
        if (is_string($ruleset)) {
            return $ruleset === '' ? [] : explode('|', $ruleset);
        }
        return array_values($ruleset);
    }

    /**
     * @return array{0:string, 1:list<string>}
     */
    private function parseRule(string $rule): array
    {
        if (!str_contains($rule, ':')) {
            return [$rule, []];
        }
        [$name, $argString] = explode(':', $rule, 2);
        return [$name, explode(',', $argString)];
    }

    /**
     * @param list<string> $args
     * @return mixed Returns coerced value, oppure self::INVALID se la rule fallisce.
     */
    private function applyRule(string $field, mixed $value, string $name, array $args): mixed
    {
        switch ($name) {
            case 'string':
                if (!is_string($value)) {
                    if (is_scalar($value)) {
                        return (string) $value;
                    }
                    $this->addError($field, "Il campo {$field} deve essere una stringa.");
                    return self::INVALID;
                }
                return $value;

            case 'integer':
                if (is_int($value)) {
                    return $value;
                }
                if (is_string($value) && preg_match('/^-?\d+$/', trim($value))) {
                    return (int) $value;
                }
                if (is_float($value) && floor($value) === $value) {
                    return (int) $value;
                }
                $this->addError($field, "Il campo {$field} deve essere un intero.");
                return self::INVALID;

            case 'numeric':
                if (is_int($value) || is_float($value)) {
                    return (float) $value;
                }
                if (is_string($value)) {
                    $normalized = trim(str_replace(',', '.', $value));
                    if (is_numeric($normalized)) {
                        return (float) $normalized;
                    }
                }
                $this->addError($field, "Il campo {$field} deve essere un numero.");
                return self::INVALID;

            case 'boolean':
                if (is_bool($value)) {
                    return $value;
                }
                if (in_array($value, [0, 1, '0', '1', 'true', 'false', 'on', 'off'], true)) {
                    return in_array($value, [1, '1', 'true', 'on'], true);
                }
                $this->addError($field, "Il campo {$field} deve essere booleano.");
                return self::INVALID;

            case 'min':
                $threshold = (float) ($args[0] ?? '0');
                if (is_string($value)) {
                    if (mb_strlen($value) < $threshold) {
                        $this->addError($field, "Il campo {$field} deve avere almeno {$threshold} caratteri.");
                        return self::INVALID;
                    }
                } elseif ((float) $value < $threshold) {
                    $this->addError($field, "Il campo {$field} deve essere >= {$threshold}.");
                    return self::INVALID;
                }
                return $value;

            case 'max':
                $threshold = (float) ($args[0] ?? '0');
                if (is_string($value)) {
                    if (mb_strlen($value) > $threshold) {
                        $this->addError($field, "Il campo {$field} deve avere al massimo {$threshold} caratteri.");
                        return self::INVALID;
                    }
                } elseif ((float) $value > $threshold) {
                    $this->addError($field, "Il campo {$field} deve essere <= {$threshold}.");
                    return self::INVALID;
                }
                return $value;

            case 'in':
                $allowed = $args;
                $cmp = is_int($value) || is_float($value) ? (string) $value : $value;
                if (!in_array((string) $cmp, $allowed, true)) {
                    $this->addError($field, "Il campo {$field} deve essere uno tra: " . implode(', ', $allowed) . '.');
                    return self::INVALID;
                }
                return $value;

            case 'date':
                if (!is_string($value)) {
                    $this->addError($field, "Il campo {$field} deve essere una data.");
                    return self::INVALID;
                }
                try {
                    new DateTimeImmutable($value);
                } catch (\Throwable) {
                    $this->addError($field, "Il campo {$field} non e' una data valida.");
                    return self::INVALID;
                }
                return $value;

            case 'date_format':
                $format = $args[0] ?? 'Y-m-d';
                if (!is_string($value)) {
                    $this->addError($field, "Il campo {$field} deve rispettare il formato {$format}.");
                    return self::INVALID;
                }
                $dt = DateTimeImmutable::createFromFormat($format, $value);
                if (!$dt || $dt->format($format) !== $value) {
                    $this->addError($field, "Il campo {$field} deve rispettare il formato {$format}.");
                    return self::INVALID;
                }
                return $value;

            case 'email':
                if (!is_string($value) || !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                    $this->addError($field, "Il campo {$field} deve essere un'email valida.");
                    return self::INVALID;
                }
                return $value;

            case 'regex':
                $pattern = $args[0] ?? '';
                if (!is_string($value) || $pattern === '' || !@preg_match($pattern, $value)) {
                    $this->addError($field, "Il campo {$field} non rispetta il formato richiesto.");
                    return self::INVALID;
                }
                return $value;

            case 'array':
                if (!is_array($value)) {
                    $this->addError($field, "Il campo {$field} deve essere un array.");
                    return self::INVALID;
                }
                return $value;

            default:
                error_log("[my-expense] Validator: regola sconosciuta '{$name}' per campo '{$field}'");
                return $value;
        }
    }

    private function isEmpty(mixed $value): bool
    {
        return $value === null || $value === '' || (is_array($value) && $value === []);
    }

    private function addError(string $field, string $message): void
    {
        $this->errors[$field][] = $message;
    }
}
