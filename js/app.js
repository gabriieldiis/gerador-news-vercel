const SAMPLE = `213119
478167
Marca Texto com até 9% OFF - https://www.kalunga.com.br/depto/escrita-corretivos/marca-texto/11/415
Mochila Targus com até  35% OFF - https://www.kalunga.com.br/marca/targus/54005160/0001
Pen Drive com até 22% OFF - https://www.kalunga.com.br/depto/midias-drives/pen-drive-usb-2-0/23/614
https://www.kalunga.com.br/hotsite/cestas-e-panettones
981497
Cabos para Iphone com até 39% off - https://www.kalunga.com.br/depto/smartphones-telefonia/cabo-usb-c-para-iphone-certif-/8/2031
785027
Fitas Adesivas Hot Melt com até 9% OFF - https://www.kalunga.com.br/depto/embalagens/fitas-adesivas-hot-melt/4/2198
JBL
https://www.kalunga.com.br/marca/jbl/88315379/0001`;

const MESES_ARQ = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MESES_TXT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const HOST_TERMS = {'kalungacopyprint.com.br':'COPY-E-PRINT','xsports.com.br':'XSPORTS','apps.apple.com':'APPSTORE','play.google.com':'GOOGLEPLAYSTORE'};
const MAX_COLS = 4;

