import { google } from 'googleapis';
import { VideoItem } from './types';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SHEET_NAME = 'Videos';
const HEADERS = ['id','title','youtubeUrl','youtubeId','duration','order','active','scheduledStart','scheduledEnd','addedAt'];

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

export async function getVideosFromSheet(): Promise<VideoItem[]> {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!A:J`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  return rows.slice(1)
    .filter(row => row[0])
    .map(row => ({
      id: row[0] || '',
      title: row[1] || '',
      youtubeUrl: row[2] || '',
      youtubeId: row[3] || '',
      duration: parseInt(row[4]) || 60,
      order: parseInt(row[5]) || 0,
      active: row[6] === 'TRUE',
      scheduledStart: row[7] || undefined,
      scheduledEnd: row[8] || undefined,
      addedAt: row[9] || '',
    }))
    .sort((a, b) => a.order - b.order);
}

export async function addVideoToSheet(video: VideoItem): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;

  // Ensure header row
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!A1:J1`,
  });

  if (!existing.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!A:J`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        video.id, video.title, video.youtubeUrl, video.youtubeId,
        video.duration, video.order, video.active ? 'TRUE' : 'FALSE',
        video.scheduledStart || '', video.scheduledEnd || '', video.addedAt,
      ]],
    },
  });
}

export async function updateSheetRow(video: VideoItem, rowIndex: number): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;
  const range = `${SHEET_NAME}!A${rowIndex}:J${rowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        video.id, video.title, video.youtubeUrl, video.youtubeId,
        video.duration, video.order, video.active ? 'TRUE' : 'FALSE',
        video.scheduledStart || '', video.scheduledEnd || '', video.addedAt,
      ]],
    },
  });
}

export async function deleteSheetRow(rowIndex: number): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;

  // Get sheet ID (gid) for the Videos sheet
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const sheet = meta.data.sheets?.find(s => s.properties?.title === SHEET_NAME);
  const gid = sheet?.properties?.sheetId || 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: gid,
            dimension: 'ROWS',
            startIndex: rowIndex - 1,
            endIndex: rowIndex,
          },
        },
      }],
    },
  });
}

export async function reorderSheet(videos: VideoItem[]): Promise<void> {
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;

  const values = videos.map((v, i) => [
    v.id, v.title, v.youtubeUrl, v.youtubeId,
    v.duration, i + 1, v.active ? 'TRUE' : 'FALSE',
    v.scheduledStart || '', v.scheduledEnd || '', v.addedAt,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!A2:J${values.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}
