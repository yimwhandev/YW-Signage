import type { NextApiRequest, NextApiResponse } from 'next';
import { getVideosFromSheet, updateSheetRow, deleteSheetRow } from '@/lib/sheets';
import { VideoItem } from '@/lib/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = req.headers['x-admin-password'];
  if (auth !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;

  // Get all rows to find row index
  const sheets = await import('@/lib/sheets');
  const videos = await sheets.getVideosFromSheet();
  const idx = videos.findIndex(v => v.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const rowIndex = idx + 2; // +1 for header, +1 for 1-based

  if (req.method === 'PATCH') {
    const updated: VideoItem = { ...videos[idx], ...req.body };
    await updateSheetRow(updated, rowIndex);
    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    await deleteSheetRow(rowIndex);
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
