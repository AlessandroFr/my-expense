<?php
declare(strict_types=1);

namespace App\Validation\Requests;

use App\Validation\Rule;

/**
 * Form request per POST /incomes/create.
 */
final class CreateIncomeRequest extends ValidatedRequest
{
    /** @return array<string, string|list<string|Rule>|Rule> */
    public function rules(): array
    {
        return [
            'income_date' => 'required|date_format:Y-m-d',
            'amount'      => 'required|numeric|min:0.01|max:99999999.99',
            'source'      => 'required|string|max:64',
            'account_id'  => 'nullable|integer',
            'contact_id'  => 'nullable|integer',
            'contact_name'=> 'nullable|string|max:120',
            'description' => 'nullable|string|max:8192',
        ];
    }
}