const $ = s => document.querySelector(s);
const store = {
  get(k, d){ try{ const v = localStorage.getItem('newsgen.'+k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('newsgen.'+k, JSON.stringify(v)); }catch(e){} }
};
function todayISO(){ const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

const cfg = Object.assign({date: todayISO(), ext:'png', seg:'seg_abriram_e_novos_cadastros_90d', camp:'', imgprefix:'', imgbase:'https://img.kalunga.com.br/news/images/', desc:'https://img.kalunga.com.br/news/images/novos-news2/test-news-v9/images/descricao_10.jpg'}, store.get('cfg', {}));
cfg.date = cfg.date || todayISO();
let manual = store.get('manual', {});          // edições por banner
let layout = store.get('layout', null);        // [{cap, keys:[]}]
let briefOrder = store.get('briefOrder', []);
let removed = store.get('removed', []);       // banners excluídos da montagem
let undoSnap = null;
let skuCache = store.get('skus', {});
let pageCache = store.get('pages', {});
let layoutTouched = store.get('layoutTouched', false);          // link -> {final, title, status, error}           // sku -> {url, title, status, error}                            // {layout, removed, msg}  // ordem das chaves na última leitura
let items = {};                                 // chave -> banner lido do briefing
let selected = null;
let rowSeq = 0;

/* ---------- regras ---------- */
function parts(){ const [y,m,d] = cfg.date.split('-').map(Number); return {y, m, d}; }
function campaign(){
  if (cfg.camp.trim()) return cfg.camp.trim();
  const {y,m,d} = parts();
  return `${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}_${cfg.seg.trim()}_${y}`;
}
function imgPrefix(){
  if (cfg.imgprefix.trim()) return cfg.imgprefix.trim();
  const {y,m,d} = parts();
  return `mkt_${y}${MESES_ARQ[m-1]}${String(d).padStart(2,'0')}_`;
}
function imgBase(){ let b = cfg.imgbase.trim(); return b && !b.endsWith('/') ? b + '/' : b; }
function validade(){ const {y,m,d} = parts(); return `${d} de ${MESES_TXT[m-1]} de ${y}`; }

function slug(s){
  return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/&/g,' e ')
    .toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function cleanTitle(t){
  return (t||'')
    .replace(/\s+(com\s+)?(at[eé]\s+)?\d+([.,]\d+)?\s*%\s*(de\s+)?(OFF|desconto).*$/i,'')
    .replace(/\s+em\s+at[eé]\s+\d+\s*x.*$/i,'')
    .replace(/\s+(por|a partir de|de)\s+R\$.*$/i,'')
    .replace(/\s+com\s+frete.*$/i,'')
    .trim();
}
function deriveTerm(url, title){
  const t = slug(cleanTitle(title));
  let U; try{ U = new URL(url); }catch(e){ return t; }
  const host = U.hostname.replace(/^www\./,'');
  if (!/(^|\.)kalunga\.com\.br$/.test(host)) return HOST_TERMS[host] || t || slug(host.split('.')[0]);
  const path = U.pathname;
  let m = path.match(/\/prod\/[^/]+\/(\d+)/); if (m) return m[1];
  if (/^\/busca\//.test(path)){
    const q = (U.searchParams.get('q')||'').trim();
    if (/^\d+$/.test(q)) return q;
    if (/^[\d\s,-]+$/.test(q)) return t || 'BUSCA';
    return t || slug(q);
  }
  m = path.match(/\/hotsite\/([^/]+)/); if (m) return slug(m[1]).replace(/-(19|20)\d\d$/,'');
  const segs = path.split('/').filter(Boolean).filter(s => !/^\d+$/.test(s));
  return t || (segs.length ? slug(segs[segs.length-1]) : 'KALUNGA');
}
function trackUrl(url, term){
  let [base, hash] = url.split('#');
  const qi = base.indexOf('?');
  if (qi >= 0){
    const path = base.slice(0, qi);
    const params = base.slice(qi+1).split(/[&?]/).filter(p => p && !/^(pcID|menuID|tipo|utm_[a-z]+)=/i.test(p));
    base = params.length ? path + '?' + params.join('&') : path;
  }
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}pcID=106&utm_source=News&utm_medium=E-mail&utm_campaign=${campaign()}&utm_term=${term}` + (hash ? '#'+hash : '');
}
const esc = s => String(s ?? '').replace(/&(?!amp;|#\d+;|[a-z]+;)/gi,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ---------- leitura do briefing (linha por linha) ---------- */
const CODE_LINE = /^(?:(.*?)\s*[-–—:|]\s*)?(\d{4,8})(\s*\(([^)]*)\))?$/;
const CODES_TAIL = /^(.*?)\s*[-–—:|]\s*(\d{4,8}(?:\s*[-,;\s]\s*\d{4,8})+)\s*(?:\(([^)]*)\))?$/;
const SLUG_TAIL = /^(.*\S)\s+[-–—:|]\s+([a-z0-9][a-z0-9_-]*)\s*(?:\(([^)]*)\))?$/i;
const SKU_LIST = /^\d{6}(?:[\s,;]+\d{6})*$/;
// só códigos, ligados por traço (ex.: 798586-798584): lista de produtos numa busca
const CODES_ONLY = /^(\d{4,8}(?:\s*[-–,;]\s*\d{4,8})+)\s*(?:\(([^)]*)\))?$/;
const isCodesOnly = t => !!t && CODES_ONLY.test(t) && /\d\s*[-–]\s*\d/.test(t);
const codesOf = t => t.replace(/\([^)]*\)/g, '').split(/[^\d]+/).filter(Boolean);
const URL_RE = /https?:\/\/[^\s)<>"]+/;
const SEP_LINE = /^(?:[-–—_*=~•·]\s*){3,}$/;
const KSITE = 'https://www.kalunga.com.br';
const buscaUrl = q => KSITE + '/busca/1?q=' + q;
const PROD_IMG = s => `https://img.kalunga.com.br/fotosdeprodutos/${s}d.jpg`;
const slugLower = t => slug(t).toLowerCase();
const KIND_LABEL = {sku:'Produto · SKU', produto:'Página de produto', lista:'Lista de produtos', busca:'Busca', hotsite:'Hotsite', categoria:'Categoria', marca:'Marca', pagina:'Página do site', externo:'Outro site', nota:'Anotação', pergunta:'Dúvida', junta:'Somado à lista'};
let answers = store.get('answers', {});
let entries = [], briefLines = [];

function normLine(raw){
  let t = raw.replace(/[   ]/g,' ').replace(/[​﻿]/g,'').trim();
  return t.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (m, txt, u) => (txt.trim() && !/^https?:/.test(txt.trim()) ? txt + ' - ' : '') + u)
          .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
          .replace(/^[-*•·]\s+(?=\S)/, '');
}
function linkKind(url){
  let U; try{ U = new URL(url); }catch(e){ return 'externo'; }
  if (!/(^|\.)kalunga\.com\.br$/i.test(U.hostname)) return 'externo';
  const p = U.pathname;
  if (/^\/prod\//.test(p)) return 'produto';
  if (/^\/busca\//.test(p)) return /^[\d\s,-]+$/.test(U.searchParams.get('q') || '') && /[-,\s]/.test(U.searchParams.get('q') || '') ? 'lista' : 'busca';
  if (/^\/hotsite\//.test(p)) return 'hotsite';
  if (/^\/depto\//.test(p)) return 'categoria';
  if (/^\/marca\//.test(p)) return 'marca';
  return 'pagina';
}
function takeNotes(text){
  const notes = [];
  const clean = (text || '').replace(/\(([^)]*)\)/g, (_, n) => { if (n.trim()) notes.push(n.trim()); return ' '; }).replace(/\s{2,}/g,' ').trim();
  return {clean, notes};
}
const stripSep = t => (t || '').replace(/[\s<]*[-–—:|]+[\s<]*$/,'').trim();
function stripPack(t){ return (t || '').replace(/\s*[-–—]\s*(?:[A-Z]{1,4}\s+)?\d+[\d.,]*\s*[A-Z]{1,4}\.?$/,'').trim(); }
function mkSku(s, title){ return {sku: s, kind:'sku', title: title || '', givenTitle: !!title, url:'', notes:[], warn:''}; }
function mkLink(title, url, notes){
  const kind = linkKind(url), it = {kind, title, url, notes: notes || [], warn:'', needsTitle: !title};
  if (kind === 'lista'){ try{ it.codes = new URL(url).searchParams.get('q').split(/[^\d]+/).filter(Boolean); }catch(e){ it.codes = []; } }
  return it;
}

function parseBrief(txt){
  const L = txt.replace(/\r/g,'').split('\n');
  briefLines = L;
  const N = L.map(normLine);
  const groups = []; let group = []; const occ = {}; entries = [];
  const qid = (type, t) => { const b = type + ':' + t.toLowerCase(); occ[b] = (occ[b] || 0) + 1; return b + '#' + occ[b]; };
  const flush = () => { if (group.length){ groups.push(group); group = []; } };
  const lastItem = () => group[group.length-1] || null;
  const push = (it, e) => { group.push(it); e.item = it; entries.push(e); };
  const asNote = (text, e) => { const it = lastItem(); if (it) it.notes.push(text); e.kind = 'nota'; e.target = it; entries.push(e); };
  const isUrlOnly = t => !!t && URL_RE.test(t) && !t.replace(URL_RE,'').replace(/[-–—:|<>\s()]/g,'');

  for (let i = 0; i < N.length; i++){
    const t = N[i];
    if (!t || SEP_LINE.test(t)){ flush(); if (t) entries.push({kind:'sep', lines:[i]}); continue; }

    // SKU(s) sozinho(s)
    if (SKU_LIST.test(t)){
      const skus = t.split(/[\s,;]+/), prev = lastItem();
      if (skus.length === 1 && prev && prev.kind === 'lista'){
        const id = qid('junta', t), ans = answers[id];
        const e = {kind:'sku', lines:[i], q:{id, ask:`${t} veio logo depois da lista “${cleanTitle(prev.title) || 'de produtos'}”. É um banner próprio ou faz parte da lista?`, options:[['own','Banner próprio'],['join','Somar à lista de cima']], def:'own'}};
        if (ans === 'join'){ prev.codes.push(t); prev.url = buscaUrl(prev.codes.join('-')); e.kind = 'junta'; e.target = prev; entries.push(e); continue; }
        push(mkSku(t), e); continue;
      }
      skus.forEach((s, k) => push(mkSku(s), {kind:'sku', lines:[i], part:k, of: skus.length}));
      continue;
    }

    // linha com link
    const um = t.match(URL_RE);
    if (um){
      const url = um[0].replace(/[.,;>]+$/,'');
      const a = takeNotes(stripSep(t.slice(0, um.index))), b = takeNotes(t.slice(um.index + um[0].length));
      const notes = a.notes.concat(b.notes); if (b.clean.replace(/[-–—:|\s]/g,'')) notes.push(b.clean);
      push(mkLink(a.clean, url, notes), {kind: linkKind(url), lines:[i]});
      continue;
    }

    // Só códigos ligados por traço: lista sem título
    if (isCodesOnly(t)){
      const nm = t.match(CODES_ONLY), codes = codesOf(nm[1]);
      const it = {kind:'lista', title:'', codes, url: buscaUrl(codes.join('-')), notes: nm[2] ? [nm[2].trim()] : [], warn:''};
      push(it, {kind:'lista', lines:[i]});
      continue;
    }

    // Título - lista de códigos
    let m = t.match(CODES_TAIL);
    if (m){
      const codes = m[2].split(/[^\d]+/).filter(Boolean);
      const a = takeNotes(m[1]); if (m[3]) a.notes.push(m[3].trim());
      const it = {kind:'lista', title: a.clean, codes, url: buscaUrl(codes.join('-')), notes: a.notes, warn:''};
      push(it, {kind:'lista', lines:[i]});
      continue;
    }

    // Título - código único (ou código sozinho que não tem 6 dígitos)
    m = t.match(CODE_LINE);
    if (m){
      const a = takeNotes(m[1] || ''); if (m[4]) a.notes.push(m[4].trim());
      if (m[2].length === 6){ const it = mkSku(m[2], a.clean); it.notes = a.notes; push(it, {kind:'sku', lines:[i]}); continue; }
      const id = qid('codigo', t), ans = answers[id] ?? 'busca';
      const e = {kind:'busca', lines:[i], q:{id, ask:`“${m[2]}” tem ${m[2].length} dígitos, e SKU tem 6. O que fazer?`, options:[['busca','Buscar pelo código'],['nota','É só anotação']], def:'busca'}};
      if (ans === 'nota'){ asNote(t, e); continue; }
      push(mkLink(a.clean || 'Produto ' + m[2], buscaUrl(m[2]), a.notes), e); continue;
    }

    // Título - palavra (ex.: "Pen Drive - pen-drive"): busca ou hotsite?
    m = t.match(SLUG_TAIL);
    if (m && /[-_]/.test(m[2]) || (m && m[2] === m[2].toLowerCase() && !/\s/.test(m[2]) && m[2].length > 2 && !/^(e|de|da|do|com|para)$/i.test(m[2]))){
      const a = takeNotes(m[1]); if (m[3]) a.notes.push(m[3].trim());
      const word = m[2].toLowerCase();
      const id = qid('termo', t), ans = answers[id] ?? 'busca';
      const e = {kind:'busca', lines:[i], q:{id, ask:`“${m[2]}” não é um link completo. É uma busca no site ou um hotsite?`, options:[['busca','Busca no site'],['hotsite','Hotsite'],['link','Categoria ou marca (colar link)']], def:'busca'}};
      const url = ans.startsWith('link:') ? ans.slice(5) : ans === 'hotsite' ? KSITE + '/hotsite/' + word : buscaUrl(word);
      e.kind = linkKind(url);
      push(mkLink(a.clean, url, a.notes), e); continue;
    }

    // Texto sem link
    const next = N[i+1];
    if (isCodesOnly(next)){
      const id = qid('par', t);
      if (answers[id] !== 'split'){
        const a = takeNotes(stripSep(t)), nm = next.match(CODES_ONLY), codes = codesOf(nm[1]);
        if (nm[2]) a.notes.push(nm[2].trim());
        push({kind:'lista', title: a.clean, codes, url: buscaUrl(codes.join('-')), notes: a.notes, warn:''}, {kind:'lista', lines:[i, i+1], merged:true, pairId:id});
        i++; continue;
      }
    }
    if (isUrlOnly(next)){
      const id = qid('par', t);
      if (answers[id] !== 'split'){
        const a = takeNotes(stripSep(t));
        const url = next.match(URL_RE)[0].replace(/[.,;>]+$/,'');
        push(mkLink(a.clean, url, a.notes), {kind: linkKind(url), lines:[i, i+1], merged:true, pairId:id});
        i++; continue;
      }
    }
    const a = takeNotes(stripSep(t));
    const id = qid('texto', t), ans = answers[id] ?? 'busca';
    const e = {kind:'pergunta', lines:[i], q:{id, ask:`“${a.clean}” não tem link. O que é?`, options:[['busca','Busca no site'],['hotsite','Hotsite'],['link','Categoria ou marca (colar link)'],['nota','Só anotação']], def:'busca'}};
    if (ans === 'nota'){ asNote(t, e); continue; }
    const url = ans.startsWith('link:') ? ans.slice(5) : ans === 'hotsite' ? KSITE + '/hotsite/' + slugLower(a.clean) : buscaUrl(slugLower(a.clean));
    e.kind = linkKind(url);
    push(mkLink(a.clean, url, a.notes), e);
  }
  flush();
  const seen = {};
  groups.forEach(g => g.forEach(it => {
    hydrate(it);
    const k0 = it.sku ? 'sku:' + it.sku : (it.url || it.title);
    seen[k0] = (seen[k0] || 0) + 1;
    it.key = k0 + '#' + seen[k0];
  }));
  return groups;
}
function prettyFromUrl(u){
  try{
    const U = new URL(u);
    let s = U.searchParams.get('q') || U.pathname.split('/').filter(x => x && !/^\d+$/.test(x)).pop() || U.hostname;
    s = decodeURIComponent(s).replace(/[-_+]+/g,' ').replace(/\s+/g,' ').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }catch(e){ return u; }
}
function hydrate(it){
  if (it.sku) return hydrateSku(it);
  if (it.kind === 'lista' && !it.title){ it.warn = 'Lista sem título: escreva o título do banner (ele vai no alt e no utm_term).'; return it; }
  if (!it.url) return it;
  const c = pageCache[it.url] || {};
  if (it.needsTitle) it.title = (it.kind === 'produto' ? stripPack(c.title || '') : (c.status === 'manual' ? c.title : (c.pageTitle || c.title))) || prettyFromUrl(it.url);
  if (c.status === 'erro') it.warn = `Link com problema: ${c.error}. Confira o endereço.`;
  else if (it.needsTitle && !c.title) it.warn = 'Sem título no briefing: usei o nome do link até o buscador trazer o título da página.';
  return it;
}
function hydrateSku(it){
  const c = skuCache[it.sku] || {};
  it.url = c.url || buscaUrl(it.sku);
  if (!it.givenTitle) it.title = c.title ? (c.status === 'manual' ? c.title : stripPack(c.title)) : 'Produto ' + it.sku;
  it.warn = c.url ? '' : (c.status === 'erro' ? `SKU ${it.sku}: ${c.error || 'não encontrado'}. Preencha à mão na etapa Briefing.` : `SKU ${it.sku}: produto ainda não buscado. Por enquanto o link vai para a busca.`);
  return it;
}
function unanswered(){ return entries.filter(e => e.q && answers[e.q.id] === undefined); }

/* montagem padrão das news: 1 · 2 · 2 · 1 · 2 · 2 · 1 … */
function patternRows(keys){
  const rows = []; let i = 0, n = 0;
  const P = [1, 2, 2];
  while (i < keys.length){
    let size = P[n % 3];
    if (size === 2 && keys.length - i === 1) size = 1;
    rows.push({cap: size, keys: keys.slice(i, i + size)});
    i += size; n++;
  }
  return rows;
}
function freshLayout(groups){
  const live = groups.map(g => g.filter(it => !removed.includes(it.key))).filter(g => g.length);
  return live.length <= 1 ? patternRows((live[0] || []).map(it => it.key)) : live.flatMap(defaultRows);
}

function defaultRows(group){
  const keys = group.map(it => it.key), rows = [];
  if (keys.length === 1) return [{cap:1, keys}];
  for (let i = 0; i < keys.length; i += 2){
    const chunk = keys.slice(i, i+2);
    rows.push({cap: chunk.length, keys: chunk});
  }
  return rows;
}

function reconcile(groups, force){
  const flat = groups.flat();
  const newKeys = flat.map(it => it.key);
  const newSet = new Set(newKeys), oldSet = new Set(briefOrder);
  // link corrigido no briefing: mesma posição, chave nova -> mantém o lugar e as edições
  const rename = {};
  newKeys.forEach((k, i) => {
    const old = briefOrder[i];
    if (!oldSet.has(k) && old && !newSet.has(old)) rename[old] = k;
  });
  Object.entries(rename).forEach(([o, n]) => { if (manual[o]){ manual[n] = manual[o]; delete manual[o]; } if (selected === o) selected = n; });
  removed = removed.map(k => rename[k] || k);
  if (force){ removed = []; undoSnap = null; }
  const isOut = k => removed.includes(k);

  if (force || !layoutTouched || !Array.isArray(layout) || !layout.length){
    if (force) layoutTouched = false;
    layout = freshLayout(groups);
  } else {
    layout = layout.map(r => ({cap: r.cap, keepEmpty: r.keepEmpty, keys: r.keys.map(k => rename[k] || k).filter(k => newSet.has(k) && !isOut(k))}))
                   .filter(r => r.keys.length || r.keepEmpty);
    const placed = new Set(layout.flatMap(r => r.keys));
    groups.forEach(g => {
      const missing = g.filter(it => !placed.has(it.key) && !isOut(it.key));
      if (missing.length) layout.push(...defaultRows(missing));
    });
  }
  items = {}; flat.forEach(it => items[it.key] = it);
  briefOrder = newKeys;
  removed = removed.filter(k => newSet.has(k));
  if (selected && !items[selected]) selected = null;
  saveLayout();
}
function saveLayout(){ store.set('layoutTouched', layoutTouched); store.set('answers', answers); store.set('removed', removed); store.set('layout', layout); store.set('briefOrder', briefOrder); store.set('manual', manual); }

/* ---------- valores efetivos ---------- */
function urlOf(key){ const m = manual[key] || {}; return (m.url && m.url.trim()) || items[key].url; }
function eff(key){
  const it = items[key], m = manual[key] || {};
  const termAuto = deriveTerm(urlOf(key), (m.title != null && m.title.trim()) ? m.title : it.title);
  const termEdited = m.term != null && m.term !== '';
  const baseTitle = it.sku || it.kind === 'produto' ? it.title : (cleanTitle(it.title) || it.title);
  return { title: m.title != null ? m.title : baseTitle, term: termEdited ? m.term : termAuto, termAuto, termEdited, img: m.img || '' };
}
function order(){ return layout.flatMap(r => r.keys); }
function imgFor(key){
  const e = eff(key); if (e.img) return e.img;
  const n = order().indexOf(key) + 1;
  return `${imgBase()}${imgPrefix()}${String(n).padStart(2,'0')}.${cfg.ext}`;
}
function issues(key){
  const it = items[key], e = eff(key), list = [];
  if (!urlOf(key)) list.push(['bad','Sem link.']);
  if (it.sku && (manual[key]||{}).url) return list.concat(eff(key).title.trim() ? [] : [['bad','Sem título/alt.']]);
  if (it.kind === 'lista' && !e.title.trim()){ list.push(['bad','Lista sem título. Clique no banner na prévia e escreva o título (vai no alt e no utm_term).']); return list; }
  if (!e.term) list.push(['bad','Sem utm_term.']);
  if (!e.title.trim()) list.push(['bad','Sem título/alt.']);
  if (it.warn && !(it.kind === 'lista' && e.title.trim())) list.push(['warn', it.warn]);
  return list;
}

/* ---------- código ---------- */
function cell(key){
  const it = items[key], e = eff(key), alt = esc(e.title);
  return `\t\t\t<td align="center">
\t\t\t\t<a href="${trackUrl(urlOf(key), e.term)}"
\t\t\t\ttitle="${alt}" target="_blank"><img
\t\t\t\tsrc="${imgFor(key)}"
\t\t\t\talt="${alt}" width="100%"
\t\t\t\tstyle="display:block; border:none; outline:none; text-decoration:none;"
\t\t\t\tclass="bigimage" /></a>
\t\t\t</td>`;
}
function bodyCode(){
  return layout.filter(r => r.keys.length).map(r => `<table width="607" align="center" cellspacing="0" cellpadding="0" border="0" class="devicewidthinner">
\t<tbody>
\t\t<tr>
${r.keys.map(cell).join('\n\n')}
\t\t</tr>
\t</tbody>
</table>`).join('\n');
}
function fullCode(){
  const camp = campaign();
  return TPL_HEAD.split('{{CAMP}}').join(camp).split('{{DESC}}').join(cfg.desc.trim()) + '\n\n' + bodyCode() + '\n\n' + TPL_FOOT.split('{{CAMP}}').join(camp).split('{{VALIDADE}}').join(validade());
}

/* ---------- montagem visual ---------- */
let sortables = [];
function renderRows(){
  sortables.forEach(s => s.destroy()); sortables = [];
  const el = $('#rows');
  const nItems = order().length;
  if (!layout.length){ el.innerHTML = '<div class="empty">Cole o briefing ao lado para montar a news.</div>'; $('#stats').textContent = ''; return; }
  el.innerHTML = layout.map((r, ri) => {
    const filled = r.keys.length, incomplete = filled > 0 && filled < r.cap;
    const segBtns = Array.from({length: MAX_COLS}, (_, i) => `<button type="button" data-cap="${i+1}" aria-pressed="${r.cap === i+1}" aria-label="${i+1} por linha">${i+1}</button>`).join('');
    const cards = r.keys.map(k => {
      const e = eff(k), iss = issues(k), n = order().indexOf(k) + 1, it = items[k];
      const flags = (iss.length ? `<span class="dot${iss.some(i => i[0]==='bad') ? ' bad' : ''}" title="${esc(iss.map(i=>i[1]).join(' '))}"></span>` : '') +
                    (it.notes.length ? `<span class="dot" style="background:var(--accent)" title="Nota para o designer"></span>` : '');
      return `<div class="card${selected === k ? ' sel' : ''}" data-k="${esc(k)}" tabindex="0" role="button" aria-label="Banner ${n}: ${esc(e.title)}">
        <span class="flags">${flags}</span>
        <button type="button" class="card-del" data-rm="${esc(k)}" title="Remover banner" aria-label="Remover banner ${n}">×</button>
        ${upOf(k) ? `<img class="thumb" src="${upOf(k).url}" alt="">` : (thumbCodes(items[k])[0] ? `<img class="thumb ref" src="${PROD_IMG(thumbCodes(items[k])[0])}" alt="" loading="lazy">` : '')}
        <span class="n">${String(n).padStart(2,'0')}</span>
        <span class="t">${esc(e.title) || '<i>sem título</i>'}</span>
        <span class="term">${esc(e.term)}</span>
      </div>`;
    }).join('');
    const phs = Array.from({length: Math.max(0, r.cap - filled)}, () => `<div class="ph">${filled ? 'Espaço livre' : 'Arraste um banner aqui'}</div>`).join('');
    return `<div class="lrow${incomplete ? ' incomplete' : ''}" data-r="${ri}" style="--i:${ri}">
      <div class="lrow-bar">
        <span class="handle" title="Arraste para mover a linha"><span class="grip">⋮⋮</span>Linha ${ri+1}</span>
        <span class="seg" role="group" aria-label="Banners nesta linha">${segBtns}</span>
        <span class="cap${incomplete ? ' warn' : ''}">${filled} de ${r.cap}</span>
        <button type="button" class="ghost row-del" data-del="${ri}" title="${filled ? 'Excluir a linha e os banners dela' : 'Excluir linha vazia'}">Excluir linha</button>
      </div>
      <div class="slots c${r.cap}" data-r="${ri}" data-cap="${r.cap}">${cards}${phs}</div>
    </div>`;
  }).join('');
  $('#stats').textContent = `${nItems} banners · ${layout.filter(r => r.keys.length).length} linhas`;

  el.querySelectorAll('.slots').forEach(list => {
    sortables.push(Sortable.create(list, {
      group: { name: 'banners', put: to => to.el.querySelectorAll('.card').length < +to.el.dataset.cap },
      draggable: '.card', filter: '.card-del', preventOnFilter: false, animation: 150, delay: 120, delayOnTouchOnly: true,
      ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen', dragClass: 'sortable-drag',
      emptyInsertThreshold: 20,
      onEnd: () => setTimeout(syncFromDOM, 0)
    }));
  });
  sortables.push(Sortable.create(el, {
    handle: '.handle', draggable: '.lrow', animation: 150,
    onEnd: () => setTimeout(syncFromDOM, 0)
  }));
}
function syncFromDOM(){
  layoutTouched = true;
  layout = [...document.querySelectorAll('#rows .lrow')].map(r => {
    const list = r.querySelector('.slots');
    return { cap: +list.dataset.cap, keys: [...list.querySelectorAll('.card')].map(c => c.dataset.k), keepEmpty: true };
  });
  saveLayout(); renderAll();
}

function renderEditor(){
  const el = $('#editor');
  if (!selected || !items[selected]){ el.innerHTML = '<p class="hint" style="margin:0">Clique em um banner para editar título, utm_term ou imagem.</p>'; return; }
  const k = selected, it = items[k], e = eff(k), flat = order(), pos = flat.indexOf(k);
  el.innerHTML = `<div class="editor-head">
      <span class="n">${String(pos+1).padStart(2,'0')}</span>
      <span class="file" id="ed-file">${esc(imgFor(k))}</span>
      <button type="button" data-move="-1" ${pos === 0 ? 'disabled' : ''} title="Trocar com o anterior">← Antes</button>
      <button type="button" data-move="1" ${pos === flat.length-1 ? 'disabled' : ''} title="Trocar com o próximo">Depois →</button>
      <button type="button" class="danger" data-remove>Remover banner</button>
      <button type="button" class="ghost" data-close>Fechar</button>
    </div>
    <div class="fields">
      <label class="full">Título / alt<input id="ed-title" value="${esc(e.title)}"></label>
      <label>utm_term<span class="term-line"><input id="ed-term" class="mono" value="${esc(e.term)}" placeholder="${esc(e.termAuto)}">
        <span class="pill ${e.termEdited ? 'edit' : 'auto'}" id="ed-pill">${e.termEdited ? 'editado' : 'auto'}</span>
        <button type="button" class="ghost" id="ed-reset" title="Voltar ao automático" ${e.termEdited ? '' : 'hidden'}>↺</button></span></label>
      <label><span class="lbl">Outra imagem <span class="opt">opcional</span></span><input id="ed-img" class="mono" value="${esc(e.img)}" placeholder="URL completa da imagem"></label>
      <label class="full"><span class="lbl">Link de destino <span class="opt">opcional</span></span><input id="ed-url" class="mono" value="${esc((manual[k]||{}).url || '')}" placeholder="${esc(it.url)}"></label>
      <div class="full url">${it.sku ? `SKU <b>${esc(it.sku)}</b> · ` : ''}Abrir: <a href="${esc(urlOf(k))}" target="_blank" rel="noopener">${esc(urlOf(k))}</a></div>
      ${it.notes.map(n => `<div class="full note">Nota para o designer: ${esc(n)}</div>`).join('')}
      ${it.warn ? `<div class="full note">${esc(it.warn)}</div>` : ''}
    </div>`;
}

function renderChecks(){
  const list = [], flat = order();
  if (!flat.length){ $('#checks').innerHTML = '<li class="warn">Nenhum banner lido do briefing ainda.</li>'; return; }
  layout.forEach((r, i) => {
    if (!r.keys.length) list.push(['warn', `Linha ${i+1} está vazia. Ela não entra no código.`]);
    else if (r.keys.length < r.cap) list.push(['warn', `Linha ${i+1} tem ${r.keys.length} de ${r.cap} banners. No código, ${r.keys.length === 1 ? 'o banner ocupa a linha toda' : 'os banners dividem a linha'}.`]);
  });
  flat.forEach((k, i) => issues(k).forEach(([c, t]) => list.push([c, `Banner ${i+1}: ${t}`])));
  const terms = {};
  flat.forEach((k, i) => { const t = eff(k).term; (terms[t] = terms[t] || []).push(i+1); });
  Object.entries(terms).forEach(([t, ids]) => { if (t && t !== 'BUSCA' && ids.length > 1) list.push(['warn', `utm_term ${t} repetido nos banners ${ids.join(', ')}.`]); });
  flat.forEach((k, i) => { const u = urlOf(k); if (!u) return; try{ const h = new URL(u).hostname; if (!/kalunga\.com\.br$/.test(h)) list.push(['warn', `Banner ${i+1} leva para fora do site (${h}).`]); }catch(e){ list.push(['bad', `Banner ${i+1}: link inválido.`]); } });
  flat.forEach((k, i) => { if (/\?[^#]*\?/.test(urlOf(k))) list.push(['warn', `Banner ${i+1}: o link tinha dois "?". Corrigi no código gerado.`]); });
  const up = Object.keys(uploads).filter(n => +n <= flat.length);
  if (up.length){
    flat.forEach((k, i) => {
      const u = upOf(k); if (!u) return;
      const expected = imgFor(k).split('/').pop();
      if (u.name !== expected) list.push(['warn', `Banner ${i+1}: a imagem enviada é ${u.name}, mas o código usa ${expected}. Renomeie o arquivo antes de subir.`]);
    });
    const missing = flat.map((k, i) => upOf(k) ? null : i+1).filter(Boolean);
    if (missing.length) list.push(['warn', `Sem imagem na prévia: banner${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`]);
  }
  const ss = serverStats();
  if (ss.ok && ss.fail.length) list.push(['warn', `Imagem não encontrada no servidor: banner${ss.fail.length > 1 ? 's' : ''} ${ss.fail.join(', ')}. Confira se já subiu e se o nome está certo.`]);
  if (orphanFiles.length) list.push(['warn', `Não encontrei banner para: ${orphanFiles.join(', ')}.`]);
  const notes = flat.reduce((n, k) => n + items[k].notes.length, 0);
  if (notes) list.push(['warn', `${notes} nota(s) para o designer. Elas não entram no código.`]);
  if (!cfg.seg.trim() && !cfg.camp.trim()) list.push(['bad', 'Preencha o segmento ou a utm_campaign.']);
  if (!cfg.desc.trim()) list.push(['bad', 'Preencha o link da imagem de descrição (abaixo do menu).']);
  else if (!/^https?:\/\/\S+$/.test(cfg.desc.trim())) list.push(['warn', 'O link da imagem de descrição não parece um endereço completo (https://…).']);
  else if (imgStatus[cfg.desc.trim()] === 'fail' && serverStats().ok) list.push(['warn', 'A imagem de descrição não foi encontrada no servidor. Confira o link.']);
  if (!list.some(l => l[0] === 'bad')) list.unshift(['ok', `${flat.length} banners em ${layout.filter(r => r.keys.length).length} linhas, imagens ${imgPrefix()}01 a ${String(flat.length).padStart(2,'0')}.${cfg.ext}.`]);
  $('#checks').innerHTML = list.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('');
}

function renderDerived(){
  $('#cfg-camp').placeholder = campaign();
  $('#cfg-imgprefix').placeholder = imgPrefix();
  $('#d-camp').textContent = campaign();
  $('#d-img').textContent = imgBase() + imgPrefix() + '01.' + cfg.ext;
  $('#d-val').textContent = validade();
  $('#d-file').textContent = 'mkt_' + campaign() + '.html';
  $('#d-desc').textContent = cfg.desc.trim().split('/').pop() || '—';
  $('#d-file2').textContent = 'mkt_' + campaign() + '.html';
}
function renderCode(){ $('#out').value = fullCode(); schedulePreview(); }
function renderAll(){ renderDerived(); renderRows(); renderEditor(); renderChecks(); renderCode(); renderTrash(); renderLines(); renderSwap(); if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#pv-edit') && document.activeElement.tagName === 'INPUT') return; renderPvEdit(); }
function renderAfterEdit(){ renderRows(); renderChecks(); renderCode(); const f = $('#ed-file'); if (f && selected) f.textContent = imgFor(selected); }

/* ---------- pré-visualização ---------- */
let uploads = {};        // posição (1, 2, 3…) -> {name, url}: a imagem fica na posição, o link pode trocar
const upOf = k => uploads[order().indexOf(k) + 1];
let orphanFiles = [];
const xml = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function placeholder(w, h, label, sub, dark){
  const words = String(label).split(/\s+/), lines = []; let cur = '';
  const maxc = Math.max(10, Math.round(w / 11));
  words.forEach(wd => { if ((cur + ' ' + wd).trim().length > maxc){ if (cur) lines.push(cur); cur = wd; } else cur = (cur + ' ' + wd).trim(); });
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 4), fs = 18, y0 = h/2 - (shown.length-1) * fs * .65 + (sub ? -8 : 0);
  const bg = dark ? '#1c1917' : '#f0efed', fg = dark ? '#d6d3d1' : '#292524', st = dark ? '#44403c' : '#d6d3d1';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/><rect x="4" y="4" width="${w-8}" height="${h-8}" fill="none" stroke="${st}" stroke-dasharray="6 5" stroke-width="2"/>` +
    shown.map((l, i) => `<text x="${w/2}" y="${y0 + i*fs*1.3}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fs}" font-weight="700" fill="${fg}">${xml(l)}</text>`).join('') +
    (sub ? `<text x="${w/2}" y="${y0 + shown.length*fs*1.3 + 6}" text-anchor="middle" font-family="monospace" font-size="12" fill="${fg}" opacity=".7">${xml(sub)}</text>` : '') + `</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const SIZES = {1:[607,220], 2:[303,300], 3:[202,250], 4:[151,220]};
function previewHTML(){
  const bySrc = {};
  const ord = order();
  layout.forEach(r => r.keys.forEach(k => { bySrc[imgFor(k)] = {k, cap: r.keys.length, i: ord.indexOf(k)}; }));
  const PV_CSS = '<style>img[data-pk]{cursor:pointer;outline:3px solid transparent;outline-offset:-3px;transition:outline-color .15s,opacity .15s}a:hover img[data-pk]{outline-color:rgba(12,10,9,.45)}img[data-pk].pv-sel{outline:4px solid #0c0a09!important;outline-offset:-4px}</style>';
  return fullCode().replace('</head>', PV_CSS + '</head>').replace(/<img([^>]*?)src="([^"]+)"([^>]*)>/g, (all, a, src, b) => {
    const alt = ((a + b).match(/alt="([^"]*)"/) || [,''])[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&');
    const hit = bySrc[src];
    if (!(hit && upOf(hit.k))){
      const st = probe(src);
      if (st === 'ok') return hit ? `<img data-pk="${hit.i}"${a}src="${src}"${b}>` : all;   // imagem real carregou do servidor
    }
    if (hit){
      if (upOf(hit.k)) return `<img data-pk="${hit.i}"${a}src="${upOf(hit.k).url}"${b}>`;
      const [w, h] = SIZES[hit.cap] || SIZES[1];
      return `<img data-pk="${hit.i}"${a}src="${placeholder(w, h, alt, src.split('/').pop())}"${b}>`;
    }
    // imagens fixas do cabeçalho e rodapé
    const name = src.split('/').pop();
    const h = /head_01/.test(name) ? 70 : /descricao/.test(name) ? 44 : /foot_01/.test(name) ? 40 : 56;
    return `<img${a}src="${placeholder(600, h, alt || name, '', true)}"${b}>`;
  });
}
const imgStatus = {};   // src -> 'pending' | 'ok' | 'fail'
function probe(src){
  if (imgStatus[src]) return imgStatus[src];
  if (!/^https?:/.test(src)){ imgStatus[src] = 'fail'; return 'fail'; }
  imgStatus[src] = 'pending';
  const im = new Image();
  const done = st => { if (imgStatus[src] !== 'pending') return; imgStatus[src] = st; schedulePreview(); renderChecks(); };
  im.onload = () => done(im.naturalWidth > 0 ? 'ok' : 'fail');
  im.onerror = () => done('fail');
  setTimeout(() => done('fail'), 8000);
  im.src = src;
  return 'pending';
}
function serverStats(){
  const flat = order();
  const ok = flat.filter(k => !upOf(k) && imgStatus[imgFor(k)] === 'ok').length;
  const fail = flat.map((k, i) => (!upOf(k) && imgStatus[imgFor(k)] === 'fail') ? i+1 : null).filter(Boolean);
  return {ok, fail};
}
let pvT;
function schedulePreview(){ clearTimeout(pvT); pvT = setTimeout(renderPreview, 250); }
function renderPreview(){
  const f = $('#pv');
  const y = f.contentWindow ? f.contentWindow.scrollY : 0;
  f.onload = () => {
    try{ const d = f.contentDocument; f.style.height = Math.max(400, d.documentElement.scrollHeight + 4) + 'px'; f.contentWindow.scrollTo(0, y); }catch(e){}
    try{ hookPreview(f.contentDocument); }catch(e){}
  };
  f.srcdoc = previewHTML();
  const n = Object.keys(uploads).filter(p => +p <= order().length).length, s = serverStats(), total = order().length;
  const partsTxt = [];
  if (s.ok) partsTxt.push(`${s.ok} do servidor`);
  if (n) partsTxt.push(`${n} enviada${n > 1 ? 's' : ''} aqui`);
  const missing = total - s.ok - n;
  if (missing > 0) partsTxt.push(`${missing} com espaço reservado`);
  $('#pv-count').textContent = partsTxt.join(' · ');
  $('#pv-blocked').hidden = !imgBlocked();
}
/* imagem que sempre existe no servidor: se nem ela carrega, o ambiente bloqueia imagens externas */
const CANARY = 'https://img.kalunga.com.br/news/images/novos-news2/test-news-v9/images/head_01.jpg';
function imgBlocked(){ return imgStatus[CANARY] === 'fail'; }
function renderBlockedNotes(){ const b = imgBlocked(); $('#img-blocked').hidden = !b; $('#pv-blocked').hidden = !b; }
function addFiles(fileList){
  const files = [...fileList].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  const flat = order();
  Promise.all(files.map(f => new Promise(res => { const r = new FileReader(); r.onload = () => res({name: f.name, url: r.result}); r.onerror = () => res(null); r.readAsDataURL(f); })))
    .then(list => {
      orphanFiles = [];
      list.filter(Boolean).forEach(f => {
        let pos = flat.findIndex(k => imgFor(k).split('/').pop() === f.name) + 1;
        if (!pos){ const m = f.name.match(/(\d+)\.[a-z0-9]+$/i); if (m && +m[1] >= 1 && +m[1] <= flat.length) pos = +m[1]; }
        if (pos) uploads[pos] = f; else orphanFiles.push(f.name);
      });
      renderAll();
    });
}
const drop = $('#drop'), fileInput = $('#files');
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
['dragenter','dragover'].forEach(t => drop.addEventListener(t, ev => { if ([...(ev.dataTransfer?.types||[])].includes('Files')){ ev.preventDefault(); drop.classList.add('over'); } }));
['dragleave','drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('over')));
drop.addEventListener('drop', ev => { ev.preventDefault(); addFiles(ev.dataTransfer.files); });
$('#pv-desk').addEventListener('click', () => { $('#pv').classList.remove('mobile'); $('#pv-desk').setAttribute('aria-pressed','true'); $('#pv-mob').setAttribute('aria-pressed','false'); schedulePreview(); });
$('#pv-mob').addEventListener('click', () => { $('#pv').classList.add('mobile'); $('#pv-mob').setAttribute('aria-pressed','true'); $('#pv-desk').setAttribute('aria-pressed','false'); schedulePreview(); });
$('#pv-clear').addEventListener('click', () => { uploads = {}; orphanFiles = []; renderAll(); });

/* ---------- edição direto na prévia ---------- */
let pvSel = null;   // posição (0, 1, 2…) do banner selecionado na prévia
function hookPreview(doc){
  if (!doc) return;
  doc.querySelectorAll('img[data-pk]').forEach(im => im.classList.toggle('pv-sel', pvSel !== null && +im.dataset.pk === pvSel));
  if (doc.__pvHooked) return;
  doc.__pvHooked = true;
  doc.addEventListener('click', ev => {
    const im = ev.target.closest && (ev.target.closest('img[data-pk]') || (ev.target.closest('a') && ev.target.closest('a').querySelector('img[data-pk]')));
    if (!im) return;
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey) return;   // abre o link normalmente
    ev.preventDefault();
    selectPv(+im.dataset.pk, true);
  });
}
function selectPv(i, focus){
  pvSel = i;
  renderPvEdit();
  try{ hookPreview($('#pv').contentDocument); }catch(e){}
  if (focus){ const t = $('#pe-title'); if (t){ t.focus(); t.select(); } }
}
function rowOf(k){ return layout.findIndex(r => r.keys.includes(k)); }
function renderPvEdit(){
  const box = $('#pv-edit'), flat = order();
  if (pvSel === null || pvSel >= flat.length){ box.hidden = true; $('#pv-hint').hidden = false; pvSel = null; return; }
  const k = flat[pvSel], it = items[k], e = eff(k), m = manual[k] || {};
  const ri = rowOf(k), row = layout[ri], ci = row.keys.indexOf(k);
  const opts = flat.map((_, j) => j === pvSel ? '' : `<option value="${j}">${String(j + 1).padStart(2,'0')} · ${esc(eff(flat[j]).title).slice(0, 34)}</option>`).join('');
  box.hidden = false; $('#pv-hint').hidden = true;
  box.innerHTML = `
    <div class="pe-head"><span class="pe-n">${String(pvSel + 1).padStart(2,'0')}</span><span class="pe-file" title="${esc(imgFor(k))}">${esc(imgFor(k).split('/').pop())}</span><button type="button" class="ghost" data-pe="close" aria-label="Fechar edição">×</button></div>
    <label>Título / alt<input id="pe-title" value="${esc(e.title)}" placeholder="${it.kind === 'lista' ? 'Ex.: Papelaria' : ''}"></label>
    <label>Link<input id="pe-url" class="mono" value="${esc(m.url || '')}" placeholder="${esc(it.url)}"></label>
    <label>utm_term<input id="pe-term" class="mono" value="${esc(e.termEdited ? e.term : '')}" placeholder="${esc(e.termAuto)}"></label>
    <span class="pe-sec">Mover o link (a imagem fica)</span>
    <div class="pe-move">
      <button type="button" data-pe="-1" ${pvSel === 0 ? 'disabled' : ''}>← Anterior</button>
      <button type="button" data-pe="1" ${pvSel === flat.length - 1 ? 'disabled' : ''}>Próximo →</button>
      <select id="pe-swap" aria-label="Trocar o link com outro banner"><option value="">Trocar com…</option>${opts}</select>
    </div>
    <span class="pe-sec">Linha ${ri + 1}</span>
    <div class="pe-row"><span class="seg" role="group" aria-label="Banners nesta linha">${[1,2,3,4].map(c => `<button type="button" data-pe-cap="${c}" aria-pressed="${row.cap === c}">${c}</button>`).join('')}</span> por linha</div>
    <div class="pe-foot"><a class="ghost-link" style="width:auto;padding:0 8px;font-size:12.5px" href="${esc(urlOf(k))}" target="_blank" rel="noopener">Abrir link ↗</a><button type="button" class="danger" data-pe="remove">Remover banner</button></div>`;
}
let peT;
$('#pv-edit').addEventListener('input', ev => {
  if (pvSel === null) return;
  const k = order()[pvSel], m = manual[k] = manual[k] || {};
  if (ev.target.id === 'pe-title') m.title = ev.target.value;
  if (ev.target.id === 'pe-url') m.url = ev.target.value.trim();
  if (ev.target.id === 'pe-term'){ const v = ev.target.value.trim().toUpperCase().replace(/\s+/g,'-'); m.term = v || null; }
  if (ev.target.id === 'pe-title' || ev.target.id === 'pe-url'){ const t = $('#pe-term'); if (t) t.placeholder = eff(k).termAuto; }
  store.set('manual', manual);
  clearTimeout(peT); peT = setTimeout(() => { renderChecks(); renderCode(); renderRows(); renderLines(); renderSwap(); }, 250);
});
$('#pv-edit').addEventListener('change', ev => {
  if (ev.target.id !== 'pe-swap' || ev.target.value === '') return;
  const j = +ev.target.value; swapLinks([[pvSel, j]], `Links ${pvSel + 1} e ${j + 1} trocados.`);
});
$('#pv-edit').addEventListener('click', ev => {
  const b = ev.target.closest('[data-pe],[data-pe-cap]'); if (!b || pvSel === null) return;
  const flat = order(), k = flat[pvSel];
  if (b.dataset.pe === 'close'){ pvSel = null; renderPvEdit(); try{ hookPreview($('#pv').contentDocument); }catch(e){} return; }
  if (b.dataset.pe === 'remove'){ const i = pvSel; pvSel = null; removeItem(k); if (i < order().length) selectPv(i); return; }
  if (b.dataset.pe === '-1' || b.dataset.pe === '1'){ const j = pvSel + (+b.dataset.pe); swapLinks([[pvSel, j]], `Links ${pvSel + 1} e ${j + 1} trocados.`); return; }
  if (b.dataset.peCap){
    const ri = rowOf(k), row = layout[ri], cap = +b.dataset.peCap;
    row.cap = cap; layoutTouched = true;
    if (row.keys.length > cap){ const extra = row.keys.splice(cap); layout.splice(ri + 1, 0, {cap: Math.min(4, extra.length), keys: extra}); }
    else if (row.keys.length < cap){
      // puxa os próximos banners para completar a linha
      let r2 = ri + 1;
      while (row.keys.length < cap && r2 < layout.length){
        const nxt = layout[r2];
        while (row.keys.length < cap && nxt.keys.length) row.keys.push(nxt.keys.shift());
        if (!nxt.keys.length) layout.splice(r2, 1); else r2++;
      }
    }
    saveLayout(); renderAll();
  }
});

/* ---------- imagens e links: a imagem fica na posição, o link troca ---------- */
let swMoved = new Set();
function swImgSrc(k){ const u = upOf(k); return u ? u.url : imgFor(k); }
function renderSwap(){
  const el = $('#swap-list'); if (!el) return;
  const flat = order();
  if (!flat.length){ el.innerHTML = '<li class="help">Nenhum banner na montagem.</li>'; return; }
  const firstOfRow = new Set(layout.filter(r => r.keys.length).map(r => r.keys[0]));
  el.innerHTML = flat.map((k, i) => {
    const e = eff(k), n = String(i + 1).padStart(2, '0'), file = imgFor(k).split('/').pop();
    const opts = flat.map((_, j) => j === i ? '' : `<option value="${j}">${String(j + 1).padStart(2, '0')} · ${esc(eff(flat[j]).title).slice(0, 40)}</option>`).join('');
    return `<li class="sw${swMoved.has(k) ? ' moved' : ''}${i && firstOfRow.has(k) ? ' pair-start' : ''}" data-i="${i}">
      <span class="ln-n">${n}</span>
      <div class="sw-img" title="${esc(file)}"><img src="${esc(swImgSrc(k))}" alt="" loading="lazy" data-file="${esc(file)}"></div>
      <span class="sw-arrow">→</span>
      <div class="sw-link"><b>${esc(e.title) || 'sem título'}</b><span>${esc(shortUrl(urlOf(k)))} · ${esc(e.term)}</span></div>
      <div class="sw-acts">
        <button type="button" data-sw="-1" ${i === 0 ? 'disabled' : ''} title="Trocar o link com a imagem de cima" aria-label="Trocar com o de cima">↑</button>
        <button type="button" data-sw="1" ${i === flat.length - 1 ? 'disabled' : ''} title="Trocar o link com a imagem de baixo" aria-label="Trocar com o de baixo">↓</button>
        <select data-sw-to aria-label="Trocar o link com outra imagem"><option value="">Trocar com…</option>${opts}</select>
      </div>
    </li>`;
  }).join('');
}
function swapLinks(pairs, msg){
  const flat = order(); const next = flat.slice();
  pairs.forEach(([i, j]) => { const t = next[i]; next[i] = next[j]; next[j] = t; });
  let p = 0;
  layout.forEach(r => { r.keys = r.keys.map(() => next[p++]); });
  swMoved = new Set(pairs.flat().map(i => next[i]));
  layoutTouched = true; saveLayout(); renderAll();
  const t = $('#pv-count'); if (msg && t) t.textContent = msg;
  setTimeout(() => { swMoved = new Set(); renderSwap(); }, 1600);
}
$('#swap-list').addEventListener('click', ev => {
  const b = ev.target.closest('[data-sw]'); if (!b) return;
  const i = +b.closest('.sw').dataset.i, j = i + (+b.dataset.sw);
  swapLinks([[i, j]], `Links ${i + 1} e ${j + 1} trocados.`);
});
$('#swap-list').addEventListener('change', ev => {
  if (!ev.target.matches('[data-sw-to]') || ev.target.value === '') return;
  const i = +ev.target.closest('.sw').dataset.i, j = +ev.target.value;
  swapLinks([[i, j]], `Links ${i + 1} e ${j + 1} trocados.`);
});
$('#sw-pairs').addEventListener('click', () => {
  const flat = order(), pairs = [];
  layout.forEach(r => { if (r.keys.length === 2) pairs.push([flat.indexOf(r.keys[0]), flat.indexOf(r.keys[1])]); });
  if (pairs.length) swapLinks(pairs, `Lados invertidos em ${pairs.length} ${pairs.length > 1 ? 'linhas' : 'linha'}.`);
});
$('#sw-all').addEventListener('click', () => {
  const n = order().length, pairs = [];
  for (let i = 0; i < Math.floor(n / 2); i++) pairs.push([i, n - 1 - i]);
  if (pairs.length) swapLinks(pairs, 'Ordem dos links invertida.');
});

function reparse(force){ reconcile(parseBrief($('#brief').value), force); store.set('brief', $('#brief').value); renderAll(); }
function refreshItems(){ reconcile(parseBrief($('#brief').value), false); renderAll(); }

/* ---------- eventos ---------- */
const cfgMap = {date:'#cfg-date', ext:'#cfg-ext', seg:'#cfg-seg', camp:'#cfg-camp', imgprefix:'#cfg-imgprefix', imgbase:'#cfg-imgbase', desc:'#cfg-desc'};
Object.entries(cfgMap).forEach(([k, sel]) => {
  const el = $(sel); el.value = cfg[k];
  el.addEventListener('input', () => { cfg[k] = el.value; if (k === 'date' && !el.value) cfg.date = todayISO(); store.set('cfg', cfg); renderDerived(); renderAfterEdit(); });
});

let tmr; $('#brief').addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => {
  reparse(false);
  autoLookup();
}, 400); });
$('#btn-sample').addEventListener('click', () => { $('#brief').value = SAMPLE; manual = {}; reparse(true); autoLookup(); setView('lines'); });
function clearBrief(){ if ($('#brief').value.trim()) snapshotBrief('Briefing apagado.'); $('#brief').value = ''; manual = {}; selected = null; uploads = {}; reparse(true); }
$('#btn-clear').addEventListener('click', () => { clearBrief(); $('#brief').focus(); });
$('#btn-new').addEventListener('click', () => { clearBrief(); setView('lines'); $('#paste').focus(); });
$('#btn-relayout').addEventListener('click', () => reparse(true));
function snapshot(msg){ undoSnap = {layout: JSON.parse(JSON.stringify(layout)), removed: removed.slice(), msg}; }
function bannerLabel(k){ const n = order().indexOf(k) + 1; return `Banner ${String(n).padStart(2,'0')}`; }
function removeItem(k){
  if (!k || !items[k]) return;
  snapshot(`${bannerLabel(k)} removido.`);
  layout.forEach(r => { r.keys = r.keys.filter(x => x !== k); });
  layout = layout.filter(r => r.keys.length || r.keepEmpty);
  removed.push(k);
  if (selected === k) selected = null;
  saveLayout(); renderAll();
}
function removeRow(ri){
  const row = layout[ri]; if (!row) return;
  snapshot(row.keys.length ? `Linha ${ri+1} removida com ${row.keys.length} banner${row.keys.length > 1 ? 's' : ''}.` : `Linha ${ri+1} removida.`);
  removed.push(...row.keys);
  if (row.keys.includes(selected)) selected = null;
  layout.splice(ri, 1);
  saveLayout(); renderAll();
}
function renderTrash(){
  const el = $('#trash');
  const list = removed.filter(k => items[k]);
  let html = '';
  if (undoSnap) html += `<div class="undo" role="status"><span>${esc(undoSnap.msg)}</span><button type="button" data-undo>Desfazer</button><button type="button" class="ghost" data-undo-close aria-label="Fechar aviso">×</button></div>`;
  if (list.length) html += `<div class="removed"><b>Removidos (${list.length})</b>${list.map(k => `<span class="rm-item"><span class="rm-t">${esc(eff(k).title) || 'sem título'}</span><button type="button" class="ghost" data-restore="${esc(k)}">Restaurar</button></span>`).join('')}</div>`;
  el.innerHTML = html; el.hidden = !html;
}
$('#trash').addEventListener('click', ev => {
  if (ev.target.closest('[data-undo]')){ layout = undoSnap.layout; removed = undoSnap.removed; undoSnap = null; saveLayout(); renderAll(); return; }
  if (ev.target.closest('[data-undo-close]')){ undoSnap = null; renderTrash(); return; }
  const rs = ev.target.closest('[data-restore]');
  if (rs){ const k = rs.dataset.restore; removed = removed.filter(x => x !== k); layoutTouched = true; layout.push({cap: 1, keys: [k]}); undoSnap = null; saveLayout(); renderAll(); }
});
$('#btn-add-row').addEventListener('click', () => { layoutTouched = true; layout.push({cap: 2, keys: [], keepEmpty: true}); saveLayout(); renderAll(); });

$('#rows').addEventListener('click', ev => {
  const capBtn = ev.target.closest('[data-cap]');
  if (capBtn && capBtn.tagName === 'BUTTON'){
    const ri = +capBtn.closest('.lrow').dataset.r, cap = +capBtn.dataset.cap, row = layout[ri];
    row.cap = cap; layoutTouched = true;
    if (row.keys.length > cap){ const extra = row.keys.splice(cap); layout.splice(ri+1, 0, {cap: Math.min(MAX_COLS, extra.length), keys: extra}); }
    saveLayout(); renderAll(); return;
  }
  const rm = ev.target.closest('[data-rm]');
  if (rm){ ev.stopPropagation(); removeItem(rm.dataset.rm); return; }
  const del = ev.target.closest('[data-del]');
  if (del){ removeRow(+del.dataset.del); return; }
  const card = ev.target.closest('.card');
  if (card){ selected = selected === card.dataset.k ? null : card.dataset.k; renderRows(); renderEditor(); }
});
$('#rows').addEventListener('keydown', ev => {
  const card = ev.target.closest('.card');
  if (ev.target.tagName === 'BUTTON') return;
  if (card && (ev.key === 'Enter' || ev.key === ' ')){ ev.preventDefault(); selected = card.dataset.k; renderRows(); renderEditor(); $('#ed-title')?.focus(); }
});

$('#editor').addEventListener('input', ev => {
  if (!selected) return;
  const m = manual[selected] = manual[selected] || {};
  if (ev.target.id === 'ed-title') m.title = ev.target.value;
  if (ev.target.id === 'ed-img') m.img = ev.target.value.trim();
  if (ev.target.id === 'ed-url') m.url = ev.target.value.trim();
  if (ev.target.id === 'ed-term'){
    const v = ev.target.value.trim().toUpperCase().replace(/\s+/g,'-');
    m.term = v || null;
    const ed = !!v; $('#ed-pill').className = 'pill ' + (ed ? 'edit' : 'auto'); $('#ed-pill').textContent = ed ? 'editado' : 'auto'; $('#ed-reset').hidden = !ed;
  }
  saveLayout(); renderAfterEdit();
});
$('#editor').addEventListener('click', ev => {
  if (ev.target.closest('[data-close]')){ selected = null; renderRows(); renderEditor(); return; }
  if (ev.target.closest('[data-remove]')){ removeItem(selected); return; }
  if (ev.target.id === 'ed-reset'){ (manual[selected] = manual[selected] || {}).term = null; saveLayout(); renderAll(); return; }
  const mv = ev.target.closest('[data-move]');
  if (mv){
    const flat = order(), i = flat.indexOf(selected), j = i + +mv.dataset.move;
    if (j < 0 || j >= flat.length) return;
    const swap = flat[j];
    layoutTouched = true;
    layout.forEach(r => { r.keys = r.keys.map(k => k === selected ? swap : k === swap ? selected : k); });
    saveLayout(); renderAll();
  }
});

function copy(text, msg){
  const done = () => { $('#toast').textContent = msg; setTimeout(() => $('#toast').textContent = '', 2500); };
  const fallback = () => { const o = $('#out'); o.focus(); o.select(); $('#toast').textContent = 'Texto selecionado. Use Ctrl+C para copiar.'; };
  try{ navigator.clipboard.writeText(text).then(done, fallback); }catch(e){ fallback(); }
}
$('#btn-copy-full').addEventListener('click', () => copy(fullCode(), 'HTML completo copiado.'));
async function downloadHtml(){
  const filename = 'mkt_' + campaign() + '.html', data = fullCode();
  const say = t => { $('#toast').textContent = t; setTimeout(() => $('#toast').textContent = '', 4000); };
  // Dentro do Claude o download passa pela confirmação da plataforma
  let dl = null;
  try{ if (window.claude && window.claude.use) dl = await window.claude.use('downloads'); }catch(e){ dl = null; }
  if (dl){
    try{ await dl.save({filename, data}); say('Arquivo baixado: ' + filename); }
    catch(e){
      if (e && e.code === 'declined') say('Download cancelado.');
      else if (e && e.code === 'rate_limited') say('Já tem uma confirmação de download aberta.');
      else copy(data, 'Não deu para baixar aqui. Copiei o HTML completo.');
    }
    return;
  }
  try{
    const url = URL.createObjectURL(new Blob([data], {type: 'text/html;charset=utf-8'}));
    const a = Object.assign(document.createElement('a'), {href: url, download: filename});
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    say('Arquivo baixado: ' + filename);
  }catch(e){ copy(data, 'Não deu para baixar aqui. Copiei o HTML completo.'); }
}
$('#btn-download').addEventListener('click', downloadHtml);
$('#btn-copy-body').addEventListener('click', () => copy(bodyCode(), 'Blocos da news copiados.'));

function setTheme(t){
  document.documentElement.classList.toggle('dark', t === 'dark');
  $('#th-light').setAttribute('aria-pressed', String(t !== 'dark'));
  $('#th-dark').setAttribute('aria-pressed', String(t === 'dark'));
  store.set('theme', t);
}
$('#th-light').addEventListener('click', () => setTheme('light'));
$('#th-dark').addEventListener('click', () => setTheme('dark'));
setTheme(store.get('theme', 'light'));

/* ---------- buscador (SKUs e links) ---------- */
// Publicado no servidor, o buscador fica no mesmo endereço (/api).
// Abrindo o arquivo direto do computador, ele usa o servidor local (Iniciar gerador.bat).
const API_CANDIDATES = location.protocol.startsWith('http') ? ['/api', 'http://localhost:5055/api'] : ['http://localhost:5055/api'];
let API = null, helperOnline = false;
const busy = new Set();
function fetchT(url, ms){ const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(url, {signal: c.signal}).finally(() => clearTimeout(t)); }
async function pingHelper(){
  helperOnline = false;
  for (const base of API_CANDIDATES){
    try{ const r = await fetchT(base + '/ping', 2000); const j = await r.json(); if (j && j.ok){ API = base; helperOnline = true; break; } }catch(e){}
  }
  const el = $('#helper-status'); el.className = 'conn' + (helperOnline ? ' on' : ''); el.textContent = helperOnline ? 'Buscador conectado' : 'Buscador desligado';
  renderLookupNote();
  return helperOnline;
}
async function callApi(path){
  if (!helperOnline) await pingHelper();
  if (!helperOnline) return {error: 'buscador desligado', offline: true};
  try{ const r = await fetchT(API + path, 25000); return await r.json(); }
  catch(e){ return {error: 'o buscador não respondeu'}; }
}
const isKalunga = u => /^https?:\/\/([a-z0-9-]+\.)*kalunga\.com\.br\//i.test(u || '');
const lookupId = it => it.sku ? 'sku:' + it.sku : 'url:' + it.url;
function needsLookup(it){ return !!it && (it.sku || (isKalunga(it.url) && it.kind !== 'lista' && it.kind !== 'busca')); }
function lookupList(){
  const out = [], seenIds = new Set();
  Object.values(items).forEach(it => {
    if (!needsLookup(it)) return;
    const id = lookupId(it); if (seenIds.has(id)) return; seenIds.add(id);
    out.push({id, it});
  });
  return out;
}
function cacheOf(id){ return id.startsWith('sku:') ? skuCache[id.slice(4)] : pageCache[id.slice(4)]; }
function isDone(id){ const c = cacheOf(id); return !!(c && (c.status === 'ok' || c.status === 'manual' || c.status === 'erro')); }
async function runLookups(ids, force){
  const todo = [...new Set(ids)].filter(id => !busy.has(id) && (force || !isDone(id)));
  if (!todo.length) return;
  todo.forEach(id => busy.add(id)); renderLines();
  let i = 0;
  const worker = async () => {
    while (i < todo.length){
      const id = todo[i++], val = id.slice(4);
      if (id.startsWith('sku:')){
        const j = await callApi('/sku/' + val);
        skuCache[val] = j.url ? {url: j.url, title: j.title || '', status: 'ok'} : (j.offline ? {status: 'pend'} : {status: 'erro', error: j.error || 'não encontrado'});
        store.set('skus', skuCache);
      } else {
        const j = await callApi('/pagina?url=' + encodeURIComponent(val));
        pageCache[val] = j.ok ? {final: j.url, title: j.title || '', pageTitle: j.page_title || '', status: 'ok'} : (j.offline ? {status: 'pend'} : {status: 'erro', error: j.error || 'página não encontrada'});
        store.set('pages', pageCache);
      }
      busy.delete(id);
      refreshItems();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}
function autoLookup(){ if (!helperOnline) return; runLookups(lookupList().map(e => e.id).filter(id => !isDone(id))); }
function skusInBrief(){ return [...new Set(Object.values(items).filter(it => it.sku).map(it => it.sku))]; }
function renderLookupNote(){
  const el = $('#lookup-note'); if (!el) return;
  const pend = lookupList().filter(e => !isDone(e.id)).length;
  el.hidden = helperOnline || !pend;
  el.innerHTML = location.protocol.startsWith('http')
    ? `O buscador não respondeu, então ${pend} ${pend > 1 ? 'itens ficaram' : 'item ficou'} sem conferir. Tente “Buscar de novo” em instantes, ou preencha nome e link à mão nas linhas marcadas.`
    : `Para buscar produtos e conferir links, dê dois cliques em <code>Iniciar gerador.bat</code> e use o endereço que abrir. Sem ele, preencha nome e link à mão nas linhas marcadas.`;
}

/* ---------- lista de linhas ---------- */
let editingEntry = null, openLinkQ = null, prevSigs = new Set();
const shortUrl = u => (u || '').replace(/^https?:\/\/(www\.)?kalunga\.com\.br/,'');
function skuOfUrl(u){ const m = /\/prod\/[^/]+\/(\d{6})/.exec(u || ''); return m && m[1]; }
function thumbCodes(it){
  if (!it) return [];
  if (it.sku) return [it.sku];
  if (it.kind === 'produto'){ const s = skuOfUrl(urlOf(it.key)); return s ? [s] : []; }
  if (it.kind === 'lista') return (it.codes || []).slice(0, 4);
  return [];
}
function thumbHTML(it, kind){
  const codes = thumbCodes(it);
  const glyph = kind === 'pergunta' ? '?' : (kind === 'nota' || kind === 'junta') ? '¶' : kind === 'busca' ? 'b' : kind === 'hotsite' ? 'h' : kind === 'categoria' ? 'c' : kind === 'marca' ? 'm' : '↗';
  if (!codes.length) return `<div class="ln-thumb"><span class="glyph">${glyph}</span></div>`;
  if (codes.length === 1) return `<div class="ln-thumb"><img src="${PROD_IMG(codes[0])}" alt="" loading="lazy" data-glyph="${glyph}"></div>`;
  return `<div class="ln-thumb multi">${codes.map(c => `<img src="${PROD_IMG(c)}" alt="" loading="lazy">`).join('')}${it.codes.length > 4 ? `<span class="more">+${it.codes.length - 4}</span>` : ''}</div>`;
}
function statusHTML(it){
  if (!needsLookup(it)) return '';
  const id = lookupId(it), c = cacheOf(id) || {};
  if (busy.has(id)) return '<span class="st load"><span class="spin"></span>Buscando</span>';
  if (c.status === 'ok') return `<span class="st ok">${it.sku ? 'Encontrado' : it.needsTitle ? 'Título da página' : 'Página ok'}</span>`;
  if (c.status === 'manual') return '<span class="st manual">Manual</span>';
  if (c.status === 'erro') return `<span class="st err">${it.sku ? 'Não encontrado' : 'Com problema'}</span>`;
  return '<span class="st pend">Não conferido</span>';
}
function askHTML(e){
  const q = e.q, cur = answers[q.id];
  const isLink = (cur || '').startsWith('link:');
  return `<div class="ask-box">
    <p class="ask-q">${esc(q.ask)}</p>
    <div class="opts">${q.options.map(([v, l]) => `<button type="button" data-ans="${v}" aria-pressed="${cur === v || (v === 'link' && isLink)}"${cur === undefined && v === q.def ? ' class="sug"' : ''}>${l}</button>`).join('')}</div>
    ${openLinkQ === q.id || isLink ? `<div class="ask-link"><input id="al-${esc(q.id).replace(/[^a-z0-9]/gi,'')}" data-qlink placeholder="${KSITE}/depto/…" value="${esc(isLink ? cur.slice(5) : '')}"><button type="button" data-qlink-ok>Usar link</button></div>` : ''}
  </div>`;
}
function renderLines(){
  const el = $('#lines'); if (!el) return;
  const focusId = document.activeElement && document.activeElement.id;
  const ord = order();
  const nItems = Object.keys(items).length, pend = unanswered();
  $('#brief-count').textContent = entries.length ? `${briefLines.filter(l => l.trim()).length} linhas · ${nItems} banners${pend.length ? ` · ${pend.length} ${pend.length > 1 ? 'dúvidas' : 'dúvida'}` : ''}` : '';
  $('#qbar').hidden = !pend.length;
  $('#qbar-text').textContent = pend.length ? `${pend.length} ${pend.length > 1 ? 'linhas precisam' : 'linha precisa'} da sua confirmação. Escolha uma opção em cada uma ou aceite as sugestões.` : '';
  if (!entries.length){ el.innerHTML = '<li class="empty">Cole o briefing acima para começar. <button type="button" class="ghost" onclick="document.getElementById(\'btn-sample\').click()">Ver um exemplo</button></li>'; prevSigs = new Set(); return; }
  const sigs = new Set();
  el.innerHTML = entries.map((e, ei) => {
    if (e.kind === 'sep') return `<li class="ln-sep" aria-hidden="true"></li>`;
    const it = e.item, raw = e.lines.map(i => briefLines[i]);
    const sig = raw.join('\n') + '|' + (e.part || 0); sigs.add(sig);
    const isNew = !prevSigs.has(sig);
    const num = it && ord.includes(it.key) ? String(ord.indexOf(it.key) + 1).padStart(2,'0') : '';
    const out = it && removed.includes(it.key);
    const ask = e.q && answers[e.q.id] === undefined;
    const kind = e.kind;
    const label = KIND_LABEL[kind] || kind;
    const c = it && needsLookup(it) ? (cacheOf(lookupId(it)) || {}) : {};
    const manualOpen = it && it.sku && !busy.has(lookupId(it)) && c.status !== 'ok';
    const manualTitle = it && !it.sku && it.needsTitle && c.status === 'erro';
    const mid = it ? lookupId(it) : '';
    const fid = 'f' + ei;
    let body = '';
    if (it){
      body += `<div class="ln-title">${esc(eff(it.key).title) || '<i>sem título</i>'}</div>`;
      body += `<div class="ln-url">${esc(shortUrl(urlOf(it.key)))}${it.kind === 'lista' ? ` · ${it.codes.length} produtos` : ''}</div>`;
    } else if (kind === 'nota'){
      body += `<div class="ln-title" style="font-weight:400">${e.target ? `Vira nota do banner “${esc(eff(e.target.key).title)}”.` : 'Fica como anotação, fora da news.'}</div>`;
    } else if (kind === 'junta' && e.target){
      body += `<div class="ln-title" style="font-weight:400">Entrou na lista “${esc(cleanTitle(e.target.title) || 'de produtos')}”.</div>`;
    }
    if (c.status === 'erro') body += `<div class="ln-msg">${esc(c.error || '')}</div>`;
    if (editingEntry === ei){
      body += `<div class="ln-edit">${e.lines.map(li => `<input id="ed-l-${li}" data-line="${li}" value="${esc(briefLines[li])}">`).join('')}<div class="row-actions"><button type="button" data-edit-ok>Salvar</button><button type="button" class="ghost" data-edit-cancel>Cancelar</button></div></div>`;
    } else {
      body += `<div class="ln-src" title="Linha original">${esc(raw.join('  ⏎  '))}</div>`;
    }
    if (manualOpen) body += `<div class="sku-manual"><input id="${fid}-t" data-mid="${esc(mid)}" data-f="title" placeholder="Nome do produto (H1)" value="${esc(c.status === 'manual' ? (c.title || '') : '')}"><input id="${fid}-u" data-mid="${esc(mid)}" data-f="url" class="mono" placeholder="${KSITE}/prod/…/${it.sku}" value="${esc(c.status === 'manual' ? (c.url || '') : '')}"></div>`;
    if (it && it.kind === 'lista' && !it.title) body += `<div class="sku-manual"><input id="${fid}-lt" data-ltitle="${esc(it.key)}" placeholder="Título do banner (ex.: Papelaria)" value="${esc((manual[it.key] || {}).title || '')}"></div>`;
    if (manualTitle) body += `<div class="sku-manual"><input id="${fid}-t" data-mid="${esc(mid)}" data-f="title" placeholder="Título do banner" value=""></div>`;
    if (e.q) body += askHTML(e);
    if (out) body += `<div class="help">Removido na montagem.</div>`;
    const cls = ['ln', isNew ? 'enter' : '', e.q ? 'ask' : '', e.q && !ask ? 'answered' : '', (out || kind === 'nota' || kind === 'junta') ? 'muted' : ''].filter(Boolean).join(' ');
    return `<li class="${cls}" data-e="${ei}" style="--i:${isNew ? Math.min(ei, 12) : 0}">
      <span class="ln-n ${num ? '' : 'none'}">${num || '·'}</span>
      ${thumbHTML(it, kind)}
      <div class="ln-main">
        <div class="ln-top"><span class="chip${ask ? ' q' : ''}">${ask ? 'Confirme · ' : ''}${label}</span>${it ? statusHTML(it) : ''}${e.merged ? '<span class="help">título e link em 2 linhas</span>' : ''}${e.of > 1 ? `<span class="help">${e.part + 1} de ${e.of} na mesma linha</span>` : ''}</div>
        ${body}
      </div>
      <div class="ln-acts">
        ${e.merged ? '<button type="button" class="ghost" data-split title="Tratar como 2 linhas separadas">Separar</button>' : ''}
        ${it && needsLookup(it) && (c.status === 'ok' || c.status === 'erro') ? '<button type="button" class="ghost" data-retry title="Buscar de novo">↻</button>' : ''}
        <a class="ghost-link" href="${esc(it ? (it.sku ? buscaUrl(it.sku) : urlOf(it.key)) : '#')}" target="_blank" rel="noopener" ${it ? '' : 'hidden'} title="Abrir no site">↗</a>
        <button type="button" class="ghost" data-edit title="Editar a linha">Editar</button>
        <button type="button" class="ghost" data-del title="Apagar a linha do briefing">×</button>
      </div>
    </li>`;
  }).join('');
  prevSigs = sigs;
  renderLookupNote(); renderBriefUndo();
  if (focusId){ const f = document.getElementById(focusId); if (f){ f.focus(); const v = f.value || ''; try{ f.setSelectionRange(v.length, v.length); }catch(err){} } }
}
function renderSkuBox(){ renderLines(); }

/* imagens que não existem viram o ícone do tipo */
document.addEventListener('error', ev => {
  const im = ev.target;
  if (!(im instanceof HTMLImageElement)) return;
  if (im.closest('.ln-thumb')){
    const box = im.closest('.ln-thumb');
    if (box.classList.contains('multi')) im.style.visibility = 'hidden';
    else box.innerHTML = `<span class="glyph">${im.dataset.glyph || '↗'}</span>`;
  } else if (im.classList.contains('ref')) im.remove();
  else if (im.closest('.sw-img')){ const box = im.closest('.sw-img'); box.textContent = im.dataset.file || ''; }
}, true);

function setBriefLines(lines){
  $('#brief').value = lines.join('\n');
  reparse(false); autoLookup();
}
function addLines(text){
  const add = text.replace(/\r/g,'').replace(/^\n+|\s+$/g,'');
  if (!add) return;
  const cur = $('#brief').value.replace(/\s+$/,'');
  $('#brief').value = cur ? cur + '\n' + add : add;
  $('#paste').value = '';
  reparse(false); autoLookup();
}
$('#paste').addEventListener('paste', () => setTimeout(() => addLines($('#paste').value), 0));
$('#paste').addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)){ ev.preventDefault(); addLines($('#paste').value); } });
$('#btn-add-lines').addEventListener('click', () => { addLines($('#paste').value); $('#paste').focus(); });
$('#btn-lookup').addEventListener('click', () => pingHelper().then(() => runLookups(lookupList().map(e => e.id), true)));
$('#btn-accept-all').addEventListener('click', () => { unanswered().forEach(e => { answers[e.q.id] = e.q.def; }); store.set('answers', answers); reparse(false); autoLookup(); });
function setView(v){
  $('#bv-lines').setAttribute('aria-pressed', String(v === 'lines')); $('#bv-text').setAttribute('aria-pressed', String(v === 'text'));
  $('#bv-lines-panel').hidden = v !== 'lines'; $('#bv-text-panel').hidden = v !== 'text';
  if (v === 'lines') renderLines();
}
$('#bv-lines').addEventListener('click', () => setView('lines'));
$('#bv-text').addEventListener('click', () => setView('text'));

$('#lines').addEventListener('click', ev => {
  const li = ev.target.closest('.ln'); if (!li) return;
  const ei = +li.dataset.e, e = entries[ei];
  const ans = ev.target.closest('[data-ans]');
  if (ans){
    const v = ans.dataset.ans;
    if (v === 'link'){ openLinkQ = e.q.id; renderLines(); const f = li.parentElement.querySelector(`[data-e="${ei}"] [data-qlink]`); f && f.focus(); return; }
    answers[e.q.id] = v; openLinkQ = null; store.set('answers', answers); reparse(false); autoLookup(); return;
  }
  if (ev.target.closest('[data-qlink-ok]')){ commitQLink(li, e); return; }
  if (ev.target.closest('[data-split]')){ answers[e.pairId] = 'split'; store.set('answers', answers); reparse(false); return; }
  if (ev.target.closest('[data-retry]')){ pingHelper().then(() => runLookups([lookupId(e.item)], true)); return; }
  if (ev.target.closest('[data-edit]')){ editingEntry = ei; renderLines(); const f = li.parentElement.querySelector(`[data-e="${ei}"] input[data-line]`); f && f.focus(); return; }
  if (ev.target.closest('[data-edit-cancel]')){ editingEntry = null; renderLines(); return; }
  if (ev.target.closest('[data-edit-ok]')){ commitEdit(li); return; }
  if (ev.target.closest('[data-del]')){
    const drop = new Set(e.lines);
    snapshotBrief(`Linha${e.lines.length > 1 ? 's' : ''} apagada${e.lines.length > 1 ? 's' : ''} do briefing.`);
    editingEntry = null;
    setBriefLines(briefLines.filter((_, i) => !drop.has(i)));
  }
});
function commitEdit(li){
  const lines = briefLines.slice();
  li.querySelectorAll('input[data-line]').forEach(inp => { lines[+inp.dataset.line] = inp.value; });
  editingEntry = null;
  setBriefLines(lines);
}
function commitQLink(li, e){
  const v = (li.querySelector('[data-qlink]').value || '').trim();
  if (!/^https?:\/\//.test(v)){ li.querySelector('[data-qlink]').focus(); return; }
  answers[e.q.id] = 'link:' + v; openLinkQ = null; store.set('answers', answers); reparse(false); autoLookup();
}
$('#lines').addEventListener('keydown', ev => {
  const li = ev.target.closest('.ln'); if (!li) return;
  if (ev.key === 'Enter' && ev.target.matches('input[data-line]')){ ev.preventDefault(); commitEdit(li); }
  if (ev.key === 'Escape' && ev.target.matches('input[data-line]')){ editingEntry = null; renderLines(); }
  if (ev.key === 'Enter' && ev.target.matches('[data-qlink]')){ ev.preventDefault(); commitQLink(li, entries[+li.dataset.e]); }
});
let manT;
$('#lines').addEventListener('input', ev => {
  const lk = ev.target.dataset.ltitle;
  if (lk){
    const m = manual[lk] = manual[lk] || {};
    m.title = ev.target.value;
    store.set('manual', manual);
    clearTimeout(manT); manT = setTimeout(() => { renderAll(); }, 300);
    return;
  }
  const f = ev.target.dataset.f, id = ev.target.dataset.mid; if (!f || !id) return;
  const val = id.slice(4), isSku = id.startsWith('sku:');
  const bag = isSku ? skuCache : pageCache;
  const c = bag[val] = Object.assign({}, bag[val], {status: 'manual'});
  c[f] = ev.target.value.trim();
  if (f === 'url' && c.url && !/^https?:\/\//.test(c.url)) c.url = '';
  if (!c.url && !c.title) delete bag[val];
  store.set(isSku ? 'skus' : 'pages', bag);
  clearTimeout(manT); manT = setTimeout(refreshItems, 300);
});
/* desfazer apagar linha */
let briefUndo = null;
function snapshotBrief(msg){ briefUndo = {brief: $('#brief').value, msg}; }
function renderBriefUndo(){
  const el = $('#brief-undo');
  el.innerHTML = briefUndo ? `<div class="undo" role="status"><span>${esc(briefUndo.msg)}</span><button type="button" data-bundo>Desfazer</button><button type="button" class="ghost" data-bundo-x aria-label="Fechar aviso">×</button></div>` : '';
}
$('#brief-undo').addEventListener('click', ev => {
  if (ev.target.closest('[data-bundo]')){ const b = briefUndo.brief; briefUndo = null; $('#brief').value = b; reparse(false); autoLookup(); return; }
  if (ev.target.closest('[data-bundo-x]')){ briefUndo = null; renderBriefUndo(); }
});

/* ---------- etapas ---------- */
const STEPS = [...document.querySelectorAll('.step')];
const NEXT_LABEL = {1:'Continuar →', 2:'Continuar →', 3:'Montar a news →', 4:'Ver prévia →', 5:'Gerar código →', 6:'Baixar HTML ↓'};
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let step = 1, maxStep = Math.max(1, Math.min(6, store.get('maxStep', 1))), moving = false;
function gate(n){
  if (n === 1){
    if (!cfg.date) return 'Escolha a data de envio.';
    if (!cfg.seg.trim() && !cfg.camp.trim()) return 'Preencha o segmento ou a utm_campaign.';
  }
  if (n === 2){
    if (!imgBase()) return 'Preencha a pasta das imagens.';
    if (!cfg.desc.trim()) return 'Preencha o link da imagem de descrição.';
  }
  if (n === 3){
    if (!Object.keys(items).length) return 'Cole o briefing com pelo menos um banner.';
    const pq = unanswered().length;
    if (pq) return `Confirme ${pq} ${pq > 1 ? 'linhas marcadas' : 'linha marcada'} ou clique em “Aceitar sugestões”.`;
    if ([...busy].some(id => id.startsWith('sku:'))) return 'Aguarde a busca dos SKUs terminar.';
  }
  if (n === 4){ if (!order().length) return 'A montagem está vazia. Restaure ou adicione banners.'; }
  return '';
}
function msg(t, err){ const m = $('#nav-msg'); m.textContent = t || ''; m.className = 'nav-msg' + (err ? ' err' : ''); if (err){ void m.offsetWidth; } }
function renderStepper(){
  $('#steps').innerHTML = STEPS.map((sec, i) => {
    const n = i + 1, cls = n === step ? 'current' : n < step || n <= maxStep ? (n < step ? 'done' : '') : 'locked';
    return `<li class="${cls}"><button type="button" class="st-btn" data-go="${n}" ${cls === 'locked' ? 'disabled' : ''} aria-label="Etapa ${n}: ${sec.dataset.title}" ${n === step ? 'aria-current="step"' : ''}>${n < step ? '✓' : n}</button><span class="st-label">${sec.dataset.title}</span></li>`;
  }).join('');
  $('#track-fill').style.width = ((step - 1) / (STEPS.length - 1) * 100) + '%';
  $('#btn-back').classList.toggle('hide', step === 1);
  $('#btn-next').textContent = NEXT_LABEL[step];
}
function onEnter(n){
  if (n === 3){ pingHelper().then(() => { renderSkuBox(); autoLookup(); }); }
  if (n === 4) renderRows();
  if (n === 5){ renderChecks(); renderPreview(); }
  if (n === 6) renderCode();
}
function go(n){
  if (moving || n === step || n < 1 || n > STEPS.length) return;
  if (n > step){
    for (let k = step; k < n; k++){ const e = gate(k); if (e){ if (k !== step) go(k); msg(e, true); return; } }
  }
  msg('');
  const fwd = n > step, cur = STEPS[step-1], nxt = STEPS[n-1];
  const swap = () => {
    cur.hidden = true; cur.classList.remove('leave-fwd','leave-back','enter-fwd','enter-back');
    nxt.querySelectorAll('.fx').forEach((el, i) => el.style.setProperty('--i', i + 1));
    nxt.hidden = false; nxt.classList.add(fwd ? 'enter-fwd' : 'enter-back');
    const wide = nxt.classList.contains('wide');
    $('#stage').classList.toggle('is-wide', wide); $('#wiz-nav').classList.toggle('is-wide', wide);
    setTimeout(() => nxt.classList.remove('enter-fwd','enter-back'), 2600);
    moving = false; onEnter(n);
    const top = $('#steps').getBoundingClientRect().top + window.scrollY - 16;
    if (window.scrollY > top) window.scrollTo({top, behavior: reduced() ? 'auto' : 'smooth'});
  };
  moving = true;
  step = n; maxStep = Math.max(maxStep, n); store.set('maxStep', maxStep); renderStepper();
  if (reduced()) swap(); else { cur.classList.add(fwd ? 'leave-fwd' : 'leave-back'); setTimeout(swap, 440); }
}
$('#steps').addEventListener('click', ev => { const b = ev.target.closest('[data-go]'); if (b && !b.disabled) go(+b.dataset.go); });
$('#btn-back').addEventListener('click', () => go(step - 1));
$('#btn-next').addEventListener('click', () => {
  if (step === STEPS.length){ downloadHtml(); return; }
  go(step + 1);
});
document.addEventListener('input', () => { if ($('#nav-msg').classList.contains('err')) msg(''); });

if (!window.Sortable){ window.Sortable = { create: () => ({ destroy(){} }) }; }
$('#brief').value = store.get('brief', null) ?? '';
reparse(false);
renderStepper();
STEPS[0].querySelectorAll('.fx').forEach((el, i) => el.style.setProperty('--i', i + 2));
STEPS[0].classList.add('enter-fwd'); setTimeout(() => STEPS[0].classList.remove('enter-fwd'), 2600);
pingHelper().then(() => { renderSkuBox(); autoLookup(); });
probe(CANARY); setTimeout(renderBlockedNotes, 2500); setTimeout(renderBlockedNotes, 9000);
