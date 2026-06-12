export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// muted=true  → autoplay works immediately (browser policy requires mute for autoplay)
// muted=false → plays with sound (requires prior user interaction on the page)
export function getYouTubeEmbedUrl(videoId: string, autoplay = true, muted = true): string {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    mute: muted ? '1' : '0',
    controls: '0',
    modestbranding: '1',
    rel: '0',
    showinfo: '0',
    fs: '0',
    disablekb: '1',
    iv_load_policy: '3',
    enablejsapi: '1',
    playsinline: '1',
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function detectContentType(url: string): 'youtube' | 'image' | 'video' | 'webpage' {
  if (!url) return 'webpage';
  if (extractYouTubeId(url)) return 'youtube';
  const lower = url.toLowerCase().split('?')[0];
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/.test(lower)) return 'image';
  if (/\.(mp4|webm|ogg|mov)$/.test(lower)) return 'video';
  return 'webpage';
}
