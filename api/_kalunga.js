// Consultas ao site da Kalunga usadas pelo Gerador de News (sem dependências).
//  - porSku(sku):  abre a busca, segue o redirecionamento até a página do produto e devolve link + H1
//  - porLink(url): abre uma página do site, confirma que existe e devolve H1 + nome da página

export const BUSCA = (q) => `https://www.kalunga.com.br/busca/1?q=${q}`;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};
const TEMPO_LIMITE = 15000;           // ms por página
const CACHE_MS = 6 * 60 * 60 * 1000;  // 6 horas
const cache = new Map();

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—' };
export function decodifica(txt) {
  return String(txt || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
}
const limpa = (html) => decodifica(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

export function lerPagina(html) {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return { h1: h1 ? limpa(h1[1]) : '', title: title ? limpa(title[1]) : '' };
}
// 'Cestas e Panettones - Kalunga' -> 'Cestas e Panettones'
export const nomeDaPagina = (title) => String(title || '').split(/\s+[-–|]\s+/)[0].trim();

export function linkPermitido(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && /^(www\.)?kalunga\.com\.br$/i.test(u.hostname);
  } catch { return false; }
}

// trocável nos testes
export const rede = {
  async abrir(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TEMPO_LIMITE);
    try {
      const r = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: ctrl.signal });
      if (!r.ok) { const e = new Error('http'); e.status = r.status; throw e; }
      return { final: r.url || url, html: await r.text() };
    } finally { clearTimeout(t); }
  },
};

function doCache(chave) {
  const item = cache.get(chave);
  return item && Date.now() - item.em < CACHE_MS ? item.valor : null;
}
function guarda(chave, valor) { cache.set(chave, { em: Date.now(), valor }); return valor; }
const erro = (e) => (e && e.status ? `o site respondeu ${e.status}` : e && e.name === 'AbortError' ? 'o site demorou demais para responder' : 'não foi possível acessar o site');

export async function porSku(sku) {
  const salvo = doCache('sku:' + sku); if (salvo) return salvo;
  let pagina;
  try { pagina = await rede.abrir(BUSCA(sku)); } catch (e) { return { sku, error: erro(e) }; }
  if (!pagina.final.includes('/prod/')) return { sku, error: 'a busca não levou direto a um produto (pode ter mais de um resultado)' };
  const { h1 } = lerPagina(pagina.html);
  return guarda('sku:' + sku, { sku, url: pagina.final.split('?')[0], title: h1 });
}

export async function porLink(url) {
  if (!linkPermitido(url)) return { error: 'só links do site kalunga.com.br' };
  const salvo = doCache('url:' + url); if (salvo) return salvo;
  let pagina;
  try { pagina = await rede.abrir(url); } catch (e) { return { error: erro(e) }; }
  const { h1, title } = lerPagina(pagina.html);
  // hotsite que não existe abre uma página vazia: sem H1 e com título só "Kalunga"
  if (!h1 && /^(kalunga)?$/i.test(title.trim())) return { error: 'página não encontrada (o endereço abre uma página vazia)' };
  return guarda('url:' + url, { ok: true, url: pagina.final, title: h1, page_title: nomeDaPagina(title) });
}

// Cabeçalhos comuns: CORS (para o HTML aberto direto do computador) e cache na CDN da Vercel.
export function cabecalhos(res, cacheavel) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', cacheavel ? 'public, s-maxage=21600, stale-while-revalidate=86400' : 'no-store');
}
