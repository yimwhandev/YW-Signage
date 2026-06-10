import type { NextApiRequest, NextApiResponse } from 'next';
import { getUsers, addUser } from '@/lib/sheets';
import { hashPassword, getSession, can } from '@/lib/auth';
import { User, UserRole } from '@/lib/types';

function randomId() { return Math.random().toString(36).slice(2, 10); }
const VALID_ROLES: UserRole[] = ['superadmin', 'editor', 'viewer'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = getSession(req);
  if (!session || !can(session.role, 'admin')) return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    const users = await getUsers();
    // Never expose hashes
    return res.status(200).json(users.map(u => ({ ...u, passwordHash: '***' })));
  }

  if (req.method === 'POST') {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'invalid role' });

    const existing = await getUsers();
    if (existing.find(u => u.username === username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const user: User = {
      id: randomId(),
      username,
      passwordHash: await hashPassword(password),
      role,
      createdAt: new Date().toISOString(),
    };
    await addUser(user);
    return res.status(201).json({ ...user, passwordHash: '***' });
  }

  res.status(405).end();
}
