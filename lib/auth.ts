import { SessionUser, UserRole } from './types';

// Simple hash (SHA-256 via Web Crypto — available in Node 18+ / Edge)
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + process.env.ADMIN_PASSWORD); // salt with env
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return (await hashPassword(password)) === hash;
}

// JWT-lite: base64url encode/decode session cookie
export function encodeSession(user: SessionUser): string {
  const payload = JSON.stringify({ ...user, exp: Date.now() + 8 * 3600_000 }); // 8h
  return Buffer.from(payload).toString('base64url');
}

export function decodeSession(token: string): SessionUser | null {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return { id: payload.id, username: payload.username, role: payload.role };
  } catch { return null; }
}

export function can(role: UserRole, action: 'read' | 'write' | 'admin'): boolean {
  const perms: Record<UserRole, string[]> = {
    superadmin: ['read', 'write', 'admin'],
    editor:     ['read', 'write'],
    viewer:     ['read'],
  };
  return perms[role]?.includes(action) ?? false;
}

// Extract session from request cookie or x-session header
import type { NextApiRequest } from 'next';
export function getSession(req: NextApiRequest): SessionUser | null {
  const header = req.headers['x-session'] as string;
  if (header) return decodeSession(header);
  const cookie = req.cookies?.session;
  if (cookie) return decodeSession(cookie);
  return null;
}
