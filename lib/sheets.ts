import { google } from 'googleapis';
import { MediaItem, EmergencyAlert, Playlist, AnalyticsEntry, Screen, User } from './types';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TAB = { MEDIA: 'Videos', EMERGENCY: 'Emergency', PLAYLISTS: 'Playlists', ANALYTICS: 'Analytics', SCREENS: 'Screens', USERS: 'Users' } as const;

function getAuth() {
  return new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, undefined,
    process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'), SCOPES
  );
}
async function gs() { return google.sheets({ version: 'v4', auth: getAuth() }); }
const ID = () => process.env.GOOGLE_SHEET_ID!;

async function getRows(tab: string, range: string): Promise<string[][]> {
  const s = await gs();
  try {
    const res = await s.spreadsheets.values.get({ spreadsheetId: ID(), range: `${tab}!${range}` });
    return (res.data.values || []) as string[][];
  } catch { return []; }
}

async function appendRow(tab: string, values: string[]): Promise<void> {
  const s = await gs();
  await s.spreadsheets.values.append({
    spreadsheetId: ID(), range: `${tab}!A1`, valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

async function updateRow(tab: string, rowIndex: number, values: string[]): Promise<void> {
  const s = await gs();
  await s.spreadsheets.values.update({
    spreadsheetId: ID(),
    range: `${tab}!A${rowIndex}:${String.fromCharCode(64 + values.length)}${rowIndex}`,
    valueInputOption: 'RAW', requestBody: { values: [values] },
  });
}

async function deleteRow(tab: string, rowIndex: number): Promise<void> {
  const s = await gs();
  const meta = await s.spreadsheets.get({ spreadsheetId: ID() });
  const sheet = meta.data.sheets?.find(sh => sh.properties?.title === tab);
  const gid = sheet?.properties?.sheetId ?? 0;
  await s.spreadsheets.batchUpdate({
    spreadsheetId: ID(),
    requestBody: { requests: [{ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } } }] },
  });
}

async function ensureHeader(tab: string, headers: string[]): Promise<void> {
  const rows = await getRows(tab, `A1:${String.fromCharCode(64 + headers.length)}1`);
  if (!rows.length) await appendRow(tab, headers);
}

// ─── MEDIA ───────────────────────────────────────────────────
const MEDIA_H = ['id','title','type','youtubeUrl','youtubeId','contentUrl','duration','order','active','scheduledStart','scheduledEnd','addedAt','playlistId'];

function rowToMedia(r: string[]): MediaItem {
  return {
    id: r[0]||'', title: r[1]||'', type: (r[2]||'youtube') as MediaItem['type'],
    youtubeUrl: r[3]||undefined, youtubeId: r[4]||undefined, contentUrl: r[5]||undefined,
    duration: parseInt(r[6])||60, order: parseInt(r[7])||0, active: r[8]==='TRUE',
    scheduledStart: r[9]||undefined, scheduledEnd: r[10]||undefined, addedAt: r[11]||'', playlistId: r[12]||undefined,
  };
}
function mediaToRow(m: MediaItem): string[] {
  return [m.id, m.title, m.type, m.youtubeUrl||'', m.youtubeId||'', m.contentUrl||'',
    String(m.duration), String(m.order), m.active?'TRUE':'FALSE',
    m.scheduledStart||'', m.scheduledEnd||'', m.addedAt, m.playlistId||''];
}

export async function getMediaFromSheet(): Promise<MediaItem[]> {
  const rows = await getRows(TAB.MEDIA, 'A:M');
  return rows.slice(1).filter(r=>r[0]).map(rowToMedia).sort((a,b)=>a.order-b.order);
}
export async function addMediaToSheet(m: MediaItem): Promise<void> {
  await ensureHeader(TAB.MEDIA, MEDIA_H);
  await appendRow(TAB.MEDIA, mediaToRow(m));
}
export async function updateMediaRow(m: MediaItem, rowIndex: number): Promise<void> {
  await updateRow(TAB.MEDIA, rowIndex, mediaToRow(m));
}
export async function deleteMediaRow(rowIndex: number): Promise<void> {
  await deleteRow(TAB.MEDIA, rowIndex);
}
export async function reorderMediaSheet(items: MediaItem[]): Promise<void> {
  const s = await gs();
  const reordered = items.map((v,i)=>({...v,order:i+1}));
  await s.spreadsheets.values.update({
    spreadsheetId: ID(), range: `${TAB.MEDIA}!A2:M${reordered.length+1}`,
    valueInputOption: 'RAW', requestBody: { values: reordered.map(mediaToRow) },
  });
}

// ─── EMERGENCY ───────────────────────────────────────────────
const EM_H = ['id','title','message','bgColor','textColor','active','createdAt','expiresAt'];

export async function getEmergency(): Promise<EmergencyAlert|null> {
  const rows = await getRows(TAB.EMERGENCY, 'A:H');
  const active = rows.slice(1)
    .filter(r=>r[0]&&r[5]==='TRUE')
    .map(r=>({ id:r[0],title:r[1],message:r[2],bgColor:r[3]||'#dc2626',textColor:r[4]||'#ffffff',active:true,createdAt:r[6],expiresAt:r[7]||undefined }))
    .filter(e=>!e.expiresAt||new Date(e.expiresAt)>new Date());
  return active[0]||null;
}
export async function setEmergency(alert: EmergencyAlert): Promise<void> {
  await ensureHeader(TAB.EMERGENCY, EM_H);
  const s = await gs();
  await s.spreadsheets.values.clear({ spreadsheetId: ID(), range: `${TAB.EMERGENCY}!A2:H` });
  if (alert.active) await appendRow(TAB.EMERGENCY, [alert.id,alert.title,alert.message,alert.bgColor,alert.textColor,'TRUE',alert.createdAt,alert.expiresAt||'']);
}
export async function clearEmergency(): Promise<void> {
  const s = await gs();
  await s.spreadsheets.values.clear({ spreadsheetId: ID(), range: `${TAB.EMERGENCY}!A2:H` });
}

// ─── PLAYLISTS ───────────────────────────────────────────────
const PL_H = ['id','name','color','scheduledStart','scheduledEnd'];

export async function getPlaylists(): Promise<Playlist[]> {
  const rows = await getRows(TAB.PLAYLISTS, 'A:E');
  return rows.slice(1).filter(r=>r[0]).map(r=>({ id:r[0],name:r[1],color:r[2]||'#6c63ff',scheduledStart:r[3]||undefined,scheduledEnd:r[4]||undefined }));
}
export async function addPlaylist(pl: Playlist): Promise<void> {
  await ensureHeader(TAB.PLAYLISTS, PL_H);
  await appendRow(TAB.PLAYLISTS, [pl.id,pl.name,pl.color,pl.scheduledStart||'',pl.scheduledEnd||'']);
}

// ─── ANALYTICS ───────────────────────────────────────────────
const AN_H = ['date','itemId','title','plays','totalSeconds','screenId'];

export async function logPlay(itemId: string, title: string, seconds: number, screenId?: string): Promise<void> {
  await ensureHeader(TAB.ANALYTICS, AN_H);
  const today = new Date().toISOString().slice(0,10);
  const rows = await getRows(TAB.ANALYTICS, 'A:F');
  const idx = rows.findIndex((r,i)=>i>0&&r[0]===today&&r[1]===itemId&&(r[5]||'')===(screenId||''));
  if (idx > 0) {
    const updated = [...rows[idx]];
    updated[3] = String((parseInt(updated[3])||0)+1);
    updated[4] = String((parseInt(updated[4])||0)+seconds);
    await updateRow(TAB.ANALYTICS, idx+1, updated);
  } else {
    await appendRow(TAB.ANALYTICS, [today,itemId,title,'1',String(seconds),screenId||'']);
  }
}
export async function getAnalytics(days=7): Promise<AnalyticsEntry[]> {
  const rows = await getRows(TAB.ANALYTICS, 'A:F');
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days);
  return rows.slice(1).filter(r=>r[0]&&new Date(r[0])>=cutoff)
    .map(r=>({ date:r[0],itemId:r[1],title:r[2],plays:parseInt(r[3])||0,totalSeconds:parseInt(r[4])||0,screenId:r[5]||undefined }))
    .sort((a,b)=>b.date.localeCompare(a.date));
}

