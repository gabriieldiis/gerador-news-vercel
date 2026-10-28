# Gerador de News Kalunga

Ferramenta web que transforma o briefing da news no HTML de e-mail marketing:
links com UTM, `utm_term` automático, imagens numeradas, montagem por arrastar,
prévia, conferência e download do HTML.

Tudo em **JavaScript**: a página roda no navegador e o buscador roda como
funções da Vercel (`/api`), no mesmo endereço do site.

## Como o briefing é lido

Cole do jeito que chegou. Cada linha vira um cartão com o tipo reconhecido:

- `441188` → produto: busca o link da página do produto, o nome (H1, sem o “– CX 1 UN”) e a foto.
- `Título - https://…` → busca, hotsite, categoria ou marca, pelo endereço.
- `https://…` sozinho → o título vem do nome da página.
- `Título - 303589-599786-…` → lista de produtos, vira uma busca com todos os códigos.
- Título numa linha e link na de baixo → um banner só.
- Em caso de dúvida (palavra sem link, SKU logo depois de uma lista), o gerador pergunta.

Sem linhas em branco no briefing, a montagem segue o padrão 1 · 2 · 2 · 1 · 2 · 2 · 1.

## Estrutura

```
gerador-news/
├── index.html              o gerador (página, estilos e lógica)
├── static/Sortable.min.js  biblioteca de arrastar (1.15.2)
├── api/
│   ├── _kalunga.js         consulta ao site da Kalunga (SKU e links), com cache
│   ├── ping.js             GET /api/ping
│   ├── pagina.js           GET /api/pagina?url=https://www.kalunga.com.br/...
│   └── sku/[sku].js        GET /api/sku/441188
├── server.js               servidor local, sem instalar pacotes (node server.js)
├── Iniciar gerador.bat     atalho do servidor local no Windows
├── tests/                  testes sem internet (npm test)
├── vercel.json             tempo máximo das funções e cache
├── .vercelignore           o que não sobe para a Vercel (testes e servidor local)
└── package.json            sem dependências
```

## Publicar na Vercel

A pasta `api/` vira funções da Vercel automaticamente: não precisa configurar servidor.

### Primeira vez (pelo Git)

```bash
git init
git add .
git commit -m "Gerador de News Kalunga"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/gerador-news-vercel.git
git push -u origin main
```

Depois, na Vercel:

1. **Add New… > Project** e importe o repositório.
2. Em **Framework Preset**, deixe **Other**. Não precisa de comando de build.
3. Clique em **Deploy**.

A cada `git push` na branch `main`, a Vercel publica a versão nova sozinha.
Em outras branches, ela cria um endereço de teste (preview) sem mexer no site oficial.

Pela linha de comando também funciona: `npx vercel` e depois `npx vercel --prod`.

### Depois do deploy, confira

- `https://SEU-PROJETO.vercel.app/api/ping` responde `{"ok":true}`.
- `https://SEU-PROJETO.vercel.app/api/sku/441188` responde com `url` e `title`.

Se o SKU voltar com "o site respondeu 403", o site da Kalunga está bloqueando os
servidores da Vercel. Nesse caso, peça ao time de desenvolvimento para liberar o
acesso, ou rode o gerador pelo servidor local (abaixo), que usa a sua conexão.

As respostas do buscador ficam guardadas por 6 horas na CDN da Vercel, então o
mesmo SKU não é consultado de novo a cada news.

## Rodar no computador

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo (na Vercel roda no Node 22). Não instala nenhum pacote.

1. Dê dois cliques em **Iniciar gerador.bat** (ou rode `node server.js`).
2. O navegador abre em `http://localhost:5055` com o buscador ligado.
3. Deixe a janela aberta enquanto usa.

## Testes

```bash
npm test
```

## Segurança

- O buscador só aceita endereços de `kalunga.com.br`.
- O site publicado fica aberto para quem tiver o link. Para restringir, use a
  proteção por senha da Vercel (Deployment Protection) ou publique na rede interna.
