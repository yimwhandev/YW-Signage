import type { NextApiRequest, NextApiResponse } from 'next';
import { getMediaFromSheet, updateMediaRow, deleteMediaRow } from '@/lib/sheets';
import { MediaItem } from '@/lib/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  const items = await getMediaFromSheet();
  const idx = items.findIndex(v => v.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const rowIndex = idx + 2;

  if (req.method === 'PATCH') {
    const updated: MediaItem = { ...items[idx], ...req.body };
    await updateMediaRow(updated, rowIndex);
    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    await deleteMediaRow(rowIndex);
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
