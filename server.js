// Servidor local (só Node.js, sem instalar pacotes): node server.js
// Entrega o gerador e as mesmas funções /api que rodam na Vercel.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import ping from './api/ping.js';
import sku from './api/sku/[sku].js';
import pagina from './api/pagina.js';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORT || 5055);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// imita o req/res das funções da Vercel
function adapta(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); return res; };
  return res;
}

const servidor = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  req.query = Object.fromEntries(u.searchParams);
  adapta(res);
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Private-Network', 'true'); return res.status(204).end(); }
  try {
    if (u.pathname === '/api/ping') return ping(req, res);
    const m = /^\/api\/sku\/([^/]+)$/.exec(u.pathname);
    if (m) { req.query.sku = m[1]; const r = await sku(req, res); console.log('SKU', m[1]); return r; }
    if (u.pathname === '/api/pagina') { console.log('LINK', req.query.url); return await pagina(req, res); }
    const arquivo = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const caminho = normalize(join(RAIZ, arquivo));
    if (!caminho.startsWith(RAIZ) || /(^|[\\/])(api|tests|node_modules)([\\/]|$)|^\./.test(arquivo)) return res.status(404).end('não encontrado');
    const corpo = await readFile(caminho);
    res.setHeader('Content-Type', TIPOS[extname(caminho)] || 'application/octet-stream');
    res.end(corpo);
  } catch (e) {
    if (!res.headersSent) res.status(404).end('não encontrado');
  }
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.log(`A porta ${PORTA} já está em uso: o gerador provavelmente já está aberto em http://localhost:${PORTA}`);
  else console.error(e);
  process.exit(1);
});
servidor.listen(PORTA, '127.0.0.1', () => {
  const endereco = `http://localhost:${PORTA}`;
  console.log(`Gerador de News Kalunga ligado em ${endereco}`);
  console.log('Deixe esta janela aberta enquanto usa o gerador. Feche para desligar.\n');
  if (!process.env.SEM_NAVEGADOR) exec(process.platform === 'win32' ? `start "" "${endereco}"` : process.platform === 'darwin' ? `open ${endereco}` : `xdg-open ${endereco}`);
});
