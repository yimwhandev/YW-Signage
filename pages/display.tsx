import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { MediaItem, EmergencyAlert, Screen } from '@/lib/types';
import { isVideoScheduledNow } from '@/lib/clientUtils';
import { getYouTubeEmbedUrl } from '@/lib/youtube';

// Fallback defaults (ms) — overridden by settings from server
const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_EMERGENCY_MS = 15_000;

export default function DisplayPage() {
  const router = useRouter();
  const screenId = (router.query.screen as string) || 'default';

  const [items, setItems] = useState<MediaItem[]>([]);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [emergency, setEmergency] = useState<EmergencyAlert | null>(null);
  const [emVisible, setEmVisible] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [cachedItems, setCachedItems] = useState<MediaItem[]>([]);

  // Dynamic interval refs — updated whenever heartbeat returns new settings
  const heartbeatMsRef = useRef(DEFAULT_HEARTBEAT_MS);
  const emergencyMsRef = useRef(DEFAULT_EMERGENCY_MS);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emergencyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playlistRef = useRef<MediaItem[]>([]);
  const playStartRef = useRef(Date.now());
  const currentIdxRef = useRef(0);
  const currentTitleRef = useRef('');

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'OFFLINE') setIsOffline(true);
      });
    }
    const stored = sessionStorage.getItem(`playlist_${screenId}`);
    if (stored) { try { setCachedItems(JSON.parse(stored)); } catch {} }
  }, [screenId]);

  const getActive = (all: MediaItem[]) =>
    all.filter(v => v.active && isVideoScheduledNow(v));

  // ─── Emergency poll (self-rescheduling) ──────────────────
  const checkEmergency = useCallback(async () => {
    try {
      const r = await fetch('/api/emergency', { cache: 'no-store' });
      if (r.ok) {
        const data: EmergencyAlert | null = await r.json();
        setEmergency(data);
        if (data) { setEmVisible(false); setTimeout(() => setEmVisible(true), 100); }
        else setEmVisible(false);
      }
    } catch {}
    // Reschedule with current interval
    emergencyTimerRef.current = setTimeout(checkEmergency, emergencyMsRef.current);
  }, []);

  // ─── Heartbeat (self-rescheduling) ───────────────────────
  const sendHeartbeat = useCallback(async () => {
    try {
      const r = await fetch('/api/screens/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenId,
          currentIndex: currentIdxRef.current,
          currentTitle: currentTitleRef.current,
        }),
      });

      if (r.ok) {
        const data = await r.json();
        if (!data.offline) {
          setIsOffline(false);
          const active = getActive(data.items || []);
          playlistRef.current = active;
          setItems(active);
          setScreen(data.screen);
          sessionStorage.setItem(`playlist_${screenId}`, JSON.stringify(active));

          // Apply new interval settings from server
          if (data.settings) {
            const newHeartbeat = Math.max(5, parseInt(data.settings.refreshInterval) || 30) * 1000;
            const newEmergency = Math.max(5, parseInt(data.settings.emergencyPoll) || 15) * 1000;
            heartbeatMsRef.current = newHeartbeat;
            emergencyMsRef.current = newEmergency;
          }
        }
      }
    } catch {
      if (cachedItems.length > 0) {
        playlistRef.current = cachedItems;
        setItems(cachedItems);
      }
      setIsOffline(true);
    }
    setLoading(false);
    // Reschedule with current interval
    heartbeatTimerRef.current = setTimeout(sendHeartbeat, heartbeatMsRef.current);
  }, [screenId, cachedItems]);

  // ─── Bootstrap on mount ──────────────────────────────────
  useEffect(() => {
    if (!router.isReady) return;
    sendHeartbeat();
    checkEmergency();
    return () => {
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      if (emergencyTimerRef.current) clearTimeout(emergencyTimerRef.current);
    };
  }, [router.isReady, sendHeartbeat, checkEmergency]);

  const logPlay = useCallback((item: MediaItem, seconds: number) => {
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, title: item.title, seconds, screenId }),
    }).catch(() => {});
  }, [screenId]);

  const goNext = useCallback(() => {
    const playlist = playlistRef.current;
    const curr = playlist[currentIdxRef.current];
    if (curr) logPlay(curr, Math.round((Date.now() - playStartRef.current) / 1000));

    setTransitioning(true);
    setTimeout(() => {
      const next = (currentIdxRef.current + 1) % (playlist.length || 1);
      currentIdxRef.current = next;
      currentTitleRef.current = playlist[next]?.title || '';
      setCurrentIdx(next);
      try {
        localStorage.setItem(`display_state_${screenId}`, JSON.stringify({
          currentIndex: next, lastUpdated: new Date().toISOString(), screenId,
        }));
        // Also write to shared key for admin
        localStorage.setItem('display_state', JSON.stringify({
          currentIndex: next, lastUpdated: new Date().toISOString(), screenId,
        }));
      } catch {}
      playStartRef.current = Date.now();
      setTransitioning(false);
    }, 600);
  }, [logPlay, screenId]);

  useEffect(() => {
    if (items.length === 0) return;
    const current = items[currentIdx];
    if (!current) return;
    currentTitleRef.current = current.title;
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

  // ─── Autoplay / Mute handling ─────────────────────────────
  // Browser requires mute=1 for autoplay before user interaction.
  // After first tap anywhere on screen → unmute all subsequent videos.
  const [muted, setMuted] = useState(true);
  const [showTapHint, setShowTapHint] = useState(true);

  function handleScreenTap() {
    if (muted) {
      setMuted(false);
      setShowTapHint(false);
    }
  }

  // ─── Loading ─────────────────────────────────────────
  if (loading) return (
    <div style={DS.loadingScreen}>
      <div style={DS.spinner} />
      <p style={DS.loadingText}>กำลังเชื่อมต่อ{screen ? ` — ${screen.name}` : ''}...</p>
    </div>
  );

  if (items.length === 0) return (
    <div style={DS.emptyScreen}>
      <div style={{ fontSize: 80, marginBottom: 24 }}>📺</div>
      <h2 style={DS.emptyTitle}>{screen?.name || screenId}</h2>
      <p style={DS.emptySub}>ยังไม่มีคอนเทนต์ในคิว</p>
      {isOffline && <div style={DS.offlineBadge}>📡 Offline</div>}
    </div>
  );

  return (
    <div style={DS.screen} onClick={handleScreenTap}>
      <Head>
        <title>{screen?.name || 'Display'} — Digital Signage</title>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Space+Mono:wght@700&display=swap');
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes emIn { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
          @keyframes marquee { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes tapPulse { 0%,100% { opacity:0.85; transform:scale(1); } 50% { opacity:1; transform:scale(1.04); } }
          body { margin: 0; overflow: hidden; background: #000; font-family: 'DM Sans', sans-serif; }
        `}</style>
      </Head>

      {/* ─── Content ───────────────────────────────────── */}
      <div style={{ ...DS.mediaWrap, opacity: transitioning ? 0 : 1, transition: 'opacity 0.6s ease' }}>
        {current?.type === 'youtube' && current.youtubeId && (
          <iframe key={current.id + currentIdx + (muted ? 'm' : 's')}
            src={getYouTubeEmbedUrl(current.youtubeId, true, muted)}
            style={DS.iframe} allow="autoplay; encrypted-media" allowFullScreen />
        )}
        {current?.type === 'image' && current.contentUrl && (
          <img key={current.id} src={current.contentUrl} style={DS.fullMedia} alt={current.title} />
        )}
        {current?.type === 'video' && current.contentUrl && (
          <video key={current.id} src={current.contentUrl} style={DS.fullMedia}
            autoPlay muted={false} onEnded={goNext} />
        )}
        {current?.type === 'webpage' && current.contentUrl && (
          <iframe key={current.id} src={current.contentUrl}
            style={{ ...DS.iframe, pointerEvents: 'none' }} />
        )}
      </div>

      {/* ─── Normal Overlay ───────────────────────────── */}
      {!emergency && (
        <div style={DS.overlay}>
          {/* Progress bar */}
          <div style={DS.progressBar}>
            <div style={{ ...DS.progressFill, width: `${progressPct}%` }} />
          </div>

          {/* Tap to unmute hint — shown only when muted */}
          {showTapHint && muted && (
            <div style={DS.tapHint}>
              <div style={DS.tapHintInner}>
                <span style={{ fontSize: 28 }}>🔇</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>แตะหน้าจอเพื่อเปิดเสียง</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Tap anywhere to unmute</div>
                </div>
              </div>
            </div>
          )}

          {/* Mute indicator (small) — shown after hint is dismissed but still muted */}
          {!showTapHint && muted && (
            <div style={DS.mutePill}>🔇 Muted — แตะเพื่อเปิดเสียง</div>
          )}

          {/* Offline badge */}
          {isOffline && (
            <div style={DS.offlinePill}>📡 Offline — เล่นจาก Cache</div>
          )}

          {/* Next card */}
          {items.length > 1 && (
            <div style={DS.nextCard}>
              <div style={DS.nextLabel}>NEXT</div>
              <div style={DS.nextTitle}>{items[(currentIdx + 1) % items.length]?.title}</div>
            </div>
          )}

          {/* HUD bottom */}
          <div style={DS.hud}>
            <div style={DS.dots}>
              {items.slice(0, 12).map((_, i) => (
                <div key={i} style={{ ...DS.dot, background: i === currentIdx ? '#fff' : 'rgba(255,255,255,0.22)', transform: i === currentIdx ? 'scale(1.5)' : 'scale(1)' }} />
              ))}
              {items.length > 12 && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>+{items.length - 12}</span>}
            </div>

            <div style={DS.nowPlaying}>
              {screen && <span style={DS.screenLabel}>{screen.name} {screen.location ? `· ${screen.location}` : ''}</span>}
              <span style={DS.nowLabel}>▶ NOW PLAYING</span>
              <span style={DS.nowTitle}>{current?.title}</span>
            </div>

            {/* Countdown ring */}
            <div style={DS.countWrap}>
              <svg viewBox="0 0 56 56" style={{ width: 56, height: 56 }}>
                <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
                <circle cx="28" cy="28" r="24" fill="none" stroke="#fff" strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 24}`}
                  strokeDashoffset={`${2 * Math.PI * 24 * (1 - progressPct / 100)}`}
                  strokeLinecap="round" transform="rotate(-90 28 28)"
                  style={{ transition: 'stroke-dashoffset 1s linear' }} />
              </svg>
              <div style={DS.countNum}>{countdown}</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Emergency Overlay ────────────────────────── */}
      {emergency && emVisible && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: emergency.bgColor, animation: 'emIn 0.5s ease' }}>
          <div style={{ fontSize: 80, animation: 'blink 1s infinite', marginBottom: 20 }}>🚨</div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 6, color: emergency.textColor, opacity: 0.65, marginBottom: 12 }}>EMERGENCY ALERT</div>
          <div style={{ fontSize: 56, fontWeight: 800, color: emergency.textColor, textAlign: 'center', lineHeight: 1.15, maxWidth: '80vw', marginBottom: 32, textShadow: '0 2px 20px rgba(0,0,0,0.25)' }}>
            {emergency.title}
          </div>
          <div style={{ width: '100%', overflow: 'hidden', background: 'rgba(0,0,0,0.22)', padding: '18px 0' }}>
            <div style={{ animation: 'marquee 14s linear infinite', whiteSpace: 'nowrap', fontSize: 26, fontWeight: 600, color: emergency.textColor }}>
              {'　'.repeat(8)}{emergency.message}{'　'.repeat(8)}{emergency.message}{'　'.repeat(8)}{emergency.message}
            </div>
          </div>
          {emergency.expiresAt && (
            <div style={{ position: 'absolute', bottom: 24, right: 32, fontSize: 12, color: emergency.textColor, opacity: 0.55, fontFamily: 'Space Mono, monospace' }}>
              หมดอายุ {new Date(emergency.expiresAt).toLocaleTimeString('th-TH')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DS: Record<string, React.CSSProperties> = {
  screen: { position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' },
  loadingScreen: { position: 'fixed', inset: 0, background: '#050508', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 },
  spinner: { width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.08)', borderTopColor: '#fff', animation: 'spin 0.9s linear infinite' },
  loadingText: { color: 'rgba(255,255,255,0.35)', fontSize: 13, letterSpacing: 2 },
  emptyScreen: { position: 'fixed', inset: 0, background: '#050508', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { color: '#fff', fontSize: 26, fontWeight: 600 },
  emptySub: { color: 'rgba(255,255,255,0.35)', fontSize: 15 },
  offlineBadge: { marginTop: 16, background: 'rgba(255,165,0,0.15)', border: '1px solid rgba(255,165,0,0.3)', color: '#ffa500', borderRadius: 100, padding: '6px 16px', fontSize: 13 },

  mediaWrap: { position: 'absolute', inset: '-5%', zIndex: 1 },
  iframe: { width: '110%', height: '110%', border: 'none', pointerEvents: 'none' },
  fullMedia: { width: '110%', height: '110%', objectFit: 'cover' },

  overlay: { position: 'absolute', inset: 0, zIndex: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' },
  progressBar: { height: 3, background: 'rgba(255,255,255,0.08)', flexShrink: 0 },
  progressFill: { height: '100%', background: 'linear-gradient(90deg,#6c63ff,#ff6584)', transition: 'width 1s linear', borderRadius: '0 2px 2px 0' },

  // Tap to unmute — centered, pulsing, pointer-events on so user can click it
  tapHint: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'all', cursor: 'pointer' },
  tapHintInner: { display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '20px 32px', color: '#fff', animation: 'tapPulse 2s ease-in-out infinite' },
  mutePill: { position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', borderRadius: 100, padding: '5px 16px', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'all', cursor: 'pointer' },

  offlinePill: { position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,165,0,0.15)', border: '1px solid rgba(255,165,0,0.3)', color: '#ffa500', borderRadius: 100, padding: '5px 16px', fontSize: 12, whiteSpace: 'nowrap' },

  nextCard: { position: 'absolute', top: 20, right: 20, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '10px 16px', maxWidth: 260 },
  nextLabel: { fontSize: 9, letterSpacing: 3, color: 'rgba(255,255,255,0.35)', fontWeight: 700, marginBottom: 4 },
  nextTitle: { fontSize: 13, color: '#fff', lineHeight: 1.4 },

  hud: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 32px 28px', background: 'linear-gradient(to top,rgba(0,0,0,0.88) 0%,transparent 100%)' },
  dots: { display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', maxWidth: 160 },
  dot: { width: 7, height: 7, borderRadius: '50%', transition: 'all 0.3s', flexShrink: 0 },
  nowPlaying: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, padding: '0 28px' },
  screenLabel: { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginBottom: 2 },
  nowLabel: { fontSize: 9, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,0.45)', fontFamily: 'Space Mono, monospace' },
  nowTitle: { fontSize: 20, fontWeight: 600, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  countWrap: { position: 'relative', flexShrink: 0 },
  countNum: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'Space Mono, monospace' },
};
