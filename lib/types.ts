export type ContentType = 'youtube' | 'image' | 'video' | 'webpage';

export interface MediaItem {
  id: string;
  title: string;
  type: ContentType;
  // YouTube
  youtubeUrl?: string;
  youtubeId?: string;
  // Image / Video / Webpage
  contentUrl?: string;
  // Common
  duration: number; // seconds
  order: number;
  active: boolean;
  scheduledStart?: string;
  scheduledEnd?: string;
  addedAt: string;
  thumbnail?: string;
  // Playlist group
  playlistId?: string;
}

// Legacy alias so old code doesn't break
export type VideoItem = MediaItem;

export interface Playlist {
  id: string;
  name: string;
  color: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface EmergencyAlert {
  id: string;
  title: string;
  message: string;
  bgColor: string;
  textColor: string;
  active: boolean;
  createdAt: string;
  expiresAt?: string;
}

export interface DisplayState {
  currentIndex: number;
  isPlaying: boolean;
  lastUpdated: string;
  emergency?: EmergencyAlert | null;
}

export interface AnalyticsEntry {
  date: string;       // YYYY-MM-DD
  itemId: string;
  title: string;
  plays: number;
  totalSeconds: number;
}
