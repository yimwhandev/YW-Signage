import Papa from 'papaparse';
import { VideoItem } from './types';

export async function fetchVideosFromCSV(): Promise<VideoItem[]> {
  const csvUrl = process.env.NEXT_PUBLIC_SHEET_CSV_URL;
  if (!csvUrl) return [];

  try {
    const res = await fetch(`${csvUrl}&t=${Date.now()}`, { cache: 'no-store' });
    const text = await res.text();

    return new Promise((resolve) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const rows = result.data as Record<string, string>[];
          const videos: VideoItem[] = rows
            .filter(r => r.id && r.active === 'TRUE')
            .map(r => ({
              id: r.id,
              title: r.title || '',
              youtubeUrl: r.youtubeUrl || '',
              youtubeId: r.youtubeId || '',
              duration: parseInt(r.duration) || 60,
              order: parseInt(r.order) || 0,
              active: r.active === 'TRUE',
              scheduledStart: r.scheduledStart || undefined,
              scheduledEnd: r.scheduledEnd || undefined,
              addedAt: r.addedAt || '',
            }))
            .sort((a, b) => a.order - b.order);
          resolve(videos);
        },
        error: () => resolve([]),
      });
    });
  } catch {
    return [];
  }
}

export function isVideoScheduledNow(video: VideoItem): boolean {
  if (!video.scheduledStart && !video.scheduledEnd) return true;
  const now = new Date();
  if (video.scheduledStart && new Date(video.scheduledStart) > now) return false;
  if (video.scheduledEnd && new Date(video.scheduledEnd) < now) return false;
  return true;
}
