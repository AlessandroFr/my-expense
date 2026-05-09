<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\DatabaseReset;
use App\Http\HttpException;
use App\Http\Request;
use App\Http\Response;

/**
 * Settings + DB reset (Zona pericolosa). Triple gating: phrase + password + scope.
 */
final class SettingsController extends BaseController
{
    /** GET /settings */
    public function index(Request $request): Response
    {
        return $this->view('settings.index', ['title' => 'Impostazioni']);
    }

    /** POST /db/reset */
    public function dbReset(Request $request): Response
    {
        $userId   = $this->userId();
        $scope    = (string) ($request->input('scope') ?? '');
        $phrase   = trim((string) ($request->input('confirm_phrase') ?? ''));
        $password = (string) ($request->input('password') ?? '');

        if (!in_array($scope, DatabaseReset::ALLOWED_SCOPES, true)) {
            throw HttpException::badRequest('Ambito di reset non valido.');
        }
        if ($phrase !== 'ELIMINA TUTTO') {
            throw HttpException::badRequest('Frase di conferma errata. Digita esattamente "ELIMINA TUTTO".');
        }
        if ($password === '') {
            throw HttpException::badRequest('Password obbligatoria.');
        }
        if (!Auth::verifyPassword($userId, $password)) {
            throw HttpException::forbidden('Password errata.');
        }

        $counters = DatabaseReset::execute($userId, $scope);
        return $this->json([
            'scope'    => $scope,
            'counters' => $counters,
        ]);
    }
}
