import type { NextApiRequest, NextApiResponse } from 'next';
import { getVideosFromSheet, addVideoToSheet, reorderSheet } from '@/lib/sheets';
import { extractYouTubeId } from '@/lib/youtube';
import { VideoItem } from '@/lib/types';


function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Simple auth check
  const auth = req.headers['x-admin-password'];
  if (auth !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    const videos = await getVideosFromSheet();
    return res.status(200).json(videos);
  }

  if (req.method === 'POST') {
    const { title, youtubeUrl, duration, scheduledStart, scheduledEnd } = req.body;
    const youtubeId = extractYouTubeId(youtubeUrl);
    if (!youtubeId) return res.status(400).json({ error: 'Invalid YouTube URL' });

    const existing = await getVideosFromSheet();
    const newVideo: VideoItem = {
      id: randomId(),
      title: title || `Video ${existing.length + 1}`,
      youtubeUrl,
      youtubeId,
      duration: duration || 60,
      order: existing.length + 1,
      active: true,
      scheduledStart,
      scheduledEnd,
      addedAt: new Date().toISOString(),
    };

    await addVideoToSheet(newVideo);
    return res.status(201).json(newVideo);
  }

  if (req.method === 'PUT') {
    // Reorder
    const { videos } = req.body as { videos: VideoItem[] };
    await reorderSheet(videos);
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
