import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { MediaItem, EmergencyAlert, Playlist, AnalyticsEntry } from '@/lib/types';
import { getYouTubeThumbnail, extractYouTubeId, detectContentType } from '@/lib/youtube';

type Tab = 'queue' | 'analytics' | 'playlists' | 'emergency';

interface AddForm {
  title: string; url: string; duration: number;
  scheduledStart: string; scheduledEnd: string; playlistId: string;
}
const defaultForm: AddForm = { title: '', url: '', duration: 60, scheduledStart: '', scheduledEnd: '', playlistId: '' };

// ─── helpers ────────────────────────────────────────────────
function typeIcon(type: MediaItem['type']) {
  return { youtube: '▶', image: '🖼', video: '🎬', webpage: '🌐' }[type] ?? '📄';
}
function typeLabel(type: MediaItem['type']) {
  return { youtube: 'YouTube', image: 'รูปภาพ', video: 'วิดีโอ MP4', webpage: 'เว็บไซต์' }[type] ?? type;
}
function fmtDur(s: number) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function fmtSecs(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}ชม. ${m}น.` : `${m}น.`;
}

// ─── Main ────────────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('queue');

  const [items, setItems] = useState<MediaItem[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsEntry[]>([]);
  const [emergency, setEmergency] = useState<EmergencyAlert | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(7);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [liveStatus, setLiveStatus] = useState<{ index: number; ts: string } | null>(null);
  const [filterPlaylist, setFilterPlaylist] = useState('all');

  // Emergency form
  const [emForm, setEmForm] = useState({ title: 'ประกาศด่วน', message: '', bgColor: '#dc2626', textColor: '#ffffff', expiresIn: '60' });
  // Playlist form
  const [plForm, setPlForm] = useState({ name: '', color: '#6c63ff' });
  // Add form
  const [form, setForm] = useState<AddForm>(defaultForm);

  const pass = typeof window !== 'undefined' ? sessionStorage.getItem('adminPass') || '' : '';

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const [itemsRes, plRes, emRes] = await Promise.all([
        fetch('/api/videos', { headers: { 'x-admin-password': p } }),
        fetch('/api/playlists', { headers: { 'x-admin-password': p } }),
        fetch('/api/emergency'),
      ]);
      if (itemsRes.ok) setItems(await itemsRes.json());
      if (plRes.ok) setPlaylists(await plRes.json());
      if (emRes.ok) setEmergency(await emRes.json());
    } finally { setLoading(false); }
  }, []);

  const fetchAnalytics = useCallback(async (days: number) => {
    const r = await fetch(`/api/analytics?days=${days}`, { headers: { 'x-admin-password': pass } });
    if (r.ok) setAnalytics(await r.json());
  }, [pass]);

  useEffect(() => { if (pass) { setAuthed(true); fetchAll(pass); } }, [pass, fetchAll]);

  useEffect(() => {
    if (!authed) return;
    const poll = () => {
      try {
        const raw = localStorage.getItem('display_state');
        if (raw) setLiveStatus(JSON.parse(raw));
      } catch {}
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [authed]);

  useEffect(() => {
    if (tab === 'analytics') fetchAnalytics(analyticsDays);
  }, [tab, analyticsDays, fetchAnalytics]);

  // ─── Auth ─────────────────────────────────────────────────
  async function login() {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    if (r.ok) { sessionStorage.setItem('adminPass', password); setAuthed(true); fetchAll(password); }
    else setAuthError('รหัสผ่านไม่ถูกต้อง');
  }

  // ─── Media CRUD ───────────────────────────────────────────
  async function addItem() {
    if (!form.url.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pass },
        body: JSON.stringify({ title: form.title, youtubeUrl: form.url, contentUrl: form.url, duration: form.duration, scheduledStart: form.scheduledStart || undefined, scheduledEnd: form.scheduledEnd || undefined, playlistId: form.playlistId || undefined }),
      });
      if (r.ok) {
        const newItem = await r.json();
        setItems(prev => [...prev, newItem]);
        setForm(defaultForm); setShowAdd(false);
        showToast('เพิ่มสำเร็จ ✓');
      } else { const e = await r.json(); showToast(e.error || 'เกิดข้อผิดพลาด', 'err'); }
    } finally { setSaving(false); }
  }

  async function deleteItem(id: string) {
    if (!confirm('ลบรายการนี้?')) return;
    const r = await fetch(`/api/videos/${id}`, { method: 'DELETE', headers: { 'x-admin-password': pass } });
    if (r.ok) { setItems(prev => prev.filter(v => v.id !== id)); showToast('ลบแล้ว'); }
  }

  async function toggleActive(item: MediaItem) {
    const r = await fetch(`/api/videos/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-admin-password': pass },
      body: JSON.stringify({ active: !item.active }),
    });
    if (r.ok) setItems(prev => prev.map(v => v.id === item.id ? { ...v, active: !v.active } : v));
  }

  async function saveReorder(ordered: MediaItem[]) {
    const reordered = ordered.map((v, i) => ({ ...v, order: i + 1 }));
    setItems(reordered);
    await fetch('/api/videos', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-password': pass }, body: JSON.stringify({ videos: reordered }) });
  }

  // ─── Emergency ────────────────────────────────────────────
  async function sendEmergency() {
    if (!emForm.message.trim()) return showToast('กรุณากรอกข้อความ', 'err');
    setSaving(true);
    const expiresAt = emForm.expiresIn ? new Date(Date.now() + parseInt(emForm.expiresIn) * 60000).toISOString() : undefined;
    const r = await fetch('/api/emergency', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': pass },
      body: JSON.stringify({ ...emForm, expiresAt }),
    });
    if (r.ok) { setEmergency(await r.json()); showToast('🚨 ส่งประกาศฉุกเฉินแล้ว'); }
    setSaving(false);
  }

  async function clearEmergency() {
    const r = await fetch('/api/emergency', { method: 'DELETE', headers: { 'x-admin-password': pass } });
    if (r.ok) { setEmergency(null); showToast('ยกเลิกประกาศแล้ว'); }
  }

  // ─── Playlist ─────────────────────────────────────────────
  async function addPlaylist() {
    if (!plForm.name.trim()) return;
    const r = await fetch('/api/playlists', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': pass },
      body: JSON.stringify(plForm),
    });
    if (r.ok) { const pl = await r.json(); setPlaylists(prev => [...prev, pl]); setPlForm({ name: '', color: '#6c63ff' }); showToast('สร้าง Playlist แล้ว'); }
  }

  // ─── DnD ─────────────────────────────────────────────────
  function onDragStart(id: string) { setDragItem(id); }
  function onDragOver(e: React.DragEvent, id: string) { e.preventDefault(); if (id !== dragItem) setDragOver(id); }
  function onDrop(targetId: string) {
    if (!dragItem || dragItem === targetId) return;
    const from = items.findIndex(v => v.id === dragItem);
    const to = items.findIndex(v => v.id === targetId);
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    saveReorder(next);
    setDragItem(null); setDragOver(null);
  }

  // ─── Derived ─────────────────────────────────────────────
  const urlPreviewType = form.url ? detectContentType(form.url) : null;
  const urlYtId = form.url && urlPreviewType === 'youtube' ? extractYouTubeId(form.url) : null;

  const filteredItems = filterPlaylist === 'all' ? items : items.filter(v => v.playlistId === filterPlaylist);

  // Analytics aggregation
  const totalPlays = analytics.reduce((s, e) => s + e.plays, 0);
  const totalTime = analytics.reduce((s, e) => s + e.totalSeconds, 0);
  const topItems = [...analytics].sort((a, b) => b.plays - a.plays).slice(0, 5);
  const byDate: Record<string, number> = {};
  analytics.forEach(e => { byDate[e.date] = (byDate[e.date] || 0) + e.plays; });
  const chartDates = Object.keys(byDate).sort().slice(-7);
  const maxPlays = Math.max(...chartDates.map(d => byDate[d] || 0), 1);

  // ─── Login ────────────────────────────────────────────────
  if (!authed) return (
    <div style={S.loginBg}>
      <Head><title>Admin — Yimwhan Digital Signage</title></Head>
      <div style={S.loginCard}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>📺</div>
        <h1 style={S.loginTitle}>Yimwhan Digital Signage</h1>
        <p style={S.loginSub}>Admin Dashboard</p>
        <input style={S.input} type="password" placeholder="รหัสผ่าน" value={password}
          onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} />
        {authError && <p style={{ color: '#ff6584', fontSize: 13 }}>{authError}</p>}
        <button style={S.btnPrimary} onClick={login}>เข้าสู่ระบบ</button>
      </div>
    </div>
  );

  // ─── Dashboard ───────────────────────────────────────────
  return (
    <div style={S.page}>
      <Head><title>Admin — Yimwhan Digital Signage</title></Head>

      {/* Toast */}
      {toast && <div style={{ ...S.toast, background: toast.type === 'ok' ? '#43e97b' : '#ff6584' }}>{toast.msg}</div>}

      {/* Emergency Banner */}
      {emergency && (
        <div style={{ background: emergency.bgColor, color: emergency.textColor, padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>🚨 ACTIVE: {emergency.title} — {emergency.message}</span>
          <button onClick={clearEmergency} style={{ background: 'rgba(0,0,0,0.25)', color: 'inherit', border: 'none', borderRadius: 8, padding: '4px 14px', cursor: 'pointer', fontSize: 13 }}>
            ยกเลิกประกาศ ✕
          </button>
        </div>
      )}

      {/* Header */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <span style={{ fontSize: 26 }}>📺</span>
          <div>
            <h1 style={S.headerTitle}>Yimwhan Digital Signage</h1>
            <p style={S.headerSub}>Admin Dashboard</p>
          </div>
        </div>
        <div style={S.headerRight}>
          {liveStatus && (
            <div style={S.liveChip}>
              <span style={S.liveDot} /> TV เล่น #{liveStatus.index + 1}
            </div>
          )}
          <a href="/display" target="_blank" style={S.btnSecondary}>🖥 เปิด TV</a>
          <button style={S.btnPrimary} onClick={() => setShowAdd(true)}>+ เพิ่มคอนเทนต์</button>
        </div>
      </header>

      {/* Stats */}
      <div style={S.statsRow}>
        {[
          { icon: '🎬', value: items.length, label: 'คอนเทนต์ทั้งหมด' },
          { icon: '✅', value: items.filter(v => v.active).length, label: 'กำลังใช้งาน' },
          { icon: '📋', value: playlists.length, label: 'Playlists' },
          { icon: '🚨', value: emergency ? 1 : 0, label: 'Emergency Active', highlight: !!emergency },
        ].map(s => (
          <div key={s.label} style={{ ...S.statCard, borderColor: s.highlight ? '#ff6584' : 'var(--border)' }}>
            <div style={{ fontSize: 22 }}>{s.icon}</div>
            <div style={{ ...S.statVal, color: s.highlight ? '#ff6584' : 'var(--text)' }}>{s.value}</div>
            <div style={S.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {(['queue', 'analytics', 'playlists', 'emergency'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}>
            {{ queue: '🎬 Content', analytics: '📊 Analytics', playlists: '📋 Playlists', emergency: '🚨 Emergency' }[t]}
          </button>
        ))}
      </div>

      <div style={S.content}>

        {/* ─── TAB: QUEUE ──────────────────────────────── */}
        {tab === 'queue' && (
          <>
            {/* Playlist filter */}
            {playlists.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <button onClick={() => setFilterPlaylist('all')} style={{ ...S.filterChip, ...(filterPlaylist === 'all' ? S.filterChipActive : {}) }}>ทั้งหมด</button>
                {playlists.map(pl => (
                  <button key={pl.id} onClick={() => setFilterPlaylist(pl.id)}
                    style={{ ...S.filterChip, ...(filterPlaylist === pl.id ? { background: pl.color + '33', borderColor: pl.color, color: pl.color } : {}) }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: pl.color, marginRight: 6 }} />
                    {pl.name}
                  </button>
                ))}
              </div>
            )}

            {loading && <div style={S.empty}>⏳ กำลังโหลด...</div>}
            {!loading && filteredItems.length === 0 && (
              <div style={S.empty}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
                <p>ยังไม่มีคอนเทนต์ กด <strong>+ เพิ่มคอนเทนต์</strong></p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredItems.map((item, i) => {
                const pl = playlists.find(p => p.id === item.playlistId);
                const isLive = liveStatus?.index === i && item.active;
                return (
                  <div key={item.id} draggable
                    onDragStart={() => onDragStart(item.id)}
                    onDragOver={e => onDragOver(e, item.id)}
                    onDrop={() => onDrop(item.id)}
                    onDragEnd={() => { setDragItem(null); setDragOver(null); }}
                    style={{ ...S.card, opacity: dragItem === item.id ? 0.4 : 1, borderColor: dragOver === item.id ? '#6c63ff' : isLive ? '#43e97b' : 'var(--border)', boxShadow: isLive ? '0 0 0 1px #43e97b, 0 0 24px rgba(67,233,123,0.12)' : 'none' }}
                  >
                    <div style={S.orderBadge}>{item.order}</div>

                    {/* Thumbnail */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {item.type === 'youtube' && item.youtubeId ? (
                        <img src={getYouTubeThumbnail(item.youtubeId)} style={S.thumb} alt="" />
                      ) : item.type === 'image' && item.contentUrl ? (
                        <img src={item.contentUrl} style={S.thumb} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div style={{ ...S.thumb, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                          {typeIcon(item.type)}
                        </div>
                      )}
                      {isLive && <div style={S.liveBadge}>▶ LIVE</div>}
                      <div style={S.typeTag}>{typeIcon(item.type)}</div>
                    </div>

                    <div style={S.cardInfo}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={S.cardTitle}>{item.title}</span>
                        {pl && <span style={{ ...S.plTag, background: pl.color + '22', color: pl.color, borderColor: pl.color + '44' }}>{pl.name}</span>}
                      </div>
                      <div style={S.cardMeta}>
                        <span>{typeLabel(item.type)}</span>
                        <span>⏱ {fmtDur(item.duration)}</span>
                        {item.scheduledStart && <span>📅 {new Date(item.scheduledStart).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</span>}
                        <span style={{ color: item.active ? '#43e97b' : '#ff6584' }}>● {item.active ? 'Active' : 'Paused'}</span>
                      </div>
                    </div>

                    <div style={S.cardActions}>
                      {(item.type === 'youtube' || item.type === 'image' || item.type === 'video') && (
                        <button style={S.iconBtn} title="Preview" onClick={() => setPreviewItem(item)}>▶</button>
                      )}
                      <button style={{ ...S.iconBtn, color: item.active ? '#ff6584' : '#43e97b' }}
                        title={item.active ? 'ปิด' : 'เปิด'} onClick={() => toggleActive(item)}>
                        {item.active ? '⏸' : '▶'}
                      </button>
                      <button style={{ ...S.iconBtn, color: '#ff6584' }} onClick={() => deleteItem(item.id)}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ─── TAB: ANALYTICS ──────────────────────────── */}
        {tab === 'analytics' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 24, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>ช่วงเวลา:</span>
              {[7, 14, 30].map(d => (
                <button key={d} onClick={() => setAnalyticsDays(d)}
                  style={{ ...S.filterChip, ...(analyticsDays === d ? S.filterChipActive : {}) }}>
                  {d} วัน
                </button>
              ))}
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { icon: '▶', label: 'ครั้งที่เล่น', value: totalPlays.toLocaleString() },
                { icon: '⏱', label: 'เวลารวม', value: fmtSecs(totalTime) },
                { icon: '🎬', label: 'คอนเทนต์ที่เล่น', value: new Set(analytics.map(e => e.itemId)).size },
              ].map(c => (
                <div key={c.label} style={S.statCard}>
                  <div style={{ fontSize: 22 }}>{c.icon}</div>
                  <div style={S.statVal}>{c.value}</div>
                  <div style={S.statLabel}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Bar chart */}
            <div style={{ ...S.card, flexDirection: 'column', gap: 16, marginBottom: 24, cursor: 'default' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>จำนวนครั้งที่เล่นรายวัน</h3>
              {chartDates.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>ยังไม่มีข้อมูล</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                  {chartDates.map(date => {
                    const pct = ((byDate[date] || 0) / maxPlays) * 100;
                    return (
                      <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{byDate[date]}</div>
                        <div style={{ width: '100%', height: `${pct}%`, minHeight: 4, background: 'linear-gradient(180deg,#6c63ff,#ff6584)', borderRadius: '4px 4px 0 0', transition: 'height 0.4s' }} />
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{date.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top items */}
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Top คอนเทนต์</h3>
            {topItems.length === 0 ? (
              <div style={S.empty}>ยังไม่มีข้อมูล Analytics</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topItems.map((e, i) => (
                  <div key={e.itemId} style={{ ...S.card, cursor: 'default', gap: 14 }}>
                    <div style={{ ...S.orderBadge, background: i === 0 ? '#f7971e33' : 'var(--surface2)', color: i === 0 ? '#f7971e' : 'var(--text-muted)' }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{e.title}</div>
                      <div style={S.cardMeta}><span>{e.plays} ครั้ง</span><span>{fmtSecs(e.totalSeconds)}</span></div>
                    </div>
                    <div style={{ width: 120, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${(e.plays / (topItems[0].plays || 1)) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#6c63ff,#ff6584)' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: PLAYLISTS ──────────────────────────── */}
        {tab === 'playlists' && (
          <div>
            {/* Add playlist */}
            <div style={{ ...S.card, flexDirection: 'column', gap: 14, marginBottom: 24, cursor: 'default' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>สร้าง Playlist ใหม่</h3>
              <div style={{ display: 'flex', gap: 10 }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="ชื่อ Playlist เช่น คิวเช้า" value={plForm.name} onChange={e => setPlForm(f => ({ ...f, name: e.target.value }))} />
                <input type="color" value={plForm.color} onChange={e => setPlForm(f => ({ ...f, color: e.target.value }))}
                  style={{ width: 44, height: 44, border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', background: 'none', padding: 2 }} />
                <button style={S.btnPrimary} onClick={addPlaylist}>สร้าง</button>
              </div>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Playlists ทั้งหมด</h3>
            {playlists.length === 0 ? (
              <div style={S.empty}>ยังไม่มี Playlist</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {playlists.map(pl => {
                  const count = items.filter(v => v.playlistId === pl.id).length;
                  return (
                    <div key={pl.id} style={{ ...S.card, cursor: 'default' }}>
                      <div style={{ width: 16, height: 40, borderRadius: 4, background: pl.color, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{pl.name}</div>
                        <div style={S.cardMeta}><span>{count} คอนเทนต์</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: EMERGENCY ──────────────────────────── */}
        {tab === 'emergency' && (
          <div style={{ maxWidth: 600 }}>
            {emergency && (
              <div style={{ borderRadius: 16, padding: '20px 24px', marginBottom: 24, background: emergency.bgColor, color: emergency.textColor }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 8, opacity: 0.75 }}>🚨 ACTIVE EMERGENCY</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{emergency.title}</div>
                <div style={{ fontSize: 16 }}>{emergency.message}</div>
                <button onClick={clearEmergency} style={{ marginTop: 16, background: 'rgba(0,0,0,0.3)', color: 'inherit', border: 'none', borderRadius: 10, padding: '8px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  ✕ ยกเลิกประกาศ
                </button>
              </div>
            )}

            <div style={{ ...S.card, flexDirection: 'column', gap: 16, cursor: 'default', padding: 24 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🚨 Emergency Override</div>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>ส่งประกาศด่วนขึ้นหน้าจอ TV ทันที แทรกทุกคิว</p>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={S.label}>หัวข้อ</label>
                  <input style={S.input} value={emForm.title} onChange={e => setEmForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>ข้อความประกาศ *</label>
                  <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={emForm.message}
                    onChange={e => setEmForm(f => ({ ...f, message: e.target.value }))} placeholder="ข้อความที่จะแสดงบนจอ..." />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={S.label}>สีพื้นหลัง</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="color" value={emForm.bgColor} onChange={e => setEmForm(f => ({ ...f, bgColor: e.target.value }))}
                        style={{ width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'none', padding: 2 }} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emForm.bgColor}</span>
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>สีข้อความ</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="color" value={emForm.textColor} onChange={e => setEmForm(f => ({ ...f, textColor: e.target.value }))}
                        style={{ width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'none', padding: 2 }} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emForm.textColor}</span>
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>หมดอายุใน (นาที)</label>
                    <input style={S.input} type="number" min={1} value={emForm.expiresIn}
                      onChange={e => setEmForm(f => ({ ...f, expiresIn: e.target.value }))} />
                  </div>
                </div>

                {/* Preview */}
                <div style={{ borderRadius: 12, padding: '16px 20px', background: emForm.bgColor, color: emForm.textColor }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, marginBottom: 6, opacity: 0.7 }}>PREVIEW</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{emForm.title || 'หัวข้อ'}</div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{emForm.message || 'ข้อความประกาศ...'}</div>
                </div>
              </div>

              <button style={{ ...S.btnPrimary, background: '#dc2626', fontSize: 15, padding: '12px 28px', alignSelf: 'flex-start' }}
                onClick={sendEmergency} disabled={saving}>
                🚨 {saving ? 'กำลังส่ง...' : 'ส่งประกาศฉุกเฉิน'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Add Modal ────────────────────────────────── */}
      {showAdd && (
        <div style={S.modalBg} onClick={() => setShowAdd(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>เพิ่มคอนเทนต์ใหม่</h2>
              <button style={S.closeBtn} onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div style={S.modalBody}>
              <label style={S.label}>URL (YouTube / รูปภาพ / MP4 / เว็บ) *</label>
              <input style={S.input} placeholder="https://..." value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />

              {urlPreviewType && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                  <span style={{ fontSize: 20 }}>{typeIcon(urlPreviewType)}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ตรวจพบ: {typeLabel(urlPreviewType)}</span>
                  {urlYtId && <img src={getYouTubeThumbnail(urlYtId)} style={{ width: 80, height: 45, borderRadius: 6, objectFit: 'cover' }} alt="" />}
                </div>
              )}

              <label style={S.label}>ชื่อ</label>
              <input style={S.input} placeholder="ชื่อคอนเทนต์" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />

              <label style={S.label}>ระยะเวลาแสดง (วินาที)</label>
              <input style={S.input} type="number" min={5} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: parseInt(e.target.value) || 60 }))} />

              {playlists.length > 0 && (
                <>
                  <label style={S.label}>Playlist (ไม่บังคับ)</label>
                  <select style={{ ...S.input }} value={form.playlistId} onChange={e => setForm(f => ({ ...f, playlistId: e.target.value }))}>
                    <option value="">ไม่ระบุ</option>
                    {playlists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                  </select>
                </>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={S.label}>เริ่มแสดง (ไม่บังคับ)</label>
                  <input style={S.input} type="datetime-local" value={form.scheduledStart} onChange={e => setForm(f => ({ ...f, scheduledStart: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>หยุดแสดง (ไม่บังคับ)</label>
                  <input style={S.input} type="datetime-local" value={form.scheduledEnd} onChange={e => setForm(f => ({ ...f, scheduledEnd: e.target.value }))} />
                </div>
              </div>
            </div>
            <div style={S.modalFoot}>
              <button style={S.btnGhost} onClick={() => setShowAdd(false)}>ยกเลิก</button>
              <button style={S.btnPrimary} onClick={addItem} disabled={saving}>{saving ? 'กำลังบันทึก...' : '+ เพิ่มคอนเทนต์'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Preview Modal ────────────────────────────── */}
      {previewItem && (
        <div style={S.modalBg} onClick={() => setPreviewItem(null)}>
          <div style={{ ...S.modal, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>{previewItem.title}</h2>
              <button style={S.closeBtn} onClick={() => setPreviewItem(null)}>✕</button>
            </div>
            <div style={{ padding: 4, background: '#000', borderRadius: '0 0 16px 16px', overflow: 'hidden' }}>
              {previewItem.type === 'youtube' && previewItem.youtubeId && (
                <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                  <iframe style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                    src={`https://www.youtube.com/embed/${previewItem.youtubeId}?autoplay=1&controls=1`}
                    allowFullScreen allow="autoplay" />
                </div>
              )}
              {previewItem.type === 'image' && previewItem.contentUrl && (
                <img src={previewItem.contentUrl} style={{ width: '100%', maxHeight: 400, objectFit: 'contain' }} alt="" />
              )}
              {previewItem.type === 'video' && previewItem.contentUrl && (
                <video src={previewItem.contentUrl} controls autoPlay style={{ width: '100%', maxHeight: 400 }} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--bg)' },
  loginBg: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 60% 40%,#1a1040 0%,#0a0a0f 70%)' },
  loginCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '48px 40px', width: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 32px 64px rgba(0,0,0,0.5)' },
  loginTitle: { fontSize: 24, fontWeight: 700 },
  loginSub: { fontSize: 14, color: 'var(--text-muted)', marginTop: -8 },

  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 32px', borderBottom: '1px solid var(--border)', background: 'rgba(17,17,24,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  headerTitle: { fontSize: 17, fontWeight: 700 },
  headerSub: { fontSize: 11, color: 'var(--text-muted)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },

  liveChip: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(67,233,123,0.1)', border: '1px solid rgba(67,233,123,0.3)', borderRadius: 100, padding: '6px 14px', fontSize: 13, color: '#43e97b' },
  liveDot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#43e97b', boxShadow: '0 0 8px #43e97b' },

  statsRow: { display: 'flex', gap: 14, padding: '20px 32px' },
  statCard: { flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 },
  statVal: { fontSize: 28, fontWeight: 700, fontFamily: 'Space Mono,monospace' },
  statLabel: { fontSize: 12, color: 'var(--text-muted)' },

  tabs: { display: 'flex', gap: 4, padding: '0 32px', borderBottom: '1px solid var(--border)' },
  tab: { background: 'none', border: 'none', color: 'var(--text-muted)', padding: '12px 18px', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabActive: { color: 'var(--text)', borderBottomColor: 'var(--accent)' },

  content: { padding: '24px 32px' },

  filterChip: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' },
  filterChipActive: { background: 'rgba(108,99,255,0.15)', borderColor: '#6c63ff', color: '#6c63ff' },

  card: { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', cursor: 'grab', transition: 'border-color 0.15s, box-shadow 0.15s', userSelect: 'none' },
  orderBadge: { minWidth: 28, height: 28, borderRadius: 8, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'Space Mono,monospace', color: 'var(--text-muted)', flexShrink: 0 },
  thumb: { width: 90, height: 52, objectFit: 'cover', borderRadius: 8, display: 'block' },
  liveBadge: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(67,233,123,0.85)', color: '#000', fontSize: 10, fontWeight: 700, borderRadius: 8, letterSpacing: 1 },
  typeTag: { position: 'absolute', bottom: 4, right: 4, fontSize: 12, background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '1px 4px' },
  cardInfo: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  cardMeta: { display: 'flex', gap: 10, marginTop: 4, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' },
  plTag: { fontSize: 11, padding: '1px 8px', borderRadius: 100, border: '1px solid' },
  cardActions: { display: 'flex', gap: 6, flexShrink: 0 },
  iconBtn: { width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' },

  empty: { textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 16, border: '1px dashed var(--border)' },

  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 560, boxShadow: '0 32px 64px rgba(0,0,0,0.6)' },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' },
  modalBody: { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  modalFoot: { display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 },

  label: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },

  btnPrimary: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  btnSecondary: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 },
  btnGhost: { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 20px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },

  toast: { position: 'fixed', bottom: 24, right: 24, padding: '12px 20px', borderRadius: 12, fontWeight: 600, fontSize: 14, zIndex: 999, color: '#000', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' },
};
