import type { NextApiRequest, NextApiResponse } from 'next';
import { getMediaFromSheet, addMediaToSheet, reorderMediaSheet } from '@/lib/sheets';
import { extractYouTubeId, detectContentType } from '@/lib/youtube';
import { MediaItem } from '@/lib/types';

function randomId() { return Math.random().toString(36).slice(2, 10); }

function checkAuth(req: NextApiRequest) {
  return req.headers['x-admin-password'] === process.env.ADMIN_PASSWORD;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!checkAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const items = await getMediaFromSheet();
    return res.status(200).json(items);
  }

  if (req.method === 'POST') {
    const { title, youtubeUrl, contentUrl, duration, scheduledStart, scheduledEnd, playlistId } = req.body;

    const rawUrl = youtubeUrl || contentUrl || '';
    const type = detectContentType(rawUrl);
    const youtubeId = type === 'youtube' ? extractYouTubeId(rawUrl) : undefined;

    if (type === 'youtube' && !youtubeId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const existing = await getMediaFromSheet();
    const newItem: MediaItem = {
      id: randomId(),
      title: title || `Content ${existing.length + 1}`,
      type,
      youtubeUrl: type === 'youtube' ? rawUrl : undefined,
      youtubeId: youtubeId || undefined,
      contentUrl: type !== 'youtube' ? rawUrl : undefined,
      duration: duration || 60,
      order: existing.length + 1,
      active: true,
      scheduledStart: scheduledStart || undefined,
      scheduledEnd: scheduledEnd || undefined,
      addedAt: new Date().toISOString(),
      playlistId: playlistId || undefined,
    };

    await addMediaToSheet(newItem);
    return res.status(201).json(newItem);
  }

  if (req.method === 'PUT') {
    const { videos } = req.body as { videos: MediaItem[] };
    await reorderMediaSheet(videos);
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