// ─── SCREENS ─────────────────────────────────────────────────
const SC_H = ['id','name','location','playlistId','active','createdAt','lastSeen','currentIndex','currentTitle'];

function rowToScreen(r: string[]): Screen {
  return { id:r[0],name:r[1],location:r[2],playlistId:r[3],active:r[4]==='TRUE',createdAt:r[5],lastSeen:r[6]||undefined,currentIndex:parseInt(r[7])||0,currentTitle:r[8]||undefined };
}

export async function getScreens(): Promise<Screen[]> {
  const rows = await getRows(TAB.SCREENS, 'A:I');
  return rows.slice(1).filter(r=>r[0]).map(rowToScreen);
}
export async function addScreen(screen: Screen): Promise<void> {
  await ensureHeader(TAB.SCREENS, SC_H);
  await appendRow(TAB.SCREENS, [screen.id,screen.name,screen.location,screen.playlistId,screen.active?'TRUE':'FALSE',screen.createdAt,'','0','']);
}
export async function updateScreenHeartbeat(screenId: string, index: number, title: string): Promise<void> {
  const rows = await getRows(TAB.SCREENS, 'A:I');
  const idx = rows.findIndex((r,i)=>i>0&&r[0]===screenId);
  if (idx<0) return;
  const updated = [...rows[idx]];
  updated[6]=new Date().toISOString(); updated[7]=String(index); updated[8]=title;
  await updateRow(TAB.SCREENS, idx+1, updated);
}
export async function deleteScreen(screenId: string): Promise<void> {
  const rows = await getRows(TAB.SCREENS, 'A:A');
  const idx = rows.findIndex((r,i)=>i>0&&r[0]===screenId);
  if (idx<0) return;
  await deleteRow(TAB.SCREENS, idx+1);
}

