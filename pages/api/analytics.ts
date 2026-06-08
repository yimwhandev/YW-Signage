import type { NextApiRequest, NextApiResponse } from 'next';
import { getAnalytics, logPlay } from '@/lib/sheets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // TV logs plays — no auth needed, just logs
    const { itemId, title, seconds } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId required' });
    await logPlay(itemId, title || '', seconds || 0);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const days = parseInt(String(req.query.days)) || 7;
    const data = await getAnalytics(days);
    return res.status(200).json(data);
  }

  res.status(405).end();
}
