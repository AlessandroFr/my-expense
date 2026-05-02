<?php
/**
 * Banner messaggi flash. Consuma e cancella i messaggi pendenti.
 * Setta il messaggio con App\Session::flash('success'|'error'|'warning'|'info', '...').
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
    <div class="alert <?= htmlspecialchars($cls, ENT_QUOTES, 'UTF-8') ?> alert-dismissible fade show" role="alert">
        <i class="bi <?= htmlspecialchars($icon, ENT_QUOTES, 'UTF-8') ?> me-2"></i>
        <?= htmlspecialchars($f['message'], ENT_QUOTES, 'UTF-8') ?>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Chiudi"></button>
    </div>
<?php endforeach; ?>
