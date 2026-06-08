import Papa from 'papaparse';
import { MediaItem, EmergencyAlert } from './types';

export async function fetchVideosFromCSV(): Promise<MediaItem[]> {
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
          const items: MediaItem[] = rows
            .filter(r => r.id && r.active === 'TRUE')
            .map(r => ({
              id: r.id,
              title: r.title || '',
              type: (r.type as MediaItem['type']) || 'youtube',
              youtubeUrl: r.youtubeUrl || undefined,
              youtubeId: r.youtubeId || undefined,
              contentUrl: r.contentUrl || undefined,
              duration: parseInt(r.duration) || 60,
              order: parseInt(r.order) || 0,
              active: r.active === 'TRUE',
              scheduledStart: r.scheduledStart || undefined,
              scheduledEnd: r.scheduledEnd || undefined,
              addedAt: r.addedAt || '',
              playlistId: r.playlistId || undefined,
            }))
            .sort((a, b) => a.order - b.order);
          resolve(items);
        },
        error: () => resolve([]),
      });
    });
  } catch { return []; }
}

export async function fetchEmergencyFromAPI(): Promise<EmergencyAlert | null> {
  try {
    const res = await fetch('/api/emergency', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export function isVideoScheduledNow(item: MediaItem): boolean {
  if (!item.scheduledStart && !item.scheduledEnd) return true;
  const now = new Date();
  if (item.scheduledStart && new Date(item.scheduledStart) > now) return false;
  if (item.scheduledEnd && new Date(item.scheduledEnd) < now) return false;
  return true;
}
