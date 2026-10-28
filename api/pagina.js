import { porLink, linkPermitido, cabecalhos } from './_kalunga.js';

export default async function handler(req, res) {
  const url = String(req.query.url || '').trim();
  if (!linkPermitido(url)) { cabecalhos(res, false); return res.status(400).json({ error: 'só links do site kalunga.com.br' }); }
  const r = await porLink(url);
  cabecalhos(res, !!r.ok);
  res.status(200).json(r);
}
