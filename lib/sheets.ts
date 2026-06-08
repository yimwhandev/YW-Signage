import { google } from 'googleapis';
import { MediaItem, EmergencyAlert, Playlist, AnalyticsEntry } from './types';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const MEDIA_SHEET = 'Videos';
const EMERGENCY_SHEET = 'Emergency';
const PLAYLIST_SHEET = 'Playlists';
const ANALYTICS_SHEET = 'Analytics';

const MEDIA_HEADERS = ['id','title','type','youtubeUrl','youtubeId','contentUrl','duration','order','active','scheduledStart','scheduledEnd','addedAt','playlistId'];
const EMERGENCY_HEADERS = ['id','title','message','bgColor','textColor','active','createdAt','expiresAt'];
const PLAYLIST_HEADERS = ['id','name','color','scheduledStart','scheduledEnd'];
const ANALYTICS_HEADERS = ['date','itemId','title','plays','totalSeconds'];

function getAuth() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    privateKey,
    SCOPES
  );
}

export async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

async function ensureHeaders(sheets: Awaited<ReturnType<typeof getSheetsClient>>, sheetName: string, headers: string[]) {
  const sheetId = process.env.GOOGLE_SHEET_ID!;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
    });
    if (!res.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    }
  } catch {
    // Sheet may not exist — Spreadsheet must have the tab created manually
  }
}

// ─── MEDIA ───────────────────────────────────────────────────
export async function getMediaFromSheet(): Promise<MediaItem[]> {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;
  await ensureHeaders(sheets, MEDIA_SHEET, MEDIA_HEADERS);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${MEDIA_SHEET}!A:M`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  return rows.slice(1)
    .filter(r => r[0])
    .map(r => ({
      id: r[0] || '',
      title: r[1] || '',
      type: (r[2] as MediaItem['type']) || 'youtube',
      youtubeUrl: r[3] || undefined,
      youtubeId: r[4] || undefined,
      contentUrl: r[5] || undefined,
      duration: parseInt(r[6]) || 60,
      order: parseInt(r[7]) || 0,
      active: r[8] === 'TRUE',
      scheduledStart: r[9] || undefined,
      scheduledEnd: r[10] || undefined,
      addedAt: r[11] || '',
      playlistId: r[12] || undefined,
    }))
    .sort((a, b) => a.order - b.order);
}

export async function addMediaToSheet(item: MediaItem): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;
  await ensureHeaders(sheets, MEDIA_SHEET, MEDIA_HEADERS);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${MEDIA_SHEET}!A:M`,
    valueInputOption: 'RAW',
    requestBody: { values: [mediaToRow(item)] },
  });
}

export async function updateMediaRow(item: MediaItem, rowIndex: number): Promise<void> {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    range: `${MEDIA_SHEET}!A${rowIndex}:M${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [mediaToRow(item)] },
  });
}

export async function deleteMediaRow(rowIndex: number): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const sheet = meta.data.sheets?.find(s => s.properties?.title === MEDIA_SHEET);
  const gid = sheet?.properties?.sheetId ?? 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [{ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } } }],
    },
  });
}

export async function reorderMediaSheet(items: MediaItem[]): Promise<void> {
  const sheets = await getSheetsClient();
  const reordered = items.map((v, i) => ({ ...v, order: i + 1 }));
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    range: `${MEDIA_SHEET}!A2:M${reordered.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: reordered.map(mediaToRow) },
  });
}

function mediaToRow(item: MediaItem): string[] {
  return [
    item.id, item.title, item.type,
    item.youtubeUrl || '', item.youtubeId || '', item.contentUrl || '',
    String(item.duration), String(item.order), item.active ? 'TRUE' : 'FALSE',
    item.scheduledStart || '', item.scheduledEnd || '', item.addedAt, item.playlistId || '',
  ];
}

