import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleSubscribe } from '../lib/subscribe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const releases = path.resolve(root, '../../../Apps/DayColorShared/release');
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.json')));
const allowed = new Set(Object.values(config.downloads).map(item => item.filename));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.zip': 'application/zip' };
const port = Number(process.env.PORT || 4173);
http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/api/subscribe') {
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 8192) { response.writeHead(413); response.end('Request too large'); return; } chunks.push(chunk); }
    const payload = Buffer.concat(chunks);
    const result = await handleSubscribe(new Request(url, { method: request.method, headers: request.headers, ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body: payload } : {}) }), {});
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text()); return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let file;
  if (url.pathname.startsWith('/downloads/')) {
    const name = url.pathname.slice('/downloads/'.length);
    if (!allowed.has(name)) { response.writeHead(404); response.end(); return; }
    file = path.join(releases, name);
  } else {
    let name;
    try { name = decodeURIComponent(url.pathname); } catch { response.writeHead(400); response.end(); return; }
    file = path.resolve(root, `.${name}`);
    if (!file.startsWith(root + path.sep) && file !== root) { response.writeHead(403); response.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end('Not found'); return; }
  const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': fs.statSync(file).size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
  if (url.pathname.startsWith('/downloads/')) headers['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
  response.writeHead(200, headers); if (request.method === 'HEAD') response.end(); else fs.createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => { console.log(`미슴도치 로컬 미리보기: http://127.0.0.1:${port} (이메일 수집·발송 비활성화)`); });
