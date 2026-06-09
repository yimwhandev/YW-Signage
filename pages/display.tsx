import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { MediaItem, EmergencyAlert } from '@/lib/types';
import { fetchVideosFromCSV, isVideoScheduledNow } from '@/lib/clientUtils';
import { getYouTubeEmbedUrl } from '@/lib/youtube';

const POLL_INTERVAL = 30_000;
const EMERGENCY_POLL = 15_000;

function getActive(all: MediaItem[]) {
  return all.filter(v => v.active && isVideoScheduledNow(v));
}

export default function DisplayPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [emergency, setEmergency] = useState<EmergencyAlert | null>(null);
  const [emVisible, setEmVisible] = useState(false);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playlistRef = useRef<MediaItem[]>([]);
  const playStartRef = useRef<number>(Date.now());

  const loadPlaylist = useCallback(async () => {
    const all = await fetchVideosFromCSV();
    const active = getActive(all);
    playlistRef.current = active;
    setItems(active);
    setLoading(false);
  }, []);

  const loadEmergency = useCallback(async () => {
    try {
      const r = await fetch('/api/emergency', { cache: 'no-store' });
      if (r.ok) {
        const data: EmergencyAlert | null = await r.json();
        setEmergency(data);
        if (data) {
          setEmVisible(false);
          setTimeout(() => setEmVisible(true), 100);
        } else {
          setEmVisible(false);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadPlaylist();
    loadEmergency();
    const p1 = setInterval(loadPlaylist, POLL_INTERVAL);
    const p2 = setInterval(loadEmergency, EMERGENCY_POLL);
    return () => { clearInterval(p1); clearInterval(p2); };
  }, [loadPlaylist, loadEmergency]);

  const logPlay = useCallback((item: MediaItem, seconds: number) => {
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, title: item.title, seconds }),
    }).catch(() => {});
  }, []);

  const goNext = useCallback(() => {
    const playlist = playlistRef.current;
    const curr = playlist[currentIdx];
    if (curr) logPlay(curr, Math.round((Date.now() - playStartRef.current) / 1000));

    setTransitioning(true);
    setTimeout(() => {
      setCurrentIdx(prev => {
        const next = (prev + 1) % (playlist.length || 1);
        try {
          localStorage.setItem('display_state', JSON.stringify({ currentIndex: next, lastUpdated: new Date().toISOString() }));
        } catch {}
        playStartRef.current = Date.now();
        return next;
      });
      setTransitioning(false);
    }, 600);
  }, [currentIdx, logPlay]);

  useEffect(() => {
    if (items.length === 0) return;
    const current = items[currentIdx];
    if (!current) return;
    setCountdown(current.duration);
    playStartRef.current = Date.now();

    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { goNext(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [currentIdx, items, goNext]);

  const current = items[currentIdx];
  const progressPct = current ? ((current.duration - countdown) / current.duration) * 100 : 0;

  if (loading) return (
    <div style={DS.loadingScreen}>
      <div style={DS.spinner} />
      <p style={DS.loadingText}>กำลังโหลด...</p>
    </div>
  );

  if (items.length === 0) return (
    <div style={DS.emptyScreen}>
      <div style={{ fontSize: 80, marginBottom: 24 }}>📺</div>
      <h2 style={DS.emptyTitle}>ยังไม่มีคอนเทนต์ในคิว</h2>
      <p style={DS.emptySub}>รอรับคำสั่งจาก Admin...</p>
    </div>
  );

  return (
    <div style={DS.screen}>
      <Head>
        <title>Display — Yimwhan Digital Signage</title>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Space+Mono:wght@700&display=swap');
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes emIn { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes marquee { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
          body { margin: 0; overflow: hidden; background: #000; font-family: 'DM Sans', sans-serif; }
        `}</style>
      </Head>

      {/* ─── Media Content ─────────────────────────────── */}
      <div style={{ ...DS.mediaWrap, opacity: transitioning ? 0 : 1, transition: 'opacity 0.6s ease' }}>
        {current?.type === 'youtube' && current.youtubeId && (
          <iframe key={current.id} src={getYouTubeEmbedUrl(current.youtubeId, true)}
            style={DS.iframe} allow="autoplay; encrypted-media" allowFullScreen />
        )}
        {current?.type === 'image' && current.contentUrl && (
          <img key={current.id} src={current.contentUrl} style={DS.imgContent} alt={current.title} />
        )}
        {current?.type === 'video' && current.contentUrl && (
          <video key={current.id} src={current.contentUrl} style={DS.imgContent} autoPlay muted={false} onEnded={goNext} />
        )}
        {current?.type === 'webpage' && current.contentUrl && (
          <iframe key={current.id} src={current.contentUrl} style={{ ...DS.iframe, pointerEvents: 'none' }} />
        )}
      </div>

      {/* ─── Normal Overlay ─────────────────────────────── */}
      {!emergency && (
        <div style={DS.overlay}>
          <div style={DS.progressBar}>
            <div style={{ ...DS.progressFill, width: `${progressPct}%` }} />
          </div>

          <div style={DS.hud}>
            <div style={DS.dots}>
              {items.map((_, i) => (
                <div key={i} style={{ ...DS.dot, background: i === currentIdx ? '#fff' : 'rgba(255,255,255,0.25)', transform: i === currentIdx ? 'scale(1.4)' : 'scale(1)' }} />
              ))}
            </div>
            <div style={DS.nowPlaying}>
              <span style={DS.nowLabel}>▶ NOW PLAYING</span>
              <span style={DS.nowTitle}>{current?.title}</span>
            </div>
            <div style={DS.countWrap}>
              <svg viewBox="0 0 56 56" style={{ width: 56, height: 56 }}>
                <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle cx="28" cy="28" r="24" fill="none" stroke="#fff" strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 24}`}
                  strokeDashoffset={`${2 * Math.PI * 24 * (1 - progressPct / 100)}`}
                  strokeLinecap="round" transform="rotate(-90 28 28)"
                  style={{ transition: 'stroke-dashoffset 1s linear' }} />
              </svg>
              <div style={DS.countNum}>{countdown}</div>
            </div>
          </div>

          {items.length > 1 && (
            <div style={DS.nextCard}>
              <div style={DS.nextLabel}>NEXT</div>
              <div style={DS.nextTitle}>{items[(currentIdx + 1) % items.length]?.title}</div>
            </div>
          )}
        </div>
      )}

      {/* ─── Emergency Overlay ──────────────────────────── */}
      {emergency && emVisible && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: emergency.bgColor, animation: 'emIn 0.5s ease' }}>
          {/* Blinking alert */}
          <div style={{ fontSize: 80, animation: 'blink 1s infinite', marginBottom: 24 }}>🚨</div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 6, color: emergency.textColor, opacity: 0.7, marginBottom: 16, textAlign: 'center' }}>
            EMERGENCY ALERT
          </div>
          <div style={{ fontSize: 52, fontWeight: 800, color: emergency.textColor, textAlign: 'center', lineHeight: 1.2, maxWidth: '80vw', marginBottom: 24, textShadow: '0 2px 20px rgba(0,0,0,0.3)' }}>
            {emergency.title}
          </div>

          {/* Scrolling ticker */}
          <div style={{ width: '100%', overflow: 'hidden', background: 'rgba(0,0,0,0.25)', padding: '20px 0' }}>
            <div style={{ animation: 'marquee 12s linear infinite', whiteSpace: 'nowrap', fontSize: 28, fontWeight: 600, color: emergency.textColor }}>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{emergency.message}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{emergency.message}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{emergency.message}
            </div>
          </div>

          {/* Expiry countdown */}
          {emergency.expiresAt && (
            <div style={{ position: 'absolute', bottom: 24, right: 32, fontSize: 13, color: emergency.textColor, opacity: 0.6, fontFamily: 'Space Mono, monospace' }}>
              หมดอายุ: {new Date(emergency.expiresAt).toLocaleTimeString('th-TH')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DS: Record<string, React.CSSProperties> = {
  screen: { position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' },
  loadingScreen: { position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 },
  spinner: { width: 48, height: 48, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' },
  loadingText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, letterSpacing: 2 },
  emptyScreen: { position: 'fixed', inset: 0, background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#fff', fontSize: 28, fontWeight: 300, marginBottom: 8 },
  emptySub: { color: 'rgba(255,255,255,0.4)', fontSize: 16 },

  mediaWrap: { position: 'absolute', inset: '-5%', zIndex: 1 },
  iframe: { width: '110%', height: '110%', border: 'none', pointerEvents: 'none' },
  imgContent: { width: '110%', height: '110%', objectFit: 'cover' },

  overlay: { position: 'absolute', inset: 0, zIndex: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' },
  progressBar: { height: 3, background: 'rgba(255,255,255,0.1)', flexShrink: 0 },
  progressFill: { height: '100%', background: 'linear-gradient(90deg,#6c63ff,#ff6584)', transition: 'width 1s linear', borderRadius: '0 2px 2px 0' },

  hud: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 32px 28px', background: 'linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 100%)' },
  dots: { display: 'flex', gap: 8, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: '50%', transition: 'all 0.3s' },
  nowPlaying: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, padding: '0 32px' },
  nowLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,0.5)', fontFamily: 'Space Mono, monospace' },
  nowTitle: { fontSize: 22, fontWeight: 600, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.8)' },
  countWrap: { position: 'relative', flexShrink: 0 },
  countNum: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'Space Mono, monospace' },

  nextCard: { position: 'absolute', top: 24, right: 24, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 16px', maxWidth: 240 },
  nextLabel: { fontSize: 9, letterSpacing: 3, color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 4 },
  nextTitle: { fontSize: 13, color: '#fff', lineHeight: 1.4 },
};
