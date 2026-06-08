import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { VideoItem } from '@/lib/types';
import { getYouTubeThumbnail, extractYouTubeId } from '@/lib/youtube';

// ─── Types ────────────────────────────────────────────────────
interface FormData {
  title: string;
  youtubeUrl: string;
  duration: number;
  scheduledStart: string;
  scheduledEnd: string;
}

// ─── Main Admin Page ──────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [liveStatus, setLiveStatus] = useState<{ index: number; ts: string } | null>(null);
  const [form, setForm] = useState<FormData>({
    title: '', youtubeUrl: '', duration: 60, scheduledStart: '', scheduledEnd: ''
  });

  const pass = typeof window !== 'undefined' ? sessionStorage.getItem('adminPass') || '' : '';

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchVideos = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const r = await fetch('/api/videos', { headers: { 'x-admin-password': p } });
      if (r.ok) setVideos(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (pass) { setAuthed(true); fetchVideos(pass); }
  }, [pass, fetchVideos]);

  // Live status poll
  useEffect(() => {
    if (!authed) return;
    const poll = () => {
      const raw = localStorage.getItem('display_state');
      if (raw) {
        try {
          const s = JSON.parse(raw);
          setLiveStatus({ index: s.currentIndex, ts: s.lastUpdated });
        } catch {}
      }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [authed]);

  async function login() {
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (r.ok) {
      sessionStorage.setItem('adminPass', password);
      setAuthed(true);
      fetchVideos(password);
    } else {
      setAuthError('รหัสผ่านไม่ถูกต้อง');
    }
  }

  async function addVideo() {
    if (!form.youtubeUrl.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pass },
        body: JSON.stringify(form),
      });
      if (r.ok) {
        const v = await r.json();
        setVideos(prev => [...prev, v]);
        setForm({ title: '', youtubeUrl: '', duration: 60, scheduledStart: '', scheduledEnd: '' });
        setShowAdd(false);
        showToast('เพิ่มวิดีโอสำเร็จ');
      } else {
        const e = await r.json();
        showToast(e.error || 'เกิดข้อผิดพลาด', 'err');
      }
    } finally { setSaving(false); }
  }

  async function deleteVideo(id: string) {
    if (!confirm('ลบวิดีโอนี้?')) return;
    const r = await fetch(`/api/videos/${id}`, { method: 'DELETE', headers: { 'x-admin-password': pass } });
    if (r.ok) {
      setVideos(prev => prev.filter(v => v.id !== id));
      showToast('ลบสำเร็จ');
    }
  }

  async function toggleActive(video: VideoItem) {
    const updated = { ...video, active: !video.active };
    const r = await fetch(`/api/videos/${video.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': pass },
      body: JSON.stringify({ active: !video.active }),
    });
    if (r.ok) {
      setVideos(prev => prev.map(v => v.id === video.id ? updated : v));
    }
  }

  async function saveReorder(ordered: VideoItem[]) {
    const reordered = ordered.map((v, i) => ({ ...v, order: i + 1 }));
    setVideos(reordered);
    await fetch('/api/videos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': pass },
      body: JSON.stringify({ videos: reordered }),
    });
  }

  // Drag-and-drop reorder
  function handleDragStart(id: string) { setDragItem(id); }
  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (id !== dragItem) setDragOver(id);
  }
  function handleDrop(targetId: string) {
    if (!dragItem || dragItem === targetId) return;
    const from = videos.findIndex(v => v.id === dragItem);
    const to = videos.findIndex(v => v.id === targetId);
    const next = [...videos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    saveReorder(next);
    setDragItem(null); setDragOver(null);
  }

  const urlPreviewId = form.youtubeUrl ? extractYouTubeId(form.youtubeUrl) : null;

  // ─── Login Screen ──────────────────────────────────────────
  if (!authed) return (
    <div style={styles.loginBg}>
      <Head><title>Digital Signage — Admin</title></Head>
      <div style={styles.loginCard}>
        <div style={styles.loginLogo}>📺</div>
        <h1 style={styles.loginTitle}>Digital Signage</h1>
        <p style={styles.loginSub}>Admin Dashboard</p>
        <input
          style={styles.input}
          type="password"
          placeholder="รหัสผ่าน Admin"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
        />
        {authError && <p style={styles.errorText}>{authError}</p>}
        <button style={styles.btnPrimary} onClick={login}>เข้าสู่ระบบ</button>
      </div>
    </div>
  );

  // ─── Admin Dashboard ───────────────────────────────────────
  return (
    <div style={styles.adminBg}>
      <Head><title>Admin — Digital Signage</title></Head>

      {/* Toast */}
      {toast && (
        <div style={{ ...styles.toast, background: toast.type === 'ok' ? '#43e97b' : '#ff6584', color: '#000' }}>
          {toast.type === 'ok' ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerLogo}>📺</span>
          <div>
            <h1 style={styles.headerTitle}>Digital Signage</h1>
            <p style={styles.headerSub}>Admin Dashboard</p>
          </div>
        </div>
        <div style={styles.headerRight}>
          {liveStatus && (
            <div style={styles.liveChip}>
              <span style={styles.liveDot} />
              TV กำลังเล่น #{liveStatus.index + 1}
            </div>
          )}
          <a href="/display" target="_blank" style={styles.btnSecondary}>
            🖥 เปิดหน้าจอ TV
          </a>
          <button style={styles.btnPrimary} onClick={() => setShowAdd(true)}>
            + เพิ่มวิดีโอ
          </button>
        </div>
      </header>

      {/* Stats */}
      <div style={styles.statsRow}>
        {[
          { label: 'วิดีโอทั้งหมด', value: videos.length, icon: '🎬' },
          { label: 'กำลังใช้งาน', value: videos.filter(v => v.active).length, icon: '✅' },
          { label: 'ปิดใช้งาน', value: videos.filter(v => !v.active).length, icon: '⏸' },
          { label: 'มี Schedule', value: videos.filter(v => v.scheduledStart).length, icon: '🕐' },
        ].map(s => (
          <div key={s.label} style={styles.statCard}>
            <div style={styles.statIcon}>{s.icon}</div>
            <div style={styles.statValue}>{s.value}</div>
            <div style={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Queue */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>คิววิดีโอ</h2>
          <span style={styles.sectionSub}>ลากเพื่อเรียงลำดับ</span>
        </div>

        {loading && <div style={styles.emptyState}>⏳ กำลังโหลด...</div>}
        {!loading && videos.length === 0 && (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
            <p>ยังไม่มีวิดีโอ กด <strong>+ เพิ่มวิดีโอ</strong> เพื่อเริ่มต้น</p>
          </div>
        )}

        <div style={styles.queue}>
          {videos.map((video, i) => (
            <div
              key={video.id}
              draggable
              onDragStart={() => handleDragStart(video.id)}
              onDragOver={e => handleDragOver(e, video.id)}
              onDrop={() => handleDrop(video.id)}
              onDragEnd={() => { setDragItem(null); setDragOver(null); }}
              style={{
                ...styles.queueCard,
                opacity: dragItem === video.id ? 0.4 : 1,
                borderColor: dragOver === video.id ? 'var(--accent)' : dragItem === video.id ? 'var(--accent2)' : 'var(--border)',
                ...(liveStatus?.index === i && video.active ? styles.queueCardActive : {}),
              }}
            >
              {/* Order badge */}
              <div style={styles.orderBadge}>{i + 1}</div>

              {/* Thumbnail */}
              <div style={styles.thumbWrap}>
                <img
                  src={getYouTubeThumbnail(video.youtubeId)}
                  alt={video.title}
                  style={styles.thumb}
                  onError={e => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                />
                {liveStatus?.index === i && video.active && (
                  <div style={styles.playingBadge}>▶ LIVE</div>
                )}
              </div>

              {/* Info */}
              <div style={styles.queueInfo}>
                <div style={styles.queueTitle}>{video.title}</div>
                <div style={styles.queueMeta}>
                  <span>⏱ {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}</span>
                  {video.scheduledStart && (
                    <span>📅 {new Date(video.scheduledStart).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</span>
                  )}
                  <span style={{ color: video.active ? '#43e97b' : '#ff6584', fontSize: 11 }}>
                    {video.active ? '● Active' : '● Paused'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={styles.queueActions}>
                <button style={styles.iconBtn} title="Preview" onClick={() => setPreviewId(video.youtubeId)}>
                  ▶
                </button>
                <button
                  style={{ ...styles.iconBtn, color: video.active ? '#ff6584' : '#43e97b' }}
                  title={video.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  onClick={() => toggleActive(video)}
                >
                  {video.active ? '⏸' : '▶'}
                </button>
                <button style={{ ...styles.iconBtn, color: '#ff6584' }} title="ลบ" onClick={() => deleteVideo(video.id)}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div style={styles.modalBg} onClick={() => setShowAdd(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>เพิ่มวิดีโอใหม่</h2>
              <button style={styles.closeBtn} onClick={() => setShowAdd(false)}>✕</button>
            </div>

            <div style={styles.modalBody}>
              <label style={styles.label}>YouTube URL *</label>
              <input
                style={styles.input}
                placeholder="https://www.youtube.com/watch?v=..."
                value={form.youtubeUrl}
                onChange={e => setForm(f => ({ ...f, youtubeUrl: e.target.value }))}
              />

              {urlPreviewId && (
                <div style={styles.urlPreview}>
                  <img src={getYouTubeThumbnail(urlPreviewId)} style={{ width: 120, borderRadius: 8 }} alt="preview" />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ID: {urlPreviewId}</span>
                </div>
              )}

              <label style={styles.label}>ชื่อวิดีโอ</label>
              <input
                style={styles.input}
                placeholder="กรอกชื่อ (ไม่บังคับ)"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />

              <label style={styles.label}>ระยะเวลาแสดง (วินาที)</label>
              <input
                style={styles.input}
                type="number"
                min={5}
                value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: parseInt(e.target.value) || 60 }))}
              />

              <div style={styles.row2col}>
                <div>
                  <label style={styles.label}>เริ่มแสดงเมื่อ (ไม่บังคับ)</label>
                  <input
                    style={styles.input}
                    type="datetime-local"
                    value={form.scheduledStart}
                    onChange={e => setForm(f => ({ ...f, scheduledStart: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={styles.label}>หยุดแสดงเมื่อ (ไม่บังคับ)</label>
                  <input
                    style={styles.input}
                    type="datetime-local"
                    value={form.scheduledEnd}
                    onChange={e => setForm(f => ({ ...f, scheduledEnd: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button style={styles.btnGhost} onClick={() => setShowAdd(false)}>ยกเลิก</button>
              <button style={styles.btnPrimary} onClick={addVideo} disabled={saving}>
                {saving ? 'กำลังบันทึก...' : '+ เพิ่มวิดีโอ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewId && (
        <div style={styles.modalBg} onClick={() => setPreviewId(null)}>
          <div style={{ ...styles.modal, maxWidth: 720, width: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Preview วิดีโอ</h2>
              <button style={styles.closeBtn} onClick={() => setPreviewId(null)}>✕</button>
            </div>
            <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
              <iframe
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                src={`https://www.youtube.com/embed/${previewId}?autoplay=1&controls=1`}
                allowFullScreen
                allow="autoplay"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  loginBg: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(ellipse at 60% 40%, #1a1040 0%, #0a0a0f 70%)',
  },
  loginCard: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24,
    padding: '48px 40px', width: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16,
    boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
  },
  loginLogo: { fontSize: 48 },
  loginTitle: { fontSize: 24, fontWeight: 700, letterSpacing: -0.5 },
  loginSub: { fontSize: 14, color: 'var(--text-muted)', marginTop: -8 },
  errorText: { color: 'var(--accent2)', fontSize: 13 },

  adminBg: { minHeight: '100vh', background: 'var(--bg)', paddingBottom: 60 },

  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 32px', borderBottom: '1px solid var(--border)',
    background: 'rgba(17,17,24,0.9)', backdropFilter: 'blur(12px)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  headerLogo: { fontSize: 28 },
  headerTitle: { fontSize: 18, fontWeight: 700, letterSpacing: -0.5 },
  headerSub: { fontSize: 12, color: 'var(--text-muted)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },

  liveChip: {
    display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(67,233,123,0.1)',
    border: '1px solid rgba(67,233,123,0.3)', borderRadius: 100, padding: '6px 14px', fontSize: 13, color: '#43e97b',
  },
  liveDot: {
    width: 8, height: 8, borderRadius: '50%', background: '#43e97b',
    boxShadow: '0 0 8px #43e97b', animation: 'pulse 1.5s infinite',
  },

  statsRow: { display: 'flex', gap: 16, padding: '24px 32px' },
  statCard: {
    flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4,
  },
  statIcon: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: 32, fontWeight: 700, letterSpacing: -1, fontFamily: 'Space Mono, monospace' },
  statLabel: { fontSize: 13, color: 'var(--text-muted)' },

  section: { padding: '0 32px' },
  sectionHeader: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 600 },
  sectionSub: { fontSize: 12, color: 'var(--text-muted)' },

  queue: { display: 'flex', flexDirection: 'column', gap: 10 },
  queueCard: {
    display: 'flex', alignItems: 'center', gap: 16,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '12px 16px', cursor: 'grab',
    transition: 'all 0.15s', userSelect: 'none',
  },
  queueCardActive: {
    borderColor: '#43e97b', boxShadow: '0 0 0 1px #43e97b, 0 0 20px rgba(67,233,123,0.1)',
  },
  orderBadge: {
    minWidth: 28, height: 28, borderRadius: 8, background: 'var(--surface2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)',
  },
  thumbWrap: { position: 'relative', flexShrink: 0 },
  thumb: { width: 90, height: 52, objectFit: 'cover', borderRadius: 8, display: 'block' },
  playingBadge: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(67,233,123,0.85)', color: '#000', fontSize: 10, fontWeight: 700,
    borderRadius: 8, letterSpacing: 1,
  },
  queueInfo: { flex: 1, minWidth: 0 },
  queueTitle: { fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  queueMeta: { display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' },
  queueActions: { display: 'flex', gap: 4, flexShrink: 0 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'all 0.15s',
  },

  emptyState: {
    textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)',
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)',
  },

  modalBg: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24,
  },
  modal: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20,
    width: '100%', maxWidth: 540, boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px', borderBottom: '1px solid var(--border)',
  },
  modalTitle: { fontSize: 16, fontWeight: 600 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16,
  },
  modalBody: { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  modalFooter: {
    display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 24px', borderTop: '1px solid var(--border)',
  },
  urlPreview: { display: 'flex', alignItems: 'center', gap: 12 },

  label: { fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none',
    fontFamily: 'inherit',
  },
  row2col: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },

  btnPrimary: {
    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10,
    padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  btnSecondary: {
    background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  btnGhost: {
    background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 20px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
  },

  toast: {
    position: 'fixed', bottom: 24, right: 24, padding: '12px 20px',
    borderRadius: 12, fontWeight: 600, fontSize: 14, zIndex: 999,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
};
