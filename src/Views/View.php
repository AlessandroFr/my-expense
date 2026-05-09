<?php
declare(strict_types=1);

namespace App\Views;

use App\Config;
use App\Csrf;
use RuntimeException;

/**
 * View renderer minimalista con layout inheritance, sezioni e include.
 *
 * Sostituisce extract($data, EXTR_SKIP) + require $layoutFile di public/index.php:366-367.
 *
 * Sintassi nei template:
 *   <?php $this->extends('layouts.app'); ?>
 *   <?php $this->section('content'); ?>
 *     <h1><?= $this->escape($this->title) ?></h1>
 *   <?php $this->endSection(); ?>
 *
 *   <?= $this->yield('content') ?>             // dentro al layout
 *   <?= $this->include('partials.flash') ?>    // include un altro template
 *   <?= $this->asset('css/app.css') ?>         // URL asset con cache busting
 *   <?= $this->csrfField() ?>                  // hidden _csrf input
 *
 * Le variabili passate al render() diventano accessibili come $this->varName
 * (piu' sicuro di extract: nessun shadowing accidentale).
 *
 * Path resolution: 'expenses.index' -> {projectRoot}/src/Views/templates/expenses/index.php
 */
final class View
{
    private static string $projectRoot = '';

    /** Nome del layout dichiarato dal template tramite $this->extends() */
    private ?string $extendsLayout = null;

    /** @var array<string, string> sezioni catturate */
    private array $sections = [];

    /** Nome della sezione attualmente catturata via ob_start (null se nessuna) */
    private ?string $currentSection = null;

    /**
     * @param array<string, mixed> $data
     */
    private function __construct(
        private readonly string $template,
        private readonly array $data,
    ) {
    }

    /**
     * Imposta la root del progetto. Chiamato una volta dal Kernel durante il bootstrap.
     */
    public static function setProjectRoot(string $root): void
    {
        self::$projectRoot = rtrim($root, "/\\");
    }

    /**
     * Render entrypoint pubblico: ritorna l'HTML completo.
     *
     * @param array<string, mixed> $data
     */
    public static function render(string $template, array $data = []): string
    {
        $view = new self($template, $data);
        return $view->renderInternal();
    }

    private function renderInternal(): string
    {
        ob_start();
        $this->includeTemplate($this->resolvePath($this->template));
        $body = (string) ob_get_clean();

        if ($this->extendsLayout === null) {
            return $body;
        }

        // Se il body non ha definito sezioni nominate ma ha output diretto,
        // lo registriamo come sezione 'content' di default.
        if ($this->sections === [] && trim($body) !== '') {
            $this->sections['content'] = $body;
        }

        $layoutPath = $this->resolvePath($this->extendsLayout);
        $this->extendsLayout = null;
        ob_start();
        $this->includeTemplate($layoutPath);
        return (string) ob_get_clean();
    }

    /**
     * Include il template PHP con $this bindato a questa istanza.
     */
    private function includeTemplate(string $path): void
    {
        if (!is_file($path)) {
            throw new RuntimeException("Template non trovato: {$path}");
        }
        require $path;
    }

    private function resolvePath(string $template): string
    {
        if (self::$projectRoot === '') {
            throw new RuntimeException('View::setProjectRoot() non chiamato. Lo deve fare Kernel::bootstrap().');
        }
        $rel = str_replace('.', '/', $template);
        return self::$projectRoot . '/src/Views/templates/' . $rel . '.php';
    }

    // --------- API esposta ai template (chiamata via $this->...) ---------

    public function extends(string $layout): void
    {
        $this->extendsLayout = $layout;
    }

    public function section(string $name): void
    {
        if ($this->currentSection !== null) {
            throw new RuntimeException("Sezione '{$this->currentSection}' aperta -- chiudere con endSection() prima di aprire '{$name}'.");
        }
        $this->currentSection = $name;
        ob_start();
    }

    public function endSection(): void
    {
        if ($this->currentSection === null) {
            throw new RuntimeException('endSection() chiamato senza section() corrispondente.');
        }
        $this->sections[$this->currentSection] = (string) ob_get_clean();
        $this->currentSection = null;
    }

    public function yield(string $name, string $default = ''): string
    {
        return $this->sections[$name] ?? $default;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function include(string $partial, array $data = []): string
    {
        $merged = array_merge($this->data, $data);
        $sub = new self($partial, $merged);
        return $sub->renderInternal();
    }

    /**
     * Riproduce l'helper $asset() di public/index.php:357-361:
     * URL relativo all'app + cache busting via filemtime.
     */
    public function asset(string $relPath): string
    {
        $base = rtrim((string) (Config::get('app')['base_url'] ?? ''), '/');
        $full = self::$projectRoot . '/public/' . ltrim($relPath, '/');
        $v    = is_file($full) ? (string) filemtime($full) : '0';
        return htmlspecialchars(
            $base . '/' . ltrim($relPath, '/') . '?v=' . $v,
            ENT_QUOTES,
            'UTF-8',
        );
    }

    public function csrfField(): string
    {
        return Csrf::field();
    }

    public function csrfToken(): string
    {
        return Csrf::token();
    }

    public function baseUrl(): string
    {
        return rtrim((string) (Config::get('app')['base_url'] ?? ''), '/');
    }

    public function escape(mixed $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }

    /**
     * Magic getter: $this->varName legge dal data passato a render().
     */
    public function __get(string $name): mixed
    {
        return $this->data[$name] ?? null;
    }

    public function __isset(string $name): bool
    {
        return isset($this->data[$name]);
    }
}
