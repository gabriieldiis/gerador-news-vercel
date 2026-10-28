// Testes sem internet: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { porSku, porLink, lerPagina, linkPermitido, nomeDaPagina, rede } from '../api/_kalunga.js';
import pagina from '../api/pagina.js';

const falso = (mapa) => { rede.abrir = async (url) => { const r = mapa(url); if (r instanceof Error) throw r; return r; }; };

test('lê H1 e título com entidades', () => {
  const p = lerPagina('<title>Mochila - Kalunga</title><h1 class="x">  Mochila até 15&quot; em <b>poliéster</b>\n – CX 1 UN</h1><h1>2</h1>');
  assert.equal(p.h1, 'Mochila até 15" em poliéster – CX 1 UN');
  assert.equal(nomeDaPagina(p.title), 'Mochila');
});

test('só aceita links da Kalunga', () => {
  assert.ok(linkPermitido('https://www.kalunga.com.br/hotsite/x'));
  assert.ok(linkPermitido('https://kalunga.com.br/x'));
  assert.ok(!linkPermitido('https://www.kalunga.com.br.evil.com/x'));
  assert.ok(!linkPermitido('http://localhost:5055'));
});

test('SKU segue até a página do produto', async () => {
  falso(() => ({ final: 'https://www.kalunga.com.br/prod/mochila/441188', html: '<h1>Mochila Targus</h1>' }));
  assert.deepEqual(await porSku('441188'), { sku: '441188', url: 'https://www.kalunga.com.br/prod/mochila/441188', title: 'Mochila Targus' });
});

test('SKU com mais de um resultado vira erro', async () => {
  falso(() => ({ final: 'https://www.kalunga.com.br/busca/1?q=999999', html: '<h1>Busca</h1>' }));
  assert.ok((await porSku('999999')).error);
});

test('hotsite usa o nome da página e marca sem H1 funciona', async () => {
  falso((u) => u.includes('panettones')
    ? { final: u, html: '<title>Cestas e Panettones - Kalunga</title><h1>Cestas de Natal e Panettones</h1>' }
    : { final: u, html: '<title>JBL - em Kalunga - Informática</title>' });
  const a = await porLink('https://www.kalunga.com.br/hotsite/cestas-e-panettones');
  assert.equal(a.page_title, 'Cestas e Panettones');
  const b = await porLink('https://www.kalunga.com.br/marca/jbl/88315379/0001');
  assert.equal(b.page_title, 'JBL');
});

test('hotsite inexistente e erro do site', async () => {
  falso(() => ({ final: 'https://www.kalunga.com.br/hotsite/nada', html: '<title>Kalunga</title>' }));
  assert.ok((await porLink('https://www.kalunga.com.br/hotsite/nada')).error);
  falso(() => Object.assign(new Error('http'), { status: 404 }));
  assert.match((await porLink('https://www.kalunga.com.br/depto/x/1/2')).error, /404/);
});

test('função /api/pagina recusa outros sites', async () => {
  let status, corpo; const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; }, status(c) { status = c; return this; }, json(o) { corpo = o; return this; } };
  await pagina({ query: { url: 'https://google.com' } }, res);
  assert.equal(status, 400); assert.ok(corpo.error); assert.equal(headers['Access-Control-Allow-Origin'], '*');
});
