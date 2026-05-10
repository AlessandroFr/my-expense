<?php
declare(strict_types=1);

namespace App\Validation\Requests;

use App\Validation\Rule;

/**
 * Form request per POST /expenses/create.
 * Definisce le rules "shape" (tipi, formati, range numerici).
 * Le regole di dominio (cash->cash account, share<=amount, ecc.) sono nel
 * Service via ExpenseService::normalizeAndValidate.
 */
final class CreateExpenseRequest extends ValidatedRequest
{
    /**
     * @return array<string, string|list<string|Rule>|Rule>
     */
    public function rules(): array
    {
        return [
            'expense_date'   => 'required|date_format:Y-m-d',
            'amount'         => 'required|numeric|min:0.01|max:99999999.99',
            'payment_method' => 'required|in:cash,card,transfer,other',
            'category_id'    => 'nullable|integer',
            'account_id'     => 'nullable|integer',
            'contact_id'     => 'nullable|integer',
            'contact_name'   => 'nullable|string|max:120',
            'description'    => 'nullable|string|max:8192',
            'shared_with'    => 'nullable|string|max:255',
            'share_amount'   => 'nullable|numeric|min:0.01|max:99999999.99',
            'tags'           => 'nullable|string|max:1024',
            // Rateizzazione opzionale. Se installment_enabled=1 e count>=2 il
            // Service esplode l'importo in N rate (vedi InstallmentCalculator).
            // I bounds duri (count 2..60, days 1..365, frequency in {...}) sono
            // applicati lato Service/Calculator: qui solo shape minimo.
            'installment_enabled'     => 'nullable',
            'installment_count'       => 'nullable|integer|min:1|max:60',
            'installment_frequency'   => 'nullable|in:monthly,weekly,custom',
            'installment_custom_days' => 'nullable|integer|min:1|max:365',
        ];
    }
}
