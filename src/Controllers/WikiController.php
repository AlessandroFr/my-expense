<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Http\Request;
use App\Http\Response;

/**
 * Guida utente (SPA single-page) accessibile sia da loggati sia da ospiti.
 * La rotta /wiki e' pubblica: il template gestisce le due modalita' rispondendo a $isGuest.
 */
final class WikiController extends BaseController
{
    /** GET /wiki */
    public function index(Request $request): Response
    {
        return $this->view('wiki.index', [
            'title'   => 'Guida',
            'isGuest' => !Auth::check(),
        ]);
    }
}
