import type { NextApiRequest, NextApiResponse } from 'next';
import { getScreens, addScreen } from '@/lib/sheets';
import { getSession, can } from '@/lib/auth';
import { Screen } from '@/lib/types';

function randomId() { return Math.random().toString(36).slice(2, 10); }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    return res.status(200).json(await getScreens());
  }

  if (req.method === 'POST') {
    if (!can(session.role, 'admin')) return res.status(403).json({ error: 'Forbidden' });
    const { name, location, playlistId } = req.body;
    const screen: Screen = {
      id: `screen-${randomId()}`,
      name: name || 'จอใหม่',
      location: location || '',
      playlistId: playlistId || '',
      active: true,
      createdAt: new Date().toISOString(),
    };
    await addScreen(screen);
    return res.status(201).json(screen);
  }

  res.status(405).end();
}
