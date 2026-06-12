import type { NextApiRequest, NextApiResponse } from 'next';
import { getPlaylists } from '@/lib/sheets';
import { getSession, can } from '@/lib/auth';
import { google } from 'googleapis';

const TAB = 'Playlists';

async function getSheetsClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, undefined,
    process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  return google.sheets({ version: 'v4', auth });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = getSession(req);
  const legacyOk = req.headers['x-admin-password'] === process.env.ADMIN_PASSWORD;
  if (!legacyOk && (!session || !can(session.role, 'write'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { id } = req.query as { id: string };
  const playlists = await getPlaylists();
  const idx = playlists.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const rowIndex = idx + 2;
  const sheets = await getSheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID!;

  if (req.method === 'PATCH') {
    const { name, color, scheduledStart, scheduledEnd } = req.body;
    const updated = {
      ...playlists[idx],
      ...(name !== undefined && { name }),
      ...(color !== undefined && { color }),
      ...(scheduledStart !== undefined && { scheduledStart }),
      ...(scheduledEnd !== undefined && { scheduledEnd }),
    };
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${TAB}!A${rowIndex}:E${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[updated.id, updated.name, updated.color, updated.scheduledStart || '', updated.scheduledEnd || '']] },
    });
    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheet = meta.data.sheets?.find(s => s.properties?.title === TAB);
    const gid = sheet?.properties?.sheetId ?? 0;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } } }],
      },
    });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
