import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmergency, setEmergency, clearEmergency } from '@/lib/sheets';
import { EmergencyAlert } from '@/lib/types';

function randomId() { return Math.random().toString(36).slice(2, 10); }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET is public (TV needs it)
  if (req.method === 'GET') {
    const alert = await getEmergency();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(alert);
  }

  // Write operations require auth
  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    const { title, message, bgColor, textColor, expiresAt } = req.body;
    const alert: EmergencyAlert = {
      id: randomId(),
      title: title || 'ประกาศด่วน',
      message: message || '',
      bgColor: bgColor || '#dc2626',
      textColor: textColor || '#ffffff',
      active: true,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt || undefined,
    };
    await setEmergency(alert);
    return res.status(201).json(alert);
  }

  if (req.method === 'DELETE') {
    await clearEmergency();
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
