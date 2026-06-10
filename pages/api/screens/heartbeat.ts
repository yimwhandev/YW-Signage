import type { NextApiRequest, NextApiResponse } from 'next';
import { updateScreenHeartbeat, getScreens, getMediaFromSheet, getPlaylists, getAllSettings } from '@/lib/sheets';
import { DEFAULTS } from '../settings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { screenId, currentIndex, currentTitle } = req.body;
  if (!screenId) return res.status(400).json({ error: 'screenId required' });

  const [, screens, allMedia, playlists, storedSettings] = await Promise.all([
    updateScreenHeartbeat(screenId, currentIndex ?? 0, currentTitle ?? ''),
    getScreens(),
    getMediaFromSheet(),
    getPlaylists(),
    getAllSettings(),
  ]);

  const screen = screens.find(s => s.id === screenId);
  if (!screen) return res.status(404).json({ error: 'Screen not found' });

  const items = screen.playlistId
    ? allMedia.filter(m => m.active && m.playlistId === screen.playlistId)
    : allMedia.filter(m => m.active);

  const settings = { ...DEFAULTS, ...storedSettings };

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ screen, items, settings });
}
