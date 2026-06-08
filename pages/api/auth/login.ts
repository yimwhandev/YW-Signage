import type { NextApiRequest, NextApiResponse } from 'next'
import { checkAdminPassword } from '@/lib/auth'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { password } = req.body
  if (!password) {
    return res.status(400).json({ error: 'Password required' })
  }

  if (checkAdminPassword(password)) {
    return res.status(200).json({ success: true, token: password })
  }

  return res.status(401).json({ error: 'Invalid password' })
}
