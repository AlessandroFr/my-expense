// ─── rich-editor.js ──────────────────────────────────────────────────────────
// Helper TinyMCE 7 community (license GPL). Inizializza ogni textarea con
// classe `.mx-rich-editor` che non sia ancora gestita; espone API globale
// MxRichEditor per sincronizzare textarea<->editor e (re)installare l'editor.

const SEL  = 'textarea.mx-rich-editor';
const ATTR = 'data-mx-rte';

// Whitelist tag minima: niente <script>, niente attributi inline pericolosi.
const VALID_ELEMENTS = 'p[style|class],br,strong/b,em/i,u,strike,'
    + 'ul,ol,li,blockquote,'
    + 'a[href|title|target=_blank|rel=noopener],code,pre,span[style]';

function isDarkTheme() {
    return document.documentElement.getAttribute('data-bs-theme') === 'dark';
}

function tinyConfigFor(textarea) {
    const dark = isDarkTheme();
    return {
        target: textarea,
        license_key: 'gpl',
        promotion: false,
        branding: false,
        menubar: false,
        statusbar: false,
        height: 200,
        plugins: 'lists link autolink',
        toolbar: 'undo redo | bold italic underline | bullist numlist | link | removeformat',
        valid_elements: VALID_ELEMENTS,
        skin:        dark ? 'oxide-dark' : 'oxide',
        content_css: dark ? 'dark' : 'default',
        body_class: 'mx-rich-body',
    };
}

function initOne(textarea) {
    if (!window.tinymce || textarea.dataset.mxRte === '1') return;
    textarea.dataset.mxRte = '1';
    if (!textarea.id) textarea.id = 'mx-rte-' + Math.random().toString(36).slice(2, 9);
    window.tinymce.init(tinyConfigFor(textarea));
}

function initAll(root = document) {
    if (!window.tinymce) return;
    root.querySelectorAll(SEL + `:not([${ATTR}="1"])`).forEach(initOne);
}

function setContent(idOrEl, html) {
    const id = typeof idOrEl === 'string' ? idOrEl : idOrEl?.id;
    const el = typeof idOrEl === 'string' ? document.getElementById(id) : idOrEl;
    if (!el) return;
    const ed = window.tinymce?.get(id);
    if (ed) ed.setContent(String(html ?? ''));
    else el.value = String(html ?? '');
}

function flush() {
    if (window.tinymce) window.tinymce.triggerSave();
}

window.MxRichEditor = { init: initAll, initOne, setContent, flush };

function bootstrap() { initAll(); }
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
