import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { MediaItem, EmergencyAlert, Playlist, AnalyticsEntry, Screen, SessionUser, UserRole } from '@/lib/types';
import { getYouTubeThumbnail, extractYouTubeId, detectContentType } from '@/lib/youtube';

type Tab = 'queue' | 'screens' | 'analytics' | 'playlists' | 'users' | 'emergency' | 'settings';
type AddForm = { title: string; url: string; duration: number; scheduledStart: string; scheduledEnd: string; playlistId: string; };
const defaultForm: AddForm = { title: '', url: '', duration: 60, scheduledStart: '', scheduledEnd: '', playlistId: '' };

// ─── helpers ─────────────────────────────────────────────────
const typeIcon = (t: MediaItem['type']) => ({ youtube: '▶', image: '🖼', video: '🎬', webpage: '🌐' }[t] ?? '📄');
const typeLabel = (t: MediaItem['type']) => ({ youtube: 'YouTube', image: 'รูปภาพ', video: 'วิดีโอ MP4', webpage: 'เว็บไซต์' }[t] ?? t);
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fmtSecs = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}ชม. ${m}น.` : `${m}น.`; };
const roleColor = { superadmin: '#f7971e', editor: '#6c63ff', viewer: '#43e97b' };
const roleLabel = { superadmin: 'Super Admin', editor: 'Editor', viewer: 'Viewer' };

function isOnline(screen: Screen) {
  if (!screen.lastSeen) return false;
  return (Date.now() - new Date(screen.lastSeen).getTime()) < 60_000;
}

export default function AdminPage() {
  // ─── Auth state ───────────────────────────────────────────
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');

  // ─── Data ─────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('queue');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsEntry[]>([]);
  const [emergency, setEmergency] = useState<EmergencyAlert | null>(null);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [users, setUsers] = useState<{ id: string; username: string; role: UserRole; createdAt: string; lastLogin?: string }[]>([]);
  const [analyticsDays, setAnalyticsDays] = useState(7);
  const [settings, setSettings] = useState({ refreshInterval: '30', emergencyPoll: '15', heartbeatInterval: '15' });
  const [settingsSaving, setSettingsSaving] = useState(false);

  // ─── Edit states ──────────────────────────────────────────
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDuration, setEditDuration] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editPlaylistId, setEditPlaylistId] = useState('');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editPlName, setEditPlName] = useState('');
  const [editPlColor, setEditPlColor] = useState('');

  // ─── UI state ─────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [filterPlaylist, setFilterPlaylist] = useState('all');

  // ─── Forms ────────────────────────────────────────────────
  const [form, setForm] = useState<AddForm>(defaultForm);
  const [emForm, setEmForm] = useState({ title: 'ประกาศด่วน', message: '', bgColor: '#dc2626', textColor: '#ffffff', expiresIn: '60' });
  const [plForm, setPlForm] = useState({ name: '', color: '#6c63ff' });
  const [screenForm, setScreenForm] = useState({ name: '', location: '', playlistId: '' });
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'editor' as UserRole });

  const getToken = () => typeof window !== 'undefined' ? sessionStorage.getItem('token') || '' : '';
  const authHeaders = () => ({ 'Content-Type': 'application/json', 'x-session': getToken(), 'x-admin-password': sessionStorage.getItem('legacyPass') || '' });

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  // ─── Fetch all ────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const h = authHeaders();
    try {
      const [ir, pr, er, sr, setr] = await Promise.all([
        fetch('/api/videos', { headers: h }),
        fetch('/api/playlists', { headers: h }),
        fetch('/api/emergency'),
        fetch('/api/screens', { headers: h }),
        fetch('/api/settings'),
      ]);
      if (ir.ok) setItems(await ir.json());
      if (pr.ok) setPlaylists(await pr.json());
      if (er.ok) setEmergency(await er.json());
      if (sr.ok) setScreens(await sr.json());
      if (setr.ok) { const s = await setr.json(); setSettings(prev => ({ ...prev, ...s })); }
    } finally { setLoading(false); }
  }, []);

  const fetchAnalytics = useCallback(async (days: number) => {
    const r = await fetch(`/api/analytics?days=${days}`, { headers: authHeaders() });
    if (r.ok) setAnalytics(await r.json());
  }, []);

  const fetchUsers = useCallback(async () => {
    const r = await fetch('/api/users', { headers: authHeaders() });
    if (r.ok) setUsers(await r.json());
  }, []);

  async function saveSettings() {
    setSettingsSaving(true);
    const r = await fetch('/api/settings', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(settings) });
    if (r.ok) { const s = await r.json(); setSettings(prev => ({ ...prev, ...s })); showToast('บันทึก Settings แล้ว ✓'); }
    else showToast('บันทึกไม่สำเร็จ', 'err');
    setSettingsSaving(false);
  }

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const role = sessionStorage.getItem('role') as UserRole;
    const username = sessionStorage.getItem('username') || '';
    if (token && role) { setSession({ id: '', username, role }); fetchAll(); }
  }, [fetchAll]);

  useEffect(() => { if (tab === 'analytics') fetchAnalytics(analyticsDays); }, [tab, analyticsDays, fetchAnalytics]);
  useEffect(() => { if (tab === 'users' && session?.role === 'superadmin') fetchUsers(); }, [tab, session, fetchUsers]);

  // Screen refresh poll (for online status)
  useEffect(() => {
    if (!session || tab !== 'screens') return;
    const t = setInterval(async () => {
      const r = await fetch('/api/screens', { headers: authHeaders() });
      if (r.ok) setScreens(await r.json());
    }, 15_000);
    return () => clearInterval(t);
  }, [session, tab]);

  // ─── Login ────────────────────────────────────────────────
  async function login() {
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginForm.username || undefined, password: loginForm.password }),
    });
    const data = await r.json();
    if (r.ok) {
      sessionStorage.setItem('token', data.token);
      sessionStorage.setItem('role', data.role);
      sessionStorage.setItem('username', data.username);
      if (!loginForm.username) sessionStorage.setItem('legacyPass', loginForm.password);
      setSession({ id: '', username: data.username, role: data.role });
      fetchAll();
    } else { setAuthError(data.error || 'เข้าสู่ระบบไม่สำเร็จ'); }
  }

  function logout() {
    sessionStorage.clear();
    setSession(null);
    setItems([]); setPlaylists([]); setScreens([]);
  }

  // ─── Media CRUD ───────────────────────────────────────────
  async function addItem() {
    if (!form.url.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/videos', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ title: form.title, youtubeUrl: form.url, contentUrl: form.url, duration: form.duration, scheduledStart: form.scheduledStart || undefined, scheduledEnd: form.scheduledEnd || undefined, playlistId: form.playlistId || undefined }),
      });
      if (r.ok) {
        const v = await r.json();
        setItems(p => [...p, v]); setForm(defaultForm); setShowAdd(false); showToast('เพิ่มสำเร็จ ✓');
      } else { const e = await r.json(); showToast(e.error || 'เกิดข้อผิดพลาด', 'err'); }
    } finally { setSaving(false); }
  }

  async function deleteItem(id: string) {
    if (!confirm('ลบรายการนี้?')) return;
    const r = await fetch(`/api/videos/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (r.ok) { setItems(p => p.filter(v => v.id !== id)); showToast('ลบแล้ว'); }
  }

  async function toggleActive(item: MediaItem) {
    const r = await fetch(`/api/videos/${item.id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ active: !item.active }) });
    if (r.ok) setItems(p => p.map(v => v.id === item.id ? { ...v, active: !v.active } : v));
  }

  async function saveReorder(ordered: MediaItem[]) {
    const re = ordered.map((v, i) => ({ ...v, order: i + 1 }));
    setItems(re);
    await fetch('/api/videos', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ videos: re }) });
  }

  function startEditItem(item: MediaItem) {
    setEditingItemId(item.id);
    setEditDuration(String(item.duration));
    setEditTitle(item.title);
    setEditPlaylistId(item.playlistId || '');
  }

  async function saveEditItem(item: MediaItem) {
    const updated = { ...item, title: editTitle, duration: parseInt(editDuration) || item.duration, playlistId: editPlaylistId || undefined };
    const r = await fetch(`/api/videos/${item.id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(updated) });
    if (r.ok) {
      setItems(p => p.map(v => v.id === item.id ? updated : v));
      setEditingItemId(null);
      showToast('บันทึกแล้ว ✓');
    }
  }

  function startEditPlaylist(pl: { id: string; name: string; color: string }) {
    setEditingPlaylistId(pl.id);
    setEditPlName(pl.name);
    setEditPlColor(pl.color);
  }

  async function saveEditPlaylist(plId: string) {
    const r = await fetch(`/api/playlists/${plId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ name: editPlName, color: editPlColor }) });
    if (r.ok) {
      setPlaylists(p => p.map(pl => pl.id === plId ? { ...pl, name: editPlName, color: editPlColor } : pl));
      setEditingPlaylistId(null);
      showToast('แก้ไข Playlist แล้ว ✓');
    }
  }

  async function deletePlaylist(plId: string) {
    if (!confirm('ลบ Playlist นี้? (คอนเทนต์ที่อยู่ใน Playlist จะยังอยู่ แต่ไม่มี Playlist)')) return;
    const r = await fetch(`/api/playlists/${plId}`, { method: 'DELETE', headers: authHeaders() });
    if (r.ok) { setPlaylists(p => p.filter(pl => pl.id !== plId)); showToast('ลบ Playlist แล้ว'); }
  }

  // ─── Emergency ────────────────────────────────────────────
  async function sendEmergency() {
    if (!emForm.message.trim()) return showToast('กรุณากรอกข้อความ', 'err');
    setSaving(true);
    const expiresAt = emForm.expiresIn ? new Date(Date.now() + parseInt(emForm.expiresIn) * 60000).toISOString() : undefined;
    const r = await fetch('/api/emergency', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...emForm, expiresAt }) });
    if (r.ok) { setEmergency(await r.json()); showToast('🚨 ส่งประกาศฉุกเฉินแล้ว'); }
    setSaving(false);
  }
  async function clearEmergency() {
    const r = await fetch('/api/emergency', { method: 'DELETE', headers: authHeaders() });
    if (r.ok) { setEmergency(null); showToast('ยกเลิกประกาศแล้ว'); }
  }

  // ─── Playlist ─────────────────────────────────────────────
  async function addPlaylist() {
    if (!plForm.name.trim()) return;
    const r = await fetch('/api/playlists', { method: 'POST', headers: authHeaders(), body: JSON.stringify(plForm) });
    if (r.ok) { const pl = await r.json(); setPlaylists(p => [...p, pl]); setPlForm({ name: '', color: '#6c63ff' }); showToast('สร้าง Playlist แล้ว'); }
  }

  // ─── Screens ──────────────────────────────────────────────
  async function addScreen() {
    if (!screenForm.name.trim()) return;
    const r = await fetch('/api/screens', { method: 'POST', headers: authHeaders(), body: JSON.stringify(screenForm) });
    if (r.ok) { const s = await r.json(); setScreens(p => [...p, s]); setScreenForm({ name: '', location: '', playlistId: '' }); showToast(`เพิ่มจอ "${s.name}" แล้ว`); }
  }
  async function deleteScreen(id: string) {
    if (!confirm('ลบจอนี้?')) return;
    const r = await fetch(`/api/screens/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (r.ok) { setScreens(p => p.filter(s => s.id !== id)); showToast('ลบจอแล้ว'); }
  }

  // ─── Users ────────────────────────────────────────────────
  async function addUser() {
    if (!userForm.username.trim() || !userForm.password.trim()) return showToast('กรอก username และ password', 'err');
    const r = await fetch('/api/users', { method: 'POST', headers: authHeaders(), body: JSON.stringify(userForm) });
    if (r.ok) { const u = await r.json(); setUsers(p => [...p, u]); setUserForm({ username: '', password: '', role: 'editor' }); showToast(`เพิ่ม ${u.username} แล้ว`); }
    else { const e = await r.json(); showToast(e.error || 'เกิดข้อผิดพลาด', 'err'); }
  }
  async function deleteUser(id: string, username: string) {
    if (!confirm(`ลบ user "${username}"?`)) return;
    const r = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (r.ok) { setUsers(p => p.filter(u => u.id !== id)); showToast('ลบ user แล้ว'); }
    else { const e = await r.json(); showToast(e.error, 'err'); }
  }

  // ─── DnD ─────────────────────────────────────────────────
  function onDragStart(id: string) { setDragItem(id); }
  function onDragOver(e: React.DragEvent, id: string) { e.preventDefault(); if (id !== dragItem) setDragOver(id); }
  function onDrop(targetId: string) {
    if (!dragItem || dragItem === targetId) return;
    const from = items.findIndex(v => v.id === dragItem), to = items.findIndex(v => v.id === targetId);
    const next = [...items]; const [it] = next.splice(from, 1); next.splice(to, 0, it);
    saveReorder(next); setDragItem(null); setDragOver(null);
  }

  // ─── Derived ──────────────────────────────────────────────
  const urlType = form.url ? detectContentType(form.url) : null;
  const urlYtId = form.url && urlType === 'youtube' ? extractYouTubeId(form.url) : null;
  const filteredItems = filterPlaylist === 'all' ? items : items.filter(v => v.playlistId === filterPlaylist);
  const totalPlays = analytics.reduce((s, e) => s + e.plays, 0);
  const totalTime = analytics.reduce((s, e) => s + e.totalSeconds, 0);
  const topItems = [...analytics].sort((a, b) => b.plays - a.plays).slice(0, 5);
  const byDate: Record<string, number> = {};
  analytics.forEach(e => { byDate[e.date] = (byDate[e.date] || 0) + e.plays; });
  const chartDates = Object.keys(byDate).sort().slice(-7);
  const maxPlays = Math.max(...chartDates.map(d => byDate[d] || 0), 1);
  const onlineCount = screens.filter(isOnline).length;

  const canWrite = session?.role === 'superadmin' || session?.role === 'editor';
  const canAdmin = session?.role === 'superadmin';

  const TABS: { key: Tab; label: string; adminOnly?: boolean }[] = [
    { key: 'queue', label: '🎬 คิว' },
    { key: 'screens', label: '🖥 Screens' },
    { key: 'analytics', label: '📊 Analytics' },
    { key: 'playlists', label: '📋 Playlists' },
    { key: 'users', label: '👤 Users', adminOnly: true },
    { key: 'emergency', label: '🚨 Emergency' },
    { key: 'settings', label: '⚙️ Settings' },
  ];

  // ─── Login Screen ─────────────────────────────────────────
  if (!session) return (
    <div style={S.loginBg}>
      <Head><title>Admin — Digital Signage</title></Head>
      <div style={S.loginCard}>
        <div style={{ fontSize: 52, marginBottom: 4 }}>📺</div>
        <h1 style={S.loginTitle}>Digital Signage</h1>
        <p style={S.loginSub}>Admin Dashboard</p>
        <input style={S.input} placeholder="Username (เว้นว่างใช้ legacy mode)" value={loginForm.username}
          onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))} />
        <input style={S.input} type="password" placeholder="Password" value={loginForm.password}
          onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && login()} />
        {authError && <p style={{ color: '#ff6584', fontSize: 13 }}>{authError}</p>}
        <button style={S.btnPrimary} onClick={login}>เข้าสู่ระบบ</button>
      </div>
    </div>
  );

  // ─── Dashboard ────────────────────────────────────────────
  return (
    <div style={S.page}>
      <Head><title>Admin — Digital Signage</title></Head>

      {toast && <div style={{ ...S.toast, background: toast.type === 'ok' ? '#43e97b' : '#ff6584' }}>{toast.msg}</div>}

      {emergency && (
        <div style={{ background: emergency.bgColor, color: emergency.textColor, padding: '9px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>🚨 ACTIVE: {emergency.title} — {emergency.message}</span>
          {canWrite && <button onClick={clearEmergency} style={{ background: 'rgba(0,0,0,0.2)', color: 'inherit', border: 'none', borderRadius: 8, padding: '3px 12px', cursor: 'pointer', fontSize: 13 }}>ยกเลิก ✕</button>}
        </div>
      )}

      {/* Header */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <span style={{ fontSize: 24 }}>📺</span>
          <div>
            <h1 style={S.headerTitle}>Digital Signage</h1>
            <p style={S.headerSub}>Admin Dashboard</p>
          </div>
        </div>
        <div style={S.headerRight}>
          {onlineCount > 0 && (
            <div style={S.liveChip}>
              <span style={S.liveDot} /> {onlineCount}/{screens.length} จอ Online
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 14px' }}>
            <span style={{ ...S.roleBadge, background: (roleColor[session.role] || '#888') + '22', color: roleColor[session.role] || '#888', borderColor: (roleColor[session.role] || '#888') + '44' }}>
              {roleLabel[session.role]}
            </span>
            <span style={{ fontSize: 13 }}>{session.username}</span>
            <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>ออก</button>
          </div>
          <a href="/display" target="_blank" style={S.btnSecondary}>🖥 TV</a>
          {canWrite && <button style={S.btnPrimary} onClick={() => setShowAdd(true)}>+ เพิ่มคอนเทนต์</button>}
        </div>
      </header>

      {/* Stats */}
      <div style={S.statsRow}>
        {[
          { icon: '🎬', value: items.length, label: 'คอนเทนต์ทั้งหมด' },
          { icon: '🖥', value: `${onlineCount}/${screens.length}`, label: 'Screens Online' },
          { icon: '📋', value: playlists.length, label: 'Playlists' },
          { icon: '🚨', value: emergency ? 'Active' : 'Off', label: 'Emergency', highlight: !!emergency },
        ].map(s => (
          <div key={s.label} style={{ ...S.statCard, borderColor: s.highlight ? '#ff6584' : 'var(--border)' }}>
            <div style={{ fontSize: 20 }}>{s.icon}</div>
            <div style={{ ...S.statVal, color: s.highlight ? '#ff6584' : 'var(--text)' }}>{s.value}</div>
            <div style={S.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {TABS.filter(t => !t.adminOnly || canAdmin).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ ...S.tab, ...(tab === t.key ? S.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={S.content}>

        {/* ═══ TAB: QUEUE ══════════════════════════════ */}
        {tab === 'queue' && (
          <>
            {playlists.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <button onClick={() => setFilterPlaylist('all')} style={{ ...S.chip, ...(filterPlaylist === 'all' ? S.chipActive : {}) }}>ทั้งหมด</button>
                {playlists.map(pl => (
                  <button key={pl.id} onClick={() => setFilterPlaylist(pl.id)}
                    style={{ ...S.chip, ...(filterPlaylist === pl.id ? { background: pl.color + '22', borderColor: pl.color, color: pl.color } : {}) }}>
                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: pl.color, marginRight: 5 }} />
                    {pl.name}
                  </button>
                ))}
              </div>
            )}
            {loading && <div style={S.empty}>⏳ กำลังโหลด...</div>}
            {!loading && filteredItems.length === 0 && (
              <div style={S.empty}><div style={{ fontSize: 44, marginBottom: 10 }}>🎬</div><p>ยังไม่มีคอนเทนต์</p></div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {filteredItems.map((item, i) => {
                const pl = playlists.find(p => p.id === item.playlistId);
                const isEditing = editingItemId === item.id;
                return (
                  <div key={item.id} draggable={canWrite && !isEditing}
                    onDragStart={() => !isEditing && onDragStart(item.id)} onDragOver={e => onDragOver(e, item.id)}
                    onDrop={() => onDrop(item.id)} onDragEnd={() => { setDragItem(null); setDragOver(null); }}
                    style={{ ...S.card, opacity: dragItem === item.id ? 0.4 : 1, borderColor: isEditing ? '#6c63ff' : dragOver === item.id ? '#6c63ff' : 'var(--border)', cursor: canWrite && !isEditing ? 'grab' : 'default', flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>

                    {/* ─── Normal view ─── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={S.orderBadge}>{item.order}</div>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        {item.type === 'youtube' && item.youtubeId
                          ? <img src={getYouTubeThumbnail(item.youtubeId)} style={S.thumb} alt="" />
                          : item.type === 'image' && item.contentUrl
                          ? <img src={item.contentUrl} style={S.thumb} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          : <div style={{ ...S.thumb, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>{typeIcon(item.type)}</div>}
                        <div style={S.typeTag}>{typeIcon(item.type)}</div>
                      </div>
                      <div style={S.cardInfo}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={S.cardTitle}>{item.title}</span>
                          {pl && <span style={{ ...S.plTag, background: pl.color + '18', color: pl.color, borderColor: pl.color + '40' }}>{pl.name}</span>}
                        </div>
                        <div style={S.cardMeta}>
                          <span>{typeLabel(item.type)}</span>
                          <span>⏱ {fmtDur(item.duration)}</span>
                          {item.scheduledStart && <span>📅 {new Date(item.scheduledStart).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}</span>}
                          <span style={{ color: item.active ? '#43e97b' : '#ff6584' }}>● {item.active ? 'Active' : 'Paused'}</span>
                        </div>
                      </div>
                      {canWrite && (
                        <div style={S.cardActions}>
                          <button style={S.iconBtn} title="Preview" onClick={() => setPreviewItem(item)}>▶</button>
                          <button style={{ ...S.iconBtn, color: '#6c63ff' }} title="แก้ไข" onClick={() => isEditing ? setEditingItemId(null) : startEditItem(item)}>✏️</button>
                          <button style={{ ...S.iconBtn, color: item.active ? '#ff6584' : '#43e97b' }} onClick={() => toggleActive(item)}>{item.active ? '⏸' : '▶'}</button>
                          <button style={{ ...S.iconBtn, color: '#ff6584' }} onClick={() => deleteItem(item.id)}>🗑</button>
                        </div>
                      )}
                    </div>

                    {/* ─── Inline edit panel ─── */}
                    {isEditing && (
                      <div style={{ marginTop: 12, padding: '14px 16px', background: 'var(--surface2)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
                          <div>
                            <label style={S.label}>ชื่อ</label>
                            <input style={S.input} value={editTitle} onChange={e => setEditTitle(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && saveEditItem(item)} />
                          </div>
                          <div>
                            <label style={S.label}>ระยะเวลา (วินาที)</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {/* Quick presets */}
                              {[15, 30, 60, 120, 300].map(sec => (
                                <button key={sec} onClick={() => setEditDuration(String(sec))}
                                  style={{ ...S.chip, padding: '4px 10px', fontSize: 11, ...(editDuration === String(sec) ? S.chipActive : {}) }}>
                                  {sec >= 60 ? `${sec/60}น.` : `${sec}ว.`}
                                </button>
                              ))}
                              <input style={{ ...S.input, width: 80, textAlign: 'center', fontFamily: 'Space Mono,monospace', fontWeight: 700 }}
                                type="number" min={5} value={editDuration} onChange={e => setEditDuration(e.target.value)} />
                              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>วิ</span>
                            </div>
                          </div>
                        </div>
                        {playlists.length > 0 && (
                          <div>
                            <label style={S.label}>Playlist</label>
                            <select style={{ ...S.input, maxWidth: 240 }} value={editPlaylistId} onChange={e => setEditPlaylistId(e.target.value)}>
                              <option value="">ไม่ระบุ</option>
                              {playlists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                            </select>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button style={S.btnPrimary} onClick={() => saveEditItem(item)}>💾 บันทึก</button>
                          <button style={S.btnGhost} onClick={() => setEditingItemId(null)}>ยกเลิก</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ═══ TAB: SCREENS ════════════════════════════ */}
        {tab === 'screens' && (
          <div>
            {canAdmin && (
              <div style={{ ...S.card, flexDirection: 'column', gap: 14, marginBottom: 24, cursor: 'default' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>เพิ่มจอแสดงผลใหม่</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10 }}>
                  <div>
                    <label style={S.label}>ชื่อจอ *</label>
                    <input style={S.input} placeholder="เช่น จอโถงหน้า" value={screenForm.name} onChange={e => setScreenForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.label}>ตำแหน่ง</label>
                    <input style={S.input} placeholder="เช่น ชั้น 1" value={screenForm.location} onChange={e => setScreenForm(f => ({ ...f, location: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.label}>Playlist</label>
                    <select style={S.input} value={screenForm.playlistId} onChange={e => setScreenForm(f => ({ ...f, playlistId: e.target.value }))}>
                      <option value="">ใช้คิวหลัก</option>
                      {playlists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button style={S.btnPrimary} onClick={addScreen}>+ เพิ่ม</button>
                  </div>
                </div>
              </div>
            )}

            {screens.length === 0 ? (
              <div style={S.empty}><div style={{ fontSize: 44, marginBottom: 10 }}>🖥</div><p>ยังไม่มีจอ กด "+ เพิ่ม" ด้านบน</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {screens.map(s => {
                  const online = isOnline(s);
                  const pl = playlists.find(p => p.id === s.playlistId);
                  const displayUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/display?screen=${s.id}`;
                  return (
                    <div key={s.id} style={{ ...S.card, cursor: 'default', borderColor: online ? 'rgba(67,233,123,0.3)' : 'var(--border)' }}>
                      {/* Status dot */}
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: online ? '#43e97b' : '#555', flexShrink: 0, boxShadow: online ? '0 0 8px #43e97b' : 'none' }} />
                      <div style={S.cardInfo}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={S.cardTitle}>{s.name}</span>
                          {s.location && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📍 {s.location}</span>}
                          <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 100, background: online ? 'rgba(67,233,123,0.12)' : 'var(--surface2)', color: online ? '#43e97b' : 'var(--text-muted)', border: `1px solid ${online ? 'rgba(67,233,123,0.3)' : 'var(--border)'}` }}>
                            {online ? '● Online' : '○ Offline'}
                          </span>
                        </div>
                        <div style={S.cardMeta}>
                          {pl && <span>📋 {pl.name}</span>}
                          {online && s.currentTitle && <span>▶ {s.currentTitle}</span>}
                          {s.lastSeen && <span>🕐 {new Date(s.lastSeen).toLocaleTimeString('th-TH')}</span>}
                        </div>
                        {/* URL to open on TV */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                          <code style={{ fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayUrl}
                          </code>
                          <button style={{ ...S.iconBtn, fontSize: 12, padding: '0 10px', width: 'auto' }}
                            onClick={() => { navigator.clipboard.writeText(displayUrl); showToast('คัดลอก URL แล้ว'); }}>
                            📋 Copy
                          </button>
                          <a href={displayUrl} target="_blank" style={{ ...S.iconBtn, textDecoration: 'none', fontSize: 12, padding: '0 10px', width: 'auto', display: 'flex', alignItems: 'center' }}>
                            🖥 เปิด
                          </a>
                        </div>
                      </div>
                      {canAdmin && (
                        <button style={{ ...S.iconBtn, color: '#ff6584', flexShrink: 0 }} onClick={() => deleteScreen(s.id)}>🗑</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: ANALYTICS ══════════════════════════ */}
        {tab === 'analytics' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ช่วง:</span>
              {[7, 14, 30].map(d => (
                <button key={d} onClick={() => setAnalyticsDays(d)} style={{ ...S.chip, ...(analyticsDays === d ? S.chipActive : {}) }}>{d} วัน</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
              {[
                { icon: '▶', label: 'ครั้งที่เล่น', value: totalPlays.toLocaleString() },
                { icon: '⏱', label: 'เวลารวม', value: fmtSecs(totalTime) },
                { icon: '🎬', label: 'คอนเทนต์ที่เล่น', value: new Set(analytics.map(e => e.itemId)).size },
              ].map(c => (
                <div key={c.label} style={S.statCard}>
                  <div style={{ fontSize: 20 }}>{c.icon}</div>
                  <div style={S.statVal}>{c.value}</div>
                  <div style={S.statLabel}>{c.label}</div>
                </div>
              ))}
            </div>
            <div style={{ ...S.card, flexDirection: 'column', gap: 14, marginBottom: 20, cursor: 'default' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600 }}>จำนวนครั้งที่เล่นรายวัน</h3>
              {chartDates.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>ยังไม่มีข้อมูล</div> : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                  {chartDates.map(date => {
                    const pct = ((byDate[date] || 0) / maxPlays) * 100;
                    return (
                      <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{byDate[date]}</div>
                        <div style={{ width: '100%', height: `${Math.max(pct, 4)}%`, background: 'linear-gradient(180deg,#6c63ff,#ff6584)', borderRadius: '4px 4px 0 0', transition: 'height 0.4s' }} />
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{date.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Top คอนเทนต์</h3>
            {topItems.length === 0 ? <div style={S.empty}>ยังไม่มีข้อมูล</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topItems.map((e, i) => (
                  <div key={e.itemId} style={{ ...S.card, cursor: 'default', gap: 12 }}>
                    <div style={{ ...S.orderBadge, background: i === 0 ? '#f7971e22' : 'var(--surface2)', color: i === 0 ? '#f7971e' : 'var(--text-muted)' }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{e.title}</div>
                      <div style={S.cardMeta}><span>{e.plays} ครั้ง</span><span>{fmtSecs(e.totalSeconds)}</span></div>
                    </div>
                    <div style={{ width: 100, height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${(e.plays / (topItems[0].plays || 1)) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#6c63ff,#ff6584)' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: PLAYLISTS ══════════════════════════ */}
        {tab === 'playlists' && (
          <div>
            {canWrite && (
              <div style={{ ...S.card, flexDirection: 'column', gap: 12, marginBottom: 20, cursor: 'default' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>สร้าง Playlist ใหม่</h3>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input style={{ ...S.input, flex: 1 }} placeholder="ชื่อ เช่น คิวเช้า" value={plForm.name} onChange={e => setPlForm(f => ({ ...f, name: e.target.value }))} />
                  <input type="color" value={plForm.color} onChange={e => setPlForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width: 44, height: 44, border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', background: 'none', padding: 2 }} />
                  <button style={S.btnPrimary} onClick={addPlaylist}>สร้าง</button>
                </div>
              </div>
            )}
            {playlists.length === 0 ? <div style={S.empty}>ยังไม่มี Playlist</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {playlists.map(pl => {
                  const isEditingPl = editingPlaylistId === pl.id;
                  const count = items.filter(v => v.playlistId === pl.id).length;
                  return (
                    <div key={pl.id} style={{ ...S.card, cursor: 'default', flexDirection: 'column', gap: 0, borderColor: isEditingPl ? '#6c63ff' : 'var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 14, height: 40, borderRadius: 4, background: pl.color, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{pl.name}</div>
                          <div style={S.cardMeta}><span>{count} คอนเทนต์</span></div>
                        </div>
                        {canWrite && (
                          <div style={S.cardActions}>
                            <button style={{ ...S.iconBtn, color: '#6c63ff' }} title="แก้ไข"
                              onClick={() => isEditingPl ? setEditingPlaylistId(null) : startEditPlaylist(pl)}>✏️</button>
                            <button style={{ ...S.iconBtn, color: '#ff6584' }} title="ลบ"
                              onClick={() => deletePlaylist(pl.id)}>🗑</button>
                          </div>
                        )}
                      </div>
                      {/* Inline edit */}
                      {isEditingPl && (
                        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                          <div style={{ flex: 1 }}>
                            <label style={S.label}>ชื่อ Playlist</label>
                            <input style={S.input} value={editPlName} onChange={e => setEditPlName(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && saveEditPlaylist(pl.id)} />
                          </div>
                          <div>
                            <label style={S.label}>สี</label>
                            <input type="color" value={editPlColor} onChange={e => setEditPlColor(e.target.value)}
                              style={{ width: 44, height: 44, border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', background: 'none', padding: 2 }} />
                          </div>
                          <button style={S.btnPrimary} onClick={() => saveEditPlaylist(pl.id)}>💾 บันทึก</button>
                          <button style={S.btnGhost} onClick={() => setEditingPlaylistId(null)}>ยกเลิก</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: USERS ══════════════════════════════ */}
        {tab === 'users' && canAdmin && (
          <div>
            <div style={{ ...S.card, flexDirection: 'column', gap: 14, marginBottom: 20, cursor: 'default' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>เพิ่ม User ใหม่</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px auto', gap: 10 }}>
                <div>
                  <label style={S.label}>Username *</label>
                  <input style={S.input} placeholder="username" value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>Password *</label>
                  <input style={S.input} type="password" placeholder="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>Role</label>
                  <select style={S.input} value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value as UserRole }))}>
                    <option value="superadmin">Super Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button style={S.btnPrimary} onClick={addUser}>+ เพิ่ม</button>
                </div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                <strong style={{ color: roleColor.superadmin }}>Super Admin</strong> — จัดการทุกอย่าง รวมถึง Users และ Screens<br/>
                <strong style={{ color: roleColor.editor }}>Editor</strong> — เพิ่ม/ลบ/แก้ไขคอนเทนต์ และ Emergency ได้<br/>
                <strong style={{ color: roleColor.viewer }}>Viewer</strong> — ดู Dashboard และ Analytics อย่างเดียว
              </div>
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Users ทั้งหมด</h3>
            {users.length === 0 ? <div style={S.empty}>ยังไม่มี User (ใช้ legacy mode อยู่)</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {users.map(u => (
                  <div key={u.id} style={{ ...S.card, cursor: 'default' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: (roleColor[u.role] || '#888') + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                      👤
                    </div>
                    <div style={S.cardInfo}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={S.cardTitle}>{u.username}</span>
                        <span style={{ ...S.roleBadge, background: (roleColor[u.role] || '#888') + '18', color: roleColor[u.role] || '#888', borderColor: (roleColor[u.role] || '#888') + '40' }}>
                          {roleLabel[u.role]}
                        </span>
                      </div>
                      <div style={S.cardMeta}>
                        <span>สร้าง {new Date(u.createdAt).toLocaleDateString('th-TH')}</span>
                        {u.lastLogin && <span>เข้าล่าสุด {new Date(u.lastLogin).toLocaleDateString('th-TH')}</span>}
                      </div>
                    </div>
                    {u.username !== session?.username && (
                      <button style={{ ...S.iconBtn, color: '#ff6584', flexShrink: 0 }} onClick={() => deleteUser(u.id, u.username)}>🗑</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: EMERGENCY ══════════════════════════ */}
        {tab === 'emergency' && (
          <div style={{ maxWidth: 600 }}>
            {emergency && (
              <div style={{ borderRadius: 16, padding: '18px 22px', marginBottom: 20, background: emergency.bgColor, color: emergency.textColor }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 6, opacity: 0.7 }}>🚨 ACTIVE EMERGENCY</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{emergency.title}</div>
                <div style={{ fontSize: 15 }}>{emergency.message}</div>
                {canWrite && (
                  <button onClick={clearEmergency} style={{ marginTop: 14, background: 'rgba(0,0,0,0.25)', color: 'inherit', border: 'none', borderRadius: 10, padding: '7px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    ✕ ยกเลิกประกาศ
                  </button>
                )}
              </div>
            )}
            {canWrite && (
              <div style={{ ...S.card, flexDirection: 'column', gap: 16, cursor: 'default', padding: 22 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>🚨 Emergency Override</div>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>ส่งประกาศขึ้นจอทุกจอทันที แทรกทุกคิว</p>
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div><label style={S.label}>หัวข้อ</label><input style={S.input} value={emForm.title} onChange={e => setEmForm(f => ({ ...f, title: e.target.value }))} /></div>
                  <div><label style={S.label}>ข้อความ *</label>
                    <textarea style={{ ...S.input, minHeight: 72, resize: 'vertical' }} value={emForm.message}
                      onChange={e => setEmForm(f => ({ ...f, message: e.target.value }))} placeholder="ข้อความที่จะวิ่งบนจอ..." />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div><label style={S.label}>สีพื้นหลัง</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="color" value={emForm.bgColor} onChange={e => setEmForm(f => ({ ...f, bgColor: e.target.value }))} style={{ width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'none', padding: 2 }} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emForm.bgColor}</span>
                      </div>
                    </div>
                    <div><label style={S.label}>สีข้อความ</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="color" value={emForm.textColor} onChange={e => setEmForm(f => ({ ...f, textColor: e.target.value }))} style={{ width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'none', padding: 2 }} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emForm.textColor}</span>
                      </div>
                    </div>
                    <div><label style={S.label}>หมดอายุ (นาที)</label>
                      <input style={S.input} type="number" min={1} value={emForm.expiresIn} onChange={e => setEmForm(f => ({ ...f, expiresIn: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ borderRadius: 12, padding: '14px 18px', background: emForm.bgColor, color: emForm.textColor }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, marginBottom: 4, opacity: 0.65 }}>PREVIEW</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{emForm.title || 'หัวข้อ'}</div>
                    <div style={{ fontSize: 13, marginTop: 2 }}>{emForm.message || 'ข้อความวิ่งบนจอ...'}</div>
                  </div>
                </div>
                <button style={{ ...S.btnPrimary, background: '#dc2626', fontSize: 14, padding: '11px 24px', alignSelf: 'flex-start' }}
                  onClick={sendEmergency} disabled={saving}>
                  🚨 {saving ? 'กำลังส่ง...' : 'ส่งประกาศฉุกเฉิน'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: SETTINGS ═══════════════════════════ */}
        {tab === 'settings' && canWrite && (
          <div style={{ maxWidth: 560 }}>
            <div style={{ ...S.card, flexDirection: 'column', gap: 20, cursor: 'default', padding: 24 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>⚙️ Display Settings</div>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>ตั้งค่าความถี่ในการรีเฟรชของหน้าจอ TV ทุกจอ — มีผลทันทีในรอบถัดไป</p>
              </div>

              {/* Refresh Interval */}
              <div style={{ background: 'var(--surface2)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🔄 Playlist Refresh Interval</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      ทุกกี่วินาทีที่ TV จะดึงข้อมูล Playlist ใหม่จาก Server<br/>
                      ค่าน้อย = เห็นการเปลี่ยนแปลงเร็ว แต่ใช้ Quota API มากขึ้น<br/>
                      <span style={{ color: '#f7971e' }}>แนะนำ: 30–60 วินาที</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <input
                      style={{ ...S.input, width: 90, textAlign: 'center', fontSize: 20, fontWeight: 700, fontFamily: 'Space Mono,monospace' }}
                      type="number" min={5} max={3600}
                      value={settings.refreshInterval}
                      onChange={e => setSettings(p => ({ ...p, refreshInterval: e.target.value }))}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 28 }}>วิ</span>
                  </div>
                </div>
                {/* Visual slider */}
                <input type="range" min={5} max={300} step={5}
                  value={parseInt(settings.refreshInterval) || 30}
                  onChange={e => setSettings(p => ({ ...p, refreshInterval: e.target.value }))}
                  style={{ width: '100%', marginTop: 12, accentColor: '#6c63ff', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>5 วิ (เร็ว)</span><span>60 วิ</span><span>120 วิ</span><span>300 วิ (ช้า)</span>
                </div>
              </div>

              {/* Emergency Poll */}
              <div style={{ background: 'var(--surface2)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🚨 Emergency Check Interval</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      ทุกกี่วินาทีที่ TV จะตรวจสอบ Emergency Alert<br/>
                      <span style={{ color: '#ff6584' }}>แนะนำ: 10–20 วินาที (ควรน้อยกว่า Refresh)</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <input
                      style={{ ...S.input, width: 90, textAlign: 'center', fontSize: 20, fontWeight: 700, fontFamily: 'Space Mono,monospace' }}
                      type="number" min={5} max={300}
                      value={settings.emergencyPoll}
                      onChange={e => setSettings(p => ({ ...p, emergencyPoll: e.target.value }))}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 28 }}>วิ</span>
                  </div>
                </div>
                <input type="range" min={5} max={120} step={5}
                  value={parseInt(settings.emergencyPoll) || 15}
                  onChange={e => setSettings(p => ({ ...p, emergencyPoll: e.target.value }))}
                  style={{ width: '100%', marginTop: 12, accentColor: '#ff6584', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>5 วิ</span><span>30 วิ</span><span>60 วิ</span><span>120 วิ</span>
                </div>
              </div>

              {/* Summary */}
              <div style={{ background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12, padding: '14px 18px', fontSize: 13, lineHeight: 1.8, color: 'var(--text-muted)' }}>
                📺 TV จะดึง Playlist ใหม่ทุก <strong style={{ color: 'var(--text)' }}>{settings.refreshInterval} วินาที</strong><br/>
                🚨 TV จะตรวจ Emergency ทุก <strong style={{ color: 'var(--text)' }}>{settings.emergencyPoll} วินาที</strong><br/>
                ⚡ การเปลี่ยนแปลงมีผลใน <strong style={{ color: '#43e97b' }}>รอบ Heartbeat ถัดไป</strong> (ไม่ต้องรีโหลด TV)
              </div>

              <button style={{ ...S.btnPrimary, alignSelf: 'flex-start', fontSize: 14, padding: '11px 28px' }}
                onClick={saveSettings} disabled={settingsSaving}>
                {settingsSaving ? '⏳ กำลังบันทึก...' : '💾 บันทึก Settings'}
              </button>
            </div>
          </div>
        )}

      </div>

      {showAdd && (
        <div style={S.modalBg} onClick={() => setShowAdd(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>เพิ่มคอนเทนต์ใหม่</h2>
              <button style={S.closeBtn} onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div style={S.modalBody}>
              <label style={S.label}>URL * (YouTube / รูป / MP4 / เว็บ)</label>
              <input style={S.input} placeholder="https://..." value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              {urlType && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                  <span style={{ fontSize: 18 }}>{typeIcon(urlType)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ตรวจพบ: {typeLabel(urlType)}</span>
                  {urlYtId && <img src={getYouTubeThumbnail(urlYtId)} style={{ width: 72, height: 40, borderRadius: 6, objectFit: 'cover' }} alt="" />}
                </div>
              )}
              <label style={S.label}>ชื่อ</label>
              <input style={S.input} placeholder="ชื่อคอนเทนต์" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <label style={S.label}>ระยะเวลาแสดง (วินาที)</label>
              <input style={S.input} type="number" min={5} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: parseInt(e.target.value) || 60 }))} />
              {playlists.length > 0 && (
                <><label style={S.label}>Playlist</label>
                <select style={S.input} value={form.playlistId} onChange={e => setForm(f => ({ ...f, playlistId: e.target.value }))}>
                  <option value="">ไม่ระบุ</option>
                  {playlists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                </select></>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={S.label}>เริ่มแสดง</label><input style={S.input} type="datetime-local" value={form.scheduledStart} onChange={e => setForm(f => ({ ...f, scheduledStart: e.target.value }))} /></div>
                <div><label style={S.label}>หยุดแสดง</label><input style={S.input} type="datetime-local" value={form.scheduledEnd} onChange={e => setForm(f => ({ ...f, scheduledEnd: e.target.value }))} /></div>
              </div>
            </div>
            <div style={S.modalFoot}>
              <button style={S.btnGhost} onClick={() => setShowAdd(false)}>ยกเลิก</button>
              <button style={S.btnPrimary} onClick={addItem} disabled={saving}>{saving ? 'กำลังบันทึก...' : '+ เพิ่ม'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Preview Modal ════════════════════════════ */}
      {previewItem && (
        <div style={S.modalBg} onClick={() => setPreviewItem(null)}>
          <div style={{ ...S.modal, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>{previewItem.title}</h2>
              <button style={S.closeBtn} onClick={() => setPreviewItem(null)}>✕</button>
            </div>
            <div style={{ background: '#000', borderRadius: '0 0 16px 16px', overflow: 'hidden' }}>
              {previewItem.type === 'youtube' && previewItem.youtubeId && (
                <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                  <iframe style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                    src={`https://www.youtube.com/embed/${previewItem.youtubeId}?autoplay=1&controls=1`} allowFullScreen allow="autoplay" />
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

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--bg)', paddingBottom: 60 },
  loginBg: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 60% 40%,#1a1040 0%,#0a0a0f 70%)' },
  loginCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '44px 40px', width: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 32px 64px rgba(0,0,0,0.5)' },
  loginTitle: { fontSize: 22, fontWeight: 700 },
  loginSub: { fontSize: 13, color: 'var(--text-muted)', marginTop: -6 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px', borderBottom: '1px solid var(--border)', background: 'rgba(17,17,24,0.92)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 16, fontWeight: 700 },
  headerSub: { fontSize: 11, color: 'var(--text-muted)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  liveChip: { display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(67,233,123,0.1)', border: '1px solid rgba(67,233,123,0.28)', borderRadius: 100, padding: '5px 13px', fontSize: 12, color: '#43e97b' },
  liveDot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#43e97b', boxShadow: '0 0 7px #43e97b' },
  roleBadge: { fontSize: 11, padding: '1px 9px', borderRadius: 100, border: '1px solid', fontWeight: 600 },
  statsRow: { display: 'flex', gap: 12, padding: '18px 28px' },
  statCard: { flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 3 },
  statVal: { fontSize: 26, fontWeight: 700, fontFamily: 'Space Mono,monospace' },
  statLabel: { fontSize: 11, color: 'var(--text-muted)' },
  tabs: { display: 'flex', gap: 2, padding: '0 28px', borderBottom: '1px solid var(--border)' },
  tab: { background: 'none', border: 'none', color: 'var(--text-muted)', padding: '11px 16px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabActive: { color: 'var(--text)', borderBottomColor: 'var(--accent)' },
  content: { padding: '22px 28px' },
  chip: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 100, padding: '5px 13px', fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' },
  chipActive: { background: 'rgba(108,99,255,0.14)', borderColor: '#6c63ff', color: '#6c63ff' },
  card: { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px', transition: 'border-color 0.15s', userSelect: 'none' },
  orderBadge: { minWidth: 26, height: 26, borderRadius: 7, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'Space Mono,monospace', color: 'var(--text-muted)', flexShrink: 0 },
  thumb: { width: 84, height: 48, objectFit: 'cover', borderRadius: 7, display: 'block' },
  typeTag: { position: 'absolute', bottom: 3, right: 3, fontSize: 11, background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '1px 4px' },
  cardInfo: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  cardMeta: { display: 'flex', gap: 10, marginTop: 3, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' },
  plTag: { fontSize: 10, padding: '1px 7px', borderRadius: 100, border: '1px solid' },
  cardActions: { display: 'flex', gap: 5, flexShrink: 0 },
  iconBtn: { width: 32, height: 32, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', padding: '44px 20px', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 14, border: '1px dashed var(--border)' },
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 540, boxShadow: '0 32px 64px rgba(0,0,0,0.6)' },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid var(--border)' },
  modalBody: { padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10 },
  modalFoot: { display: 'flex', gap: 9, justifyContent: 'flex-end', padding: '13px 22px', borderTop: '1px solid var(--border)' },
  closeBtn: { width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15 },
  label: { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 5 },
  input: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 13px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  btnPrimary: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  btnSecondary: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 },
  btnGhost: { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  toast: { position: 'fixed', bottom: 22, right: 22, padding: '11px 18px', borderRadius: 11, fontWeight: 600, fontSize: 13, zIndex: 999, color: '#000', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' },
};
