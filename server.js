const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { isPublicFile, assetDirectories } = require('./site-files.cjs');

const mimeTypes = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
    '.mp4': 'video/mp4', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json'
};

function createServer(root = __dirname) {
    return http.createServer(async (request, response) => {
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(405, { Allow: 'GET, HEAD' }).end();
            return;
        }
        try {
            let relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
            if (!relative) relative = 'index.html';
            if (!path.extname(relative)) relative += '.html';
            const filename = path.resolve(root, relative);
            const withinRoot = filename.startsWith(path.resolve(root) + path.sep);
            const normalized = path.relative(root, filename).split(path.sep).join('/');
            const allowed = withinRoot && (isPublicFile(normalized) || assetDirectories.some(directory => normalized.startsWith(directory + '/')));
            let bytes;
            let status = 200;
            try {
                if (!allowed) throw new Error('not-public');
                bytes = await fs.readFile(filename);
            } catch {
                status = 404;
                relative = '404.html';
                bytes = await fs.readFile(path.join(root, relative));
            }
            response.writeHead(status, {
                'Content-Type': mimeTypes[path.extname(relative).toLowerCase()] || 'application/octet-stream',
                'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
            });
            response.end(request.method === 'HEAD' ? undefined : bytes);
        } catch {
            response.writeHead(400).end('Richiesta non valida.');
        }
    });
}

if (require.main === module) {
    const requestedPort = Number(process.env.PORT || 3000);
    const port = Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535 ? requestedPort : 3000;
    const server = createServer();
    server.listen(port, process.env.HOST || '127.0.0.1', () => {
        console.log(`Local: http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`);
    });
}

module.exports = { createServer };
