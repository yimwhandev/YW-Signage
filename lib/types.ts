export interface VideoItem {
  id: string;
  title: string;
  youtubeUrl: string;
  youtubeId: string;
  duration: number; // seconds
  order: number;
  active: boolean;
  scheduledStart?: string;
  scheduledEnd?: string;
  addedAt: string;
  thumbnail?: string;
}

export interface DisplayState {
  currentIndex: number;
  isPlaying: boolean;
  lastUpdated: string;
}

export interface SheetRow {
  id: string;
  title: string;
  youtubeUrl: string;
  youtubeId: string;
  duration: string;
  order: string;
  active: string;
  scheduledStart: string;
  scheduledEnd: string;
  addedAt: string;
}
