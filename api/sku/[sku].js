import { porSku, cabecalhos } from '../_kalunga.js';

export default async function handler(req, res) {
  const sku = String(req.query.sku || '');
  if (!/^\d{6}$/.test(sku)) { cabecalhos(res, false); return res.status(400).json({ error: 'SKU precisa ter 6 dígitos' }); }
  const r = await porSku(sku);
  cabecalhos(res, !!r.url);
  res.status(200).json(r);
}
