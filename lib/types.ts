// ─── Content ──────────────────────────────────────────────────
export type ContentType = 'youtube' | 'image' | 'video' | 'webpage';

export interface MediaItem {
  id: string;
  title: string;
  type: ContentType;
  youtubeUrl?: string;
  youtubeId?: string;
  contentUrl?: string;
  duration: number;
  order: number;
  active: boolean;
  scheduledStart?: string;
  scheduledEnd?: string;
  addedAt: string;
  playlistId?: string;
}
export type VideoItem = MediaItem;

// ─── Playlist ─────────────────────────────────────────────────
export interface Playlist {
  id: string;
  name: string;
  color: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

// ─── Screen ───────────────────────────────────────────────────
export interface Screen {
  id: string;
  name: string;
  location: string;
  playlistId: string;
  active: boolean;
  createdAt: string;
  lastSeen?: string;
  currentIndex?: number;
  currentTitle?: string;
}

// ─── User / Auth ──────────────────────────────────────────────
export type UserRole = 'superadmin' | 'editor' | 'viewer';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  lastLogin?: string;
}

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
}

// ─── Emergency ────────────────────────────────────────────────
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

// ─── Analytics ────────────────────────────────────────────────
export interface AnalyticsEntry {
  date: string;
  itemId: string;
  title: string;
  plays: number;
  totalSeconds: number;
  screenId?: string;
}

// ─── Display State ────────────────────────────────────────────
export interface DisplayState {
  currentIndex: number;
  isPlaying: boolean;
  lastUpdated: string;
  screenId?: string;
}
