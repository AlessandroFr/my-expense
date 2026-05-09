<?php
declare(strict_types=1);

namespace App\Validation\Requests;

use App\Validation\Rule;

/**
 * Form request per POST /categories/update.
 */
final class UpdateCategoryRequest extends ValidatedRequest
{
    /**
     * @return array<string, string|list<string|Rule>|Rule>
     */
    public function rules(): array
    {
        return [
            'id'         => 'required|integer|min:1',
            'name'       => 'required|string|max:64',
            'color'      => 'nullable|string|regex:/^#[0-9a-fA-F]{6}$/',
            'icon'       => 'nullable|string|max:32',
            'sort_order' => 'nullable|integer',
        ];
    }
}
