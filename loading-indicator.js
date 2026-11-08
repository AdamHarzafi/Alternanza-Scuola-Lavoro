(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HarzafiLoading = api;
    if (root.document) {
        const mount = () => api.mount(root.document);
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', mount, { once:true });
        else mount();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const blades = '<span class="spinner-blade"></span>'.repeat(8);
    const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    function markup(inline = false) {
        return '<span class="apple-ios14-spinner' + (inline ? ' apple-spinner--inline' : '') + '" aria-hidden="true">' + blades + '</span>';
    }
    function labelled(status) { return markup(true) + '<span class="apple-loading-sr-only">' + escape(status) + '</span>'; }
    function buttonMarkup(label) { return '<span class="apple-loading-button-content">' + markup(true) + '<span>' + escape(label) + '</span></span>'; }
    function mount(document) {
        document.querySelectorAll('[data-apple-spinner]').forEach(element => {
            if (!element.querySelector('.apple-ios14-spinner')) element.innerHTML = markup(element.dataset.appleSpinner === 'inline');
            element.setAttribute('aria-hidden','true');
        });
    }
    return { markup, labelled, buttonMarkup, mount };
});
