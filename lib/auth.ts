import { NextApiRequest, NextApiResponse } from 'next'

export function withAdminAuth(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const authHeader = req.headers.authorization
    const password = process.env.ADMIN_PASSWORD

    if (!password) {
      return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' })
    }

    if (!authHeader || authHeader !== `Bearer ${password}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    return handler(req, res)
  }
}

export function checkAdminPassword(password: string): boolean {
  return password === process.env.ADMIN_PASSWORD
}
