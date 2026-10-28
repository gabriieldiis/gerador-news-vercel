import { cabecalhos } from './_kalunga.js';

export default function handler(req, res) {
  cabecalhos(res, false);
  res.status(200).json({ ok: true });
}
