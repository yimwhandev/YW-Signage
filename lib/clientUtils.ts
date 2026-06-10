import Papa from 'papaparse';
import { MediaItem, EmergencyAlert } from './types';

interface CacheManifest { version: string; cachedAt: string; items: MediaItem[]; }

const CACHE_KEY = 'ds_offline_cache';
const CACHE_VERSION = '2';

// ─── CSV fetch ───────────────────────────────────────────────
export async function fetchVideosFromCSV(): Promise<MediaItem[]> {
  const csvUrl = process.env.NEXT_PUBLIC_SHEET_CSV_URL;
  if (!csvUrl) return [];
  try {
    const res = await fetch(`${csvUrl}&t=${Date.now()}`, { cache: 'no-store' });
    const text = await res.text();
    return new Promise((resolve) => {
      Papa.parse(text, {
        header: true, skipEmptyLines: true,
        complete: (result) => {
          const rows = result.data as Record<string, string>[];
          resolve(rows.filter(r => r.id && r.active === 'TRUE').map(r => ({
            id: r.id, title: r.title || '', type: (r.type as MediaItem['type']) || 'youtube',
            youtubeUrl: r.youtubeUrl || undefined, youtubeId: r.youtubeId || undefined,
            contentUrl: r.contentUrl || undefined, duration: parseInt(r.duration) || 60,
            order: parseInt(r.order) || 0, active: r.active === 'TRUE',
            scheduledStart: r.scheduledStart || undefined, scheduledEnd: r.scheduledEnd || undefined,
            addedAt: r.addedAt || '', playlistId: r.playlistId || undefined,
            screenIds: r.screenIds || 'all',
          })).sort((a, b) => a.order - b.order));
        },
        error: () => resolve([]),
      });
    });
  } catch { return []; }
}

// ─── Heartbeat (Multi-screen) ────────────────────────────────
export async function heartbeat(screenId: string, currentItemId?: string): Promise<{ items: MediaItem[]; emergency: EmergencyAlert | null } | null> {
  try {
    const res = await fetch('/api/screens/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screenId, currentItemId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Update offline cache on success
    saveOfflineCache(data.items);
    return data;
  } catch { return null; }
}

// ─── Offline Cache ───────────────────────────────────────────
export function saveOfflineCache(items: MediaItem[]) {
  try {
    const manifest: CacheManifest = {
      version: CACHE_VERSION,
      cachedAt: new Date().toISOString(),
      items,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(manifest));
  } catch {}
}

export function loadOfflineCache(): MediaItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const manifest: CacheManifest = JSON.parse(raw);
    if (manifest.version !== CACHE_VERSION) return null;
    return manifest.items;
  } catch { return null; }
}

export function getCacheAge(): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const manifest: CacheManifest = JSON.parse(raw);
    const ageMs = Date.now() - new Date(manifest.cachedAt).getTime();
    const mins = Math.floor(ageMs / 60000);
    return mins < 60 ? `${mins} นาทีที่แล้ว` : `${Math.floor(mins / 60)} ชม.ที่แล้ว`;
  } catch { return null; }
}

// ─── Schedule check ──────────────────────────────────────────
export function isVideoScheduledNow(item: MediaItem): boolean {
  if (!item.scheduledStart && !item.scheduledEnd) return true;
  const now = new Date();
  if (item.scheduledStart && new Date(item.scheduledStart) > now) return false;
  if (item.scheduledEnd && new Date(item.scheduledEnd) < now) return false;
  return true;
}
