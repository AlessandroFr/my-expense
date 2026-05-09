<?php
declare(strict_types=1);

namespace App\Validation\Requests;

use App\Http\Request;
use App\Validation\Rule;
use App\Validation\Validator;

/**
 * Classe base per Form Request: ogni mutazione di dominio definisce una sottoclasse
 * con il proprio set di regole.
 *
 * Esempio:
 *   final class CreateExpenseRequest extends ValidatedRequest {
 *     public function rules(): array {
 *       return [
 *         'amount'       => 'required|numeric|min:0.01|max:99999999.99',
 *         'expense_date' => 'required|date',
 *         'payment'      => 'required|in:cash,card,transfer,direct_debit,other',
 *         'category_id'  => 'nullable|integer',
 *       ];
 *     }
 *   }
 *
 *   // nel Controller:
 *   $clean = CreateExpenseRequest::from($request);
 */
abstract class ValidatedRequest
{
    /**
     * @return array<string, string|list<string|Rule>|Rule>
     */
    abstract public function rules(): array;

    /**
     * Esegue la validazione sui dati combinati di $request->all() (query + json + post).
     * Lancia HttpException 422 con details=errori se la validazione fallisce.
     *
     * @return array<string, mixed>  campi puliti e tipo-coerciti
     */
    public static function from(Request $request): array
    {
        $instance = new static();
        return Validator::make($request->all(), $instance->rules())->throw();
    }

    /**
     * Variante che restituisce il Validator invece di lanciare. Utile quando il
     * Controller vuole gestire gli errori manualmente.
     */
    public static function validate(Request $request): Validator
    {
        $instance = new static();
        return Validator::make($request->all(), $instance->rules());
    }
}
