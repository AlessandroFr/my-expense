<?php
declare(strict_types=1);

namespace App\Validation\Requests;

use App\Validation\Rule;

/**
 * Form request per POST /expenses/update.
 * Differisce da Create solo per il campo `id` required.
 */
final class UpdateExpenseRequest extends ValidatedRequest
{
    /**
     * @return array<string, string|list<string|Rule>|Rule>
     */
    public function rules(): array
    {
        return [
            'id'             => 'required|integer|min:1',
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
        ];
    }
}
