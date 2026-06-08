import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { VideoItem } from '@/lib/types';
import { fetchVideosFromCSV, isVideoScheduledNow } from '@/lib/clientUtils';
import { getYouTubeEmbedUrl } from '@/lib/youtube';

const POLL_INTERVAL = 30_000; // 30s refresh playlist

export default function DisplayPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playlistRef = useRef<VideoItem[]>([]);

  const getActiveVideos = (all: VideoItem[]) =>
    all.filter(v => v.active && isVideoScheduledNow(v));

  const loadPlaylist = useCallback(async () => {
    const all = await fetchVideosFromCSV();
    const active = getActiveVideos(all);
    playlistRef.current = active;
    setVideos(active);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPlaylist();
    const pollInterval = setInterval(loadPlaylist, POLL_INTERVAL);
    return () => clearInterval(pollInterval);
  }, [loadPlaylist]);

  const goNext = useCallback(() => {
    setTransitioning(true);
    setTimeout(() => {
      setCurrentIdx(prev => {
        const next = (prev + 1) % (playlistRef.current.length || 1);
        // Persist state for admin to read
        try {
          localStorage.setItem('display_state', JSON.stringify({
            currentIndex: next,
            lastUpdated: new Date().toISOString(),
          }));
        } catch {}
        return next;
      });
      setTransitioning(false);
    }, 600);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (videos.length === 0) return;
    const current = videos[currentIdx];
    if (!current) return;

    setCountdown(current.duration);

    if (countdownRef.current) clearInterval(countdownRef.current);

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          goNext();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [currentIdx, videos, goNext]);

  const current = videos[currentIdx];
  const progressPct = current ? ((current.duration - countdown) / current.duration) * 100 : 0;

  if (loading) return (
    <div style={displayStyles.loadingScreen}>
      <div style={displayStyles.loadingDot} />
      <p style={displayStyles.loadingText}>กำลังโหลด...</p>
    </div>
  );

  if (videos.length === 0) return (
    <div style={displayStyles.emptyScreen}>
      <div style={{ fontSize: 80, marginBottom: 24 }}>📺</div>
      <h2 style={displayStyles.emptyTitle}>ยังไม่มีวิดีโอในคิว</h2>
      <p style={displayStyles.emptySub}>รอรับคำสั่งจาก Admin...</p>
    </div>
  );

  return (
    <div style={displayStyles.screen}>
      <Head>
        <title>Digital Signage — Display</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          @keyframes countPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
          body { margin: 0; overflow: hidden; background: #000; }
        `}</style>
      </Head>

      {/* Video iframe */}
      <div style={{
        ...displayStyles.videoWrap,
        opacity: transitioning ? 0 : 1,
        transition: 'opacity 0.6s ease',
      }}>
        {current && (
          <iframe
            key={current.id}
            src={getYouTubeEmbedUrl(current.youtubeId, true)}
            style={displayStyles.iframe}
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        )}
      </div>

      {/* Overlay UI */}
      <div style={displayStyles.overlay}>
        {/* Progress bar at top */}
        <div style={displayStyles.progressBar}>
          <div style={{ ...displayStyles.progressFill, width: `${progressPct}%` }} />
        </div>

        {/* Bottom HUD */}
        <div style={displayStyles.hud}>
          {/* Queue indicators */}
          <div style={displayStyles.queueDots}>
            {videos.map((_, i) => (
              <div key={i} style={{
                ...displayStyles.dot,
                background: i === currentIdx ? '#fff' : 'rgba(255,255,255,0.25)',
                transform: i === currentIdx ? 'scale(1.3)' : 'scale(1)',
              }} />
            ))}
          </div>

          {/* Title */}
          <div style={displayStyles.nowPlaying}>
            <span style={displayStyles.nowLabel}>▶ NOW PLAYING</span>
            <span style={displayStyles.nowTitle}>{current?.title}</span>
          </div>

          {/* Countdown */}
          <div style={displayStyles.countdownWrap}>
            <svg style={displayStyles.countdownSvg} viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
              <circle
                cx="28" cy="28" r="24" fill="none" stroke="#fff" strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 24}`}
                strokeDashoffset={`${2 * Math.PI * 24 * (1 - progressPct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div style={displayStyles.countdownNum}>{countdown}</div>
          </div>
        </div>

        {/* Next video preview */}
        {videos.length > 1 && (
          <div style={displayStyles.nextCard}>
            <div style={displayStyles.nextLabel}>NEXT</div>
            <div style={displayStyles.nextTitle}>
              {videos[(currentIdx + 1) % videos.length]?.title}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const displayStyles: Record<string, React.CSSProperties> = {
  screen: { position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' },

  loadingScreen: {
    position: 'fixed', inset: 0, background: '#000', display: 'flex',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
  },
  loadingDot: {
    width: 48, height: 48, borderRadius: '50%',
    border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#fff',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, letterSpacing: 2 },

  emptyScreen: {
    position: 'fixed', inset: 0, background: '#0a0a0f',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { color: '#fff', fontSize: 28, fontWeight: 300, marginBottom: 8 },
  emptySub: { color: 'rgba(255,255,255,0.4)', fontSize: 16 },

  videoWrap: { position: 'absolute', inset: '-5%', zIndex: 1 },
  iframe: { width: '110%', height: '110%', border: 'none', pointerEvents: 'none' },

  overlay: {
    position: 'absolute', inset: 0, zIndex: 2,
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    pointerEvents: 'none',
  },

  progressBar: { height: 3, background: 'rgba(255,255,255,0.1)', flexShrink: 0 },
  progressFill: {
    height: '100%', background: 'linear-gradient(90deg, #6c63ff, #ff6584)',
    transition: 'width 1s linear', borderRadius: '0 2px 2px 0',
  },

  hud: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    padding: '0 32px 28px',
    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
  },

  queueDots: { display: 'flex', gap: 8, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: '50%', transition: 'all 0.3s' },

  nowPlaying: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, padding: '0 32px' },
  nowLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,0.5)', fontFamily: 'Space Mono, monospace' },
  nowTitle: { fontSize: 22, fontWeight: 600, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.8)' },

  countdownWrap: { position: 'relative', flexShrink: 0 },
  countdownSvg: { width: 56, height: 56 },
  countdownNum: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'Space Mono, monospace',
  },

  nextCard: {
    position: 'absolute', top: 24, right: 24,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
    padding: '10px 16px', maxWidth: 240,
  },
  nextLabel: { fontSize: 9, letterSpacing: 3, color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 4 },
  nextTitle: { fontSize: 13, color: '#fff', lineHeight: 1.4 },
};
