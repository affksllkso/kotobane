import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { handleApi, validCredentials } from './api.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
const root = resolve('dist');
if (!existsSync(resolve(root, 'index.html'))) throw new Error('先に npm run build を実行してください。');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const local = ['127.0.0.1', '::1', 'localhost'].includes(host);
const user = process.env.APP_USERNAME;
const password = process.env.APP_PASSWORD;
if ((user && !password) || (password && !user) || (!local && !password)) {
  throw new Error('外部待受には APP_USERNAME と APP_PASSWORD が必要です。HTTPS リバースプロキシの背後で実行してください。');
}
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
};
const server = createServer(async (req, res) => {
  if (!user && !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/iu.test(req.headers.host ?? '')) {
    res.writeHead(403, { 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (user && !validCredentials(req.headers.authorization, user, password)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Kotobane", charset="UTF-8"', 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (req.url?.startsWith('/api/')) return handleApi(req, res, process.env);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + sep)) { res.writeHead(404); return res.end(); }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
server.listen(port, host, () => console.log('ことばね http://' + (host.includes(':') ? '[' + host + ']' : host) + ':' + port));