// ─── USERS ───────────────────────────────────────────────────
const US_H = ['id','username','passwordHash','role','createdAt','lastLogin'];

export async function getUsers(): Promise<User[]> {
  const rows = await getRows(TAB.USERS, 'A:F');
  return rows.slice(1).filter(r=>r[0]).map(r=>({ id:r[0],username:r[1],passwordHash:r[2],role:(r[3]||'viewer') as User['role'],createdAt:r[4],lastLogin:r[5]||undefined }));
}
export async function addUser(user: User): Promise<void> {
  await ensureHeader(TAB.USERS, US_H);
  await appendRow(TAB.USERS, [user.id,user.username,user.passwordHash,user.role,user.createdAt,'']);
}
export async function updateUserLastLogin(userId: string): Promise<void> {
  const rows = await getRows(TAB.USERS, 'A:A');
  const idx = rows.findIndex((r,i)=>i>0&&r[0]===userId);
  if (idx<0) return;
  const s = await gs();
  await s.spreadsheets.values.update({ spreadsheetId: ID(), range: `${TAB.USERS}!F${idx+1}`, valueInputOption: 'RAW', requestBody: { values: [[new Date().toISOString()]] } });
}
export async function deleteUser(userId: string): Promise<void> {
  const rows = await getRows(TAB.USERS, 'A:A');
  const idx = rows.findIndex((r,i)=>i>0&&r[0]===userId);
  if (idx<0) return;
  await deleteRow(TAB.USERS, idx+1);
}

// ─── Backward compat aliases ─────────────────────────────────
export const getSheetsClient = gs;
export const getVideosFromSheet = getMediaFromSheet;
export const addVideoToSheet = addMediaToSheet;
export const updateSheetRow = updateMediaRow;
export const deleteSheetRow = deleteMediaRow;
export const reorderSheet = reorderMediaSheet;

// ─── SETTINGS ────────────────────────────────────────────────
const SET_H = ['key', 'value', 'label'];

export async function getSetting(key: string): Promise<string | null> {
  const rows = await getRows('Settings', 'A:C');
  const row = rows.find((r, i) => i > 0 && r[0] === key);
  return row ? (row[1] ?? null) : null;
}

export async function setSetting(key: string, value: string, label?: string): Promise<void> {
  await ensureHeader('Settings', SET_H);
  const rows = await getRows('Settings', 'A:C');
  const idx = rows.findIndex((r, i) => i > 0 && r[0] === key);
  if (idx > 0) {
    await updateRow('Settings', idx + 1, [key, value, label ?? rows[idx][2] ?? '']);
  } else {
    await appendRow('Settings', [key, value, label ?? '']);
  }
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await getRows('Settings', 'A:C');
  const out: Record<string, string> = {};
  rows.slice(1).filter(r => r[0]).forEach(r => { out[r[0]] = r[1] ?? ''; });
  return out;
}
