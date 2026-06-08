import type { NextApiRequest, NextApiResponse } from 'next';
import { getVideosFromSheet } from '@/lib/sheets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  
  try {
    const videos = await getVideosFromSheet();
    const active = videos.filter(v => v.active);
    
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(active);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch' });
  }
}
