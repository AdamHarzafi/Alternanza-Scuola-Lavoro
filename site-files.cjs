const path = require('node:path');

const publicPages = new Set([
    'index.html', 'login.html', 'dashboard.html', 'privacy.html',
    'privacy-account.html', 'accessibilita.html', 'supporto.html',
    'termini.html', 'reset-password.html', '404.html', 'impostazioni.html', 'messaggi.html'
]);
const assetDirectories = ['IMMAGINI', 'fonts', 'src'];
const developmentFiles = new Set(['server.js', 'build-site.js']);

function isPublicFile(filename) {
    if (publicPages.has(filename)) return true;
    if (developmentFiles.has(filename) || filename.includes('/') || filename.includes('\\')) return false;
    return ['.css', '.js', '.txt', '.png', '.ico', '.xml', '.webmanifest'].includes(path.extname(filename).toLowerCase());
}

module.exports = { publicPages, assetDirectories, isPublicFile };
