import type { NextApiRequest, NextApiResponse } from 'next';
import { getUsers } from '@/lib/sheets';
import { verifyPassword, hashPassword, encodeSession, getSession, can } from '@/lib/auth';
import { updateUserLastLogin } from '@/lib/sheets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET /api/auth — return current session info
  if (req.method === 'GET') {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    return res.status(200).json(session);
  }

  // POST /api/auth — login
  if (req.method === 'POST') {
    const { username, password } = req.body;

    // Legacy single-password mode (backward compat)
    if (!username && password === process.env.ADMIN_PASSWORD) {
      const token = encodeSession({ id: 'legacy', username: 'admin', role: 'superadmin' });
      return res.status(200).json({ ok: true, token, role: 'superadmin', username: 'admin' });
    }

    // Multi-user mode
    const users = await getUsers();
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await updateUserLastLogin(user.id);
    const token = encodeSession({ id: user.id, username: user.username, role: user.role });
    return res.status(200).json({ ok: true, token, role: user.role, username: user.username });
  }

  res.status(405).end();
}
