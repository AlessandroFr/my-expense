<?php
declare(strict_types=1);

namespace App\Validation\Requests;

use App\Validation\Rule;

/**
 * Form request per POST /categories/create.
 */
final class CreateCategoryRequest extends ValidatedRequest
{
    /**
     * @return array<string, string|list<string|Rule>|Rule>
     */
    public function rules(): array
    {
        return [
            'name'       => 'required|string|max:64',
            'color'      => 'nullable|string|regex:/^#[0-9a-fA-F]{6}$/',
            'icon'       => 'nullable|string|max:32',
            'sort_order' => 'nullable|integer',
        ];
    }
}
