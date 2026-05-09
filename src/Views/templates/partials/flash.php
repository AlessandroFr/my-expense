<?php
/**
 * @var \App\Views\View $this
 *
 * Banner messaggi flash. Consuma e cancella i messaggi pendenti.
 * Setta il messaggio con App\Session::flash('success'|'error'|'warning'|'info', '...').
 *
 * Migrato da public/components/flash.php (sara' rimosso al cleanup C15).
 */

use App\Session;

$flashes = Session::takeFlash();
if (empty($flashes)) {
    return;
}

$classMap = [
    'success' => 'alert-success',
    'error'   => 'alert-danger',
    'warning' => 'alert-warning',
    'info'    => 'alert-info',
];
$iconMap = [
    'success' => 'bi-check-circle',
    'error'   => 'bi-x-circle',
    'warning' => 'bi-exclamation-triangle',
    'info'    => 'bi-info-circle',
];
?>
<?php foreach ($flashes as $f): ?>
    <?php
    $cls  = $classMap[$f['type']] ?? 'alert-info';
    $icon = $iconMap[$f['type']]  ?? 'bi-info-circle';
    ?>
    <div class="alert <?= $this->escape($cls) ?> alert-dismissible fade show" role="alert">
        <i class="bi <?= $this->escape($icon) ?> me-2"></i>
        <?= $this->escape($f['message']) ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Chiudi"></button>
    </div>
<?php endforeach; ?>
