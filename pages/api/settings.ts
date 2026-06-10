import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllSettings, setSetting } from '@/lib/sheets';
import { getSession, can } from '@/lib/auth';

// Default values if not set in Sheet
export const DEFAULTS: Record<string, string> = {
  refreshInterval: '30',   // seconds — how often TV re-fetches playlist
  emergencyPoll:   '15',   // seconds — how often TV checks for emergency
  heartbeatInterval: '15', // seconds — how often TV sends heartbeat
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET is public — TV needs it without auth
  if (req.method === 'GET') {
    const stored = await getAllSettings();
    // Merge with defaults so TV always gets a value
    const merged: Record<string, string> = { ...DEFAULTS, ...stored };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(merged);
  }

  // PATCH requires editor+ role
  if (req.method === 'PATCH') {
    const session = getSession(req);
    const legacyOk = req.headers['x-admin-password'] === process.env.ADMIN_PASSWORD;
    if (!legacyOk && (!session || !can(session.role, 'write'))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      if (key in DEFAULTS) {
        await setSetting(key, String(value));
      }
    }
    const stored = await getAllSettings();
    return res.status(200).json({ ...DEFAULTS, ...stored });
  }

  res.status(405).end();
}
