import type { NextApiRequest, NextApiResponse } from 'next';
import { getPlaylists, addPlaylist } from '@/lib/sheets';
import { Playlist } from '@/lib/types';

function randomId() { return Math.random().toString(36).slice(2, 10); }
const COLORS = ['#6c63ff','#ff6584','#43e97b','#f7971e','#4facfe','#f093fb'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    return res.status(200).json(await getPlaylists());
  }

  if (req.method === 'POST') {
    const existing = await getPlaylists();
    const pl: Playlist = {
      id: randomId(),
      name: req.body.name || `Playlist ${existing.length + 1}`,
      color: req.body.color || COLORS[existing.length % COLORS.length],
      scheduledStart: req.body.scheduledStart,
      scheduledEnd: req.body.scheduledEnd,
    };
    await addPlaylist(pl);
    return res.status(201).json(pl);
  }

  res.status(405).end();
}
