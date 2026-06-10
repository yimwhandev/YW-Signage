import type { NextApiRequest, NextApiResponse } from 'next';
import { deleteUser } from '@/lib/sheets';
import { getSession, can } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = getSession(req);
  if (!session || !can(session.role, 'admin')) return res.status(403).json({ error: 'Forbidden' });

  const { id } = req.query as { id: string };

  if (req.method === 'DELETE') {
    if (id === session.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await deleteUser(id);
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