// ─── EMERGENCY ───────────────────────────────────────────────
export async function getEmergency(): Promise<EmergencyAlert | null> {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${EMERGENCY_SHEET}!A:H`,
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) return null;

    const active = rows.slice(1)
      .filter(r => r[0] && r[5] === 'TRUE')
      .map(r => ({
        id: r[0], title: r[1], message: r[2],
        bgColor: r[3] || '#ff0000', textColor: r[4] || '#ffffff',
        active: r[5] === 'TRUE', createdAt: r[6], expiresAt: r[7] || undefined,
      }))
      .filter(e => !e.expiresAt || new Date(e.expiresAt) > new Date());

    return active[0] || null;
  } catch { return null; }
}

export async function setEmergency(alert: EmergencyAlert): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;
  await ensureHeaders(sheets, EMERGENCY_SHEET, EMERGENCY_HEADERS);

  // Clear all first
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${EMERGENCY_SHEET}!A:H` });
  const rows = res.data.values || [];
  if (rows.length > 1) {
    await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId, range: `${EMERGENCY_SHEET}!A2:H` });
  }

  if (alert.active) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${EMERGENCY_SHEET}!A:H`,
      valueInputOption: 'RAW',
      requestBody: { values: [[alert.id, alert.title, alert.message, alert.bgColor, alert.textColor, 'TRUE', alert.createdAt, alert.expiresAt || '']] },
    });
  }
}

export async function clearEmergency(): Promise<void> {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    range: `${EMERGENCY_SHEET}!A2:H`,
  });
}

// ─── PLAYLISTS ───────────────────────────────────────────────
export async function getPlaylists(): Promise<Playlist[]> {
  const sheets = await getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID!,
      range: `${PLAYLIST_SHEET}!A:E`,
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) return [];
    return rows.slice(1).filter(r => r[0]).map(r => ({
      id: r[0], name: r[1], color: r[2] || '#6c63ff',
      scheduledStart: r[3] || undefined, scheduledEnd: r[4] || undefined,
    }));
  } catch { return []; }
}

export async function addPlaylist(pl: Playlist): Promise<void> {
  const sheets = await getSheetsClient();
  await ensureHeaders(sheets, PLAYLIST_SHEET, PLAYLIST_HEADERS);
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    range: `${PLAYLIST_SHEET}!A:E`,
    valueInputOption: 'RAW',
    requestBody: { values: [[pl.id, pl.name, pl.color, pl.scheduledStart || '', pl.scheduledEnd || '']] },
  });
}

// ─── ANALYTICS ───────────────────────────────────────────────
export async function logPlay(itemId: string, title: string, seconds: number): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;
  await ensureHeaders(sheets, ANALYTICS_SHEET, ANALYTICS_HEADERS);

  const today = new Date().toISOString().slice(0, 10);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${ANALYTICS_SHEET}!A:E` });
  const rows = res.data.values || [];

  const existingIdx = rows.findIndex((r, i) => i > 0 && r[0] === today && r[1] === itemId);
  if (existingIdx > 0) {
    const row = rows[existingIdx];
    const newPlays = (parseInt(row[3]) || 0) + 1;
    const newSecs = (parseInt(row[4]) || 0) + seconds;
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${ANALYTICS_SHEET}!D${existingIdx + 1}:E${existingIdx + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[String(newPlays), String(newSecs)]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${ANALYTICS_SHEET}!A:E`,
      valueInputOption: 'RAW',
      requestBody: { values: [[today, itemId, title, '1', String(seconds)]] },
    });
  }
}

export async function getAnalytics(days = 7): Promise<AnalyticsEntry[]> {
  const sheets = await getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID!,
      range: `${ANALYTICS_SHEET}!A:E`,
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return rows.slice(1)
      .filter(r => r[0] && new Date(r[0]) >= cutoff)
      .map(r => ({ date: r[0], itemId: r[1], title: r[2], plays: parseInt(r[3]) || 0, totalSeconds: parseInt(r[4]) || 0 }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch { return []; }
}

// Backwards compat aliases
export const getVideosFromSheet = getMediaFromSheet;
export const addVideoToSheet = addMediaToSheet;
export const updateSheetRow = updateMediaRow;
export const deleteSheetRow = deleteMediaRow;
export const reorderSheet = reorderMediaSheet;
