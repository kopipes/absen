import jwt from 'jsonwebtoken'
import { db } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'crew-management-dev-secret'

export function issueToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  )
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = db.prepare('SELECT id, name, phone, role, status FROM users WHERE id = ?').get(payload.sub)

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ message: 'Invalid user' })
    }

    req.user = user
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid token' })
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    next()
  }
}

export function canAccessProject(userId, role, projectId) {
  if (role === 'ADMIN') {
    return true
  }

  const assignment = db.prepare(`
    SELECT id
    FROM project_assignments
    WHERE project_id = ? AND user_id = ? AND assignment_role = ?
  `).get(projectId, userId, role)

  return Boolean(assignment)
}
