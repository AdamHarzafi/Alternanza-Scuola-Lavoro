const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const distRoot = path.join(projectRoot, 'dist');
const clientRoot = path.join(distRoot, 'client');
const serverRoot = path.join(distRoot, 'server');
const publicExtensions = new Set(['.css', '.html', '.js', '.json', '.txt']);

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(clientRoot, { recursive: true });
fs.mkdirSync(serverRoot, { recursive: true });

for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !publicExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    fs.copyFileSync(path.join(projectRoot, entry.name), path.join(clientRoot, entry.name));
}

for (const directory of ['IMMAGINI', 'src']) {
    const source = path.join(projectRoot, directory);
    if (fs.existsSync(source)) {
        fs.cpSync(source, path.join(clientRoot, directory), { recursive: true });
    }
}

const worker = `export default {
    async fetch(request, env) {
        const response = await env.ASSETS.fetch(request);
        if (response.status !== 404) return response;

        const url = new URL(request.url);
        if (!url.pathname.endsWith('/') && !url.pathname.split('/').pop().includes('.')) {
            url.pathname += '.html';
            const htmlResponse = await env.ASSETS.fetch(new Request(url, request));
            if (htmlResponse.status !== 404) return htmlResponse;
        }

        url.pathname = '/404.html';
        return env.ASSETS.fetch(new Request(url, request));
    }
};
`;

fs.writeFileSync(path.join(serverRoot, 'index.js'), worker);
console.log('Static Sites build complete.');
