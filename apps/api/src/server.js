import cors from 'cors'
import dayjs from 'dayjs'
import express from 'express'
import multer from 'multer'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { z } from 'zod'
import { authenticate, canAccessProject, issueToken, requireRoles } from './lib/auth.js'
import { createAuditLog, db, getNowIso, getTodayString, initializeDatabase } from './lib/db.js'

initializeDatabase()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.resolve(__dirname, '../uploads')

const app = express()
const upload = multer({ dest: uploadsDir, limits: { fileSize: 5 * 1024 * 1024 } })
const port = Number(process.env.PORT || 4000)

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(uploadsDir))

const loginSchema = z.object({
  phone: z.string().min(8),
  password: z.string().min(3),
})

const projectSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  picUserId: z.number().int().nullable().optional(),
})

const projectUpdateSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  picUserId: z.number().int().nullable().optional(),
})

const userSchema = z.object({
  name: z.string().min(2),
  ktp: z.string().min(8),
  phone: z.string().min(8),
  role: z.enum(['ADMIN', 'PIC', 'CREW']),
  password: z.string().min(3).nullable().optional(),
})

const changePasswordSchema = z.object({
  oldPassword: z.string().min(3),
  newPassword: z.string().min(3),
})

const assignmentSchema = z.object({
  userId: z.number().int(),
  assignmentRole: z.enum(['PIC', 'CREW']),
})

const assignmentUpdateSchema = z.object({
  projectId: z.number().int(),
})

const qrSchema = z.object({
  projectId: z.number().int(),
  qrDate: z.string().optional(),
})

const overtimeSchema = z.object({
  projectId: z.number().int(),
  assignmentDate: z.string().optional(),
  userIds: z.array(z.number().int()).min(1),
})

const overtimeUpdateSchema = z.object({
  userId: z.number().int().positive(),
  assignmentDate: z.string().min(8),
  status: z.enum(['ASSIGNED', 'CANCELLED']).optional(),
})

function serializeProject(project) {
  return {
    ...project,
    isActive: Boolean(project.is_active),
    picUserId: project.pic_user_id,
    picName: project.pic_name,
  }
}

function resolveQrToken(token) {
  return db.prepare(`
    SELECT q.*, p.name AS project_name, p.code AS project_code
    FROM daily_qr_tokens q
    JOIN projects p ON p.id = q.project_id
    WHERE q.token = ?
  `).get(token)
}

function validateQrToken(token, projectId) {
  const record = resolveQrToken(token)
  if (!record) {
    return { valid: false, reason: 'QR token tidak ditemukan' }
  }

  if (projectId && record.project_id !== Number(projectId)) {
    return { valid: false, reason: 'QR token tidak sesuai project' }
  }

  const isExpired = dayjs(record.expires_at).isBefore(dayjs())
  const isWrongDate = record.qr_date !== getTodayString()
  if (isExpired || isWrongDate) {
    return { valid: false, reason: 'QR token sudah tidak berlaku' }
  }

  return { valid: true, record }
}

function getPublicWebUrl(req) {
  return req.get('origin') || process.env.PUBLIC_WEB_URL || 'http://localhost:5173'
}

function getProjectCrew(projectId) {
  return db.prepare(`
    SELECT u.id, u.name, u.phone
    FROM project_assignments pa
    JOIN users u ON u.id = pa.user_id
    WHERE pa.project_id = ? AND pa.assignment_role = 'CREW' AND u.status = 'ACTIVE'
    ORDER BY u.name
  `).all(projectId)
}

function getAdminUsers() {
  return db.prepare(`
    SELECT
      u.id,
      u.name,
      u.ktp,
      u.phone,
      u.role,
      u.status,
      COALESCE(GROUP_CONCAT(DISTINCT p.name), '') AS project_names
    FROM users u
    LEFT JOIN project_assignments pa ON pa.user_id = u.id
    LEFT JOIN projects p ON p.id = pa.project_id
    GROUP BY u.id, u.name, u.phone, u.role, u.status
    ORDER BY u.role, u.name
  `).all().map((user) => ({
    ...user,
    projectNames: user.project_names ? user.project_names.split(',').map((name) => name.trim()) : [],
  }))
}

function ensurePicProjectAccess(user, projectId) {
  if (!canAccessProject(user.id, user.role, projectId)) {
    return false
  }

  if (user.role === 'PIC') {
    const project = db.prepare('SELECT pic_user_id FROM projects WHERE id = ?').get(projectId)
    return project?.pic_user_id === user.id
  }

  return true
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', database: 'sqlite' })
})

app.post('/api/auth/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Payload login tidak valid', errors: parsed.error.flatten() })
  }

  const user = db.prepare(`
    SELECT id, name, phone, role, status, password
    FROM users
    WHERE phone = ?
  `).get(parsed.data.phone)

  if (!user || user.password !== parsed.data.password || user.status !== 'ACTIVE') {
    return res.status(401).json({ message: 'Nomor HP atau password salah' })
  }

  const token = issueToken(user)
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
    },
  })
})

app.get('/api/public/projects', (req, res) => {
  const token = req.query.token
  if (!token) {
    return res.status(400).json({ message: 'QR token wajib dikirim' })
  }

  const validation = validateQrToken(token)
  if (!validation.valid) {
    return res.status(403).json({ message: validation.reason })
  }

  res.json({
    token: validation.record.token,
    project: {
      id: validation.record.project_id,
      code: validation.record.project_code,
      name: validation.record.project_name,
      qrDate: validation.record.qr_date,
      expiresAt: validation.record.expires_at,
    },
    tabs: ['ATTENDANCE', 'OVERTIME'],
  })
})

app.get('/api/public/crew', (req, res) => {
  const token = req.query.token
  const flowType = req.query.flowType || 'ATTENDANCE'

  if (!token) {
    return res.status(400).json({ message: 'QR token wajib dikirim' })
  }

  const validation = validateQrToken(token)
  if (!validation.valid) {
    return res.status(403).json({ message: validation.reason })
  }

  if (flowType === 'OVERTIME') {
    const assignmentDate = getTodayString()
    const crew = db.prepare(`
      SELECT u.id, u.name, u.phone
      FROM overtime_assignments oa
      JOIN users u ON u.id = oa.user_id
      WHERE oa.project_id = ? AND oa.assignment_date = ? AND oa.status = 'ASSIGNED'
      ORDER BY u.name
    `).all(validation.record.project_id, assignmentDate)

    return res.json({ projectId: validation.record.project_id, crew })
  }

  return res.json({ projectId: validation.record.project_id, crew: getProjectCrew(validation.record.project_id) })
})

app.post('/api/public/attendance', upload.single('photo'), (req, res) => {
  const payload = {
    token: req.body.token,
    userId: Number(req.body.userId),
    projectId: Number(req.body.projectId),
    flowType: req.body.flowType,
    eventType: req.body.eventType,
    latitude: req.body.latitude ? Number(req.body.latitude) : null,
    longitude: req.body.longitude ? Number(req.body.longitude) : null,
  }

  const schema = z.object({
    token: z.string().min(10),
    userId: z.number().int().positive(),
    projectId: z.number().int().positive(),
    flowType: z.enum(['ATTENDANCE', 'OVERTIME']),
    eventType: z.enum(['CHECK_IN', 'CHECK_OUT']),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  })

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Payload absensi tidak valid', errors: parsed.error.flatten() })
  }

  const validation = validateQrToken(parsed.data.token, parsed.data.projectId)
  if (!validation.valid) {
    return res.status(403).json({ message: validation.reason })
  }

  const user = db.prepare('SELECT id, name, role, status FROM users WHERE id = ?').get(parsed.data.userId)
  if (!user || user.role !== 'CREW' || user.status !== 'ACTIVE') {
    return res.status(404).json({ message: 'Crew tidak ditemukan' })
  }

  const assignment = db.prepare(`
    SELECT id FROM project_assignments
    WHERE project_id = ? AND user_id = ? AND assignment_role = 'CREW'
  `).get(parsed.data.projectId, parsed.data.userId)

  if (!assignment) {
    return res.status(403).json({ message: 'Crew tidak terdaftar di project ini' })
  }

  let overtimeAssignmentId = null
  if (parsed.data.flowType === 'OVERTIME') {
    const overtimeAssignment = db.prepare(`
      SELECT id
      FROM overtime_assignments
      WHERE project_id = ? AND user_id = ? AND assignment_date = ? AND status = 'ASSIGNED'
    `).get(parsed.data.projectId, parsed.data.userId, getTodayString())

    if (!overtimeAssignment) {
      return res.status(403).json({ message: 'Crew ini belum di-assign untuk lembur hari ini' })
    }

    overtimeAssignmentId = overtimeAssignment.id
  }

  const duplicate = db.prepare(`
    SELECT id
    FROM attendance_records
    WHERE project_id = ? AND user_id = ? AND flow_type = ? AND event_type = ?
      AND datetime(created_at) >= datetime(?, '-3 minutes')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(parsed.data.projectId, parsed.data.userId, parsed.data.flowType, parsed.data.eventType, getNowIso())

  if (duplicate) {
    return res.status(409).json({ message: 'Event yang sama baru saja tersimpan. Hindari submit ganda.' })
  }

  const status = parsed.data.latitude == null || parsed.data.longitude == null ? 'NEEDS_REVIEW' : 'OK'
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null
  const createdAt = getNowIso()

  const result = db.prepare(`
    INSERT INTO attendance_records (
      project_id, user_id, flow_type, event_type, photo_path,
      latitude, longitude, status, source_token, assignment_id, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parsed.data.projectId,
    parsed.data.userId,
    parsed.data.flowType,
    parsed.data.eventType,
    photoPath,
    parsed.data.latitude,
    parsed.data.longitude,
    status,
    parsed.data.token,
    overtimeAssignmentId,
    createdAt
  )

  createAuditLog(null, 'ATTENDANCE_SUBMIT', parsed.data.flowType.toLowerCase(), result.lastInsertRowid, {
    projectId: parsed.data.projectId,
    userId: parsed.data.userId,
    eventType: parsed.data.eventType,
    status,
  })

  res.status(201).json({
    id: result.lastInsertRowid,
    status,
    createdAt,
    photoPath,
  })
})

app.use(authenticate)

app.get('/api/admin/bootstrap', requireRoles('ADMIN', 'PIC'), (req, res) => {
  const projectQuery = req.user.role === 'ADMIN'
    ? `
      SELECT p.*, u.name AS pic_name
      FROM projects p
      LEFT JOIN users u ON u.id = p.pic_user_id
      ORDER BY p.name
    `
    : `
      SELECT p.*, u.name AS pic_name
      FROM projects p
      LEFT JOIN users u ON u.id = p.pic_user_id
      JOIN project_assignments pa ON pa.project_id = p.id
      WHERE pa.user_id = ? AND pa.assignment_role = 'PIC'
      ORDER BY p.name
    `

  const projects = req.user.role === 'ADMIN'
    ? db.prepare(projectQuery).all()
    : db.prepare(projectQuery).all(req.user.id)

  const users = req.user.role === 'ADMIN' ? getAdminUsers() : []

  res.json({
    user: req.user,
    projects: projects.map(serializeProject),
    users,
  })
})

app.get('/api/admin/users', requireRoles('ADMIN'), (_req, res) => {
  const users = getAdminUsers()
  res.json(users)
})

app.post('/api/admin/users', requireRoles('ADMIN'), (req, res) => {
  const parsed = userSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Payload user tidak valid', errors: parsed.error.flatten() })
  }

  try {
    const result = db.prepare(`
      INSERT INTO users (name, ktp, phone, role, password, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)
    `).run(parsed.data.name, parsed.data.ktp, parsed.data.phone, parsed.data.role, parsed.data.password ?? null, getNowIso())

    createAuditLog(req.user.id, 'CREATE_USER', 'user', result.lastInsertRowid, parsed.data)
    res.status(201).json({ id: result.lastInsertRowid })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
})

app.post('/api/auth/change-password', authenticate, (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Payload tidak valid' })
  }

  const user = db.prepare('SELECT id, password FROM users WHERE id = ?').get(req.user.id)
  
  if (!user || user.password !== parsed.data.oldPassword) {
    return res.status(401).json({ message: 'Password lama tidak sesuai' })
  }

  try {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(parsed.data.newPassword, req.user.id)
    createAuditLog(req.user.id, 'CHANGE_PASSWORD', 'user', req.user.id, { oldPassword: '***', newPassword: '***' })
    res.json({ message: 'Password berhasil diubah' })
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengubah password' })
  }
})

app.get('/api/admin/projects', requireRoles('ADMIN', 'PIC'), (req, res) => {
  const projects = req.user.role === 'ADMIN'
    ? db.prepare(`
        SELECT p.*, u.name AS pic_name
        FROM projects p
        LEFT JOIN users u ON u.id = p.pic_user_id
        ORDER BY p.name
      `).all()
    : db.prepare(`
        SELECT p.*, u.name AS pic_name
        FROM projects p
        LEFT JOIN users u ON u.id = p.pic_user_id
        JOIN project_assignments pa ON pa.project_id = p.id
        WHERE pa.user_id = ? AND pa.assignment_role = 'PIC'
        ORDER BY p.name
      `).all(req.user.id)

  res.json(projects.map(serializeProject))
})

app.post('/api/admin/projects', requireRoles('ADMIN'), (req, res) => {
  const parsed = projectSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Payload project tidak valid', errors: parsed.error.flatten() })
  }

  try {
    const result = db.prepare(`
      INSERT INTO projects (code, name, pic_user_id, is_active, created_at)
      VALUES (?, ?, ?, 1, ?)
    `).run(parsed.data.code, parsed.data.name, parsed.data.picUserId ?? null, getNowIso())

    if (parsed.data.picUserId) {
      db.prepare(`
        INSERT OR IGNORE INTO project_assignments (project_id, user_id, assignment_role, created_at)
        VALUES (?, ?, 'PIC', ?)
      `).run(result.lastInsertRowid, parsed.data.picUserId, getNowIso())
    }

    createAuditLog(req.user.id, 'CREATE_PROJECT', 'project', result.lastInsertRowid, parsed.data)
    res.status(201).json({ id: result.lastInsertRowid })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
})

app.patch('/api/admin/projects/:projectId', requireRoles('ADMIN'), (req, res) => {
  const projectId = Number(req.params.projectId)
  const parsed = projectUpdateSchema.safeParse(req.body)

  if (!parsed.success || Number.isNaN(projectId)) {
    return res.status(400).json({ message: 'Payload project tidak valid', errors: parsed.success ? undefined : parsed.error.flatten() })
  }

  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!existing) {
    return res.status(404).json({ message: 'Project tidak ditemukan' })
  }

  try {
    db.prepare(`
      UPDATE projects
      SET code = ?, name = ?, pic_user_id = ?
      WHERE id = ?
    `).run(parsed.data.code, parsed.data.name, parsed.data.picUserId ?? null, projectId)

    if (parsed.data.picUserId) {
      db.prepare(`
        INSERT OR IGNORE INTO project_assignments (project_id, user_id, assignment_role, created_at)
        VALUES (?, ?, 'PIC', ?)
      `).run(projectId, parsed.data.picUserId, getNowIso())
    }

    createAuditLog(req.user.id, 'UPDATE_PROJECT', 'project', projectId, parsed.data)
    res.json({ message: 'Project berhasil diubah' })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
})

app.delete('/api/admin/projects/:projectId', requireRoles('ADMIN'), (req, res) => {
  const projectId = Number(req.params.projectId)
  if (Number.isNaN(projectId)) {
    return res.status(400).json({ message: 'Project tidak valid' })
  }

  const existing = db.prepare('SELECT id, code, name FROM projects WHERE id = ?').get(projectId)
  if (!existing) {
    return res.status(404).json({ message: 'Project tidak ditemukan' })
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
  createAuditLog(req.user.id, 'DELETE_PROJECT', 'project', projectId, { code: existing.code, name: existing.name })
  res.json({ message: 'Project berhasil dihapus' })
})

app.post('/api/admin/projects/:projectId/assignments', requireRoles('ADMIN'), (req, res) => {
  const projectId = Number(req.params.projectId)
  const parsed = assignmentSchema.safeParse(req.body)

  if (!parsed.success || Number.isNaN(projectId)) {
    return res.status(400).json({ message: 'Payload assignment tidak valid' })
  }

  try {
    db.prepare(`
      INSERT INTO project_assignments (project_id, user_id, assignment_role, created_at)
      VALUES (?, ?, ?, ?)
    `).run(projectId, parsed.data.userId, parsed.data.assignmentRole, getNowIso())

    if (parsed.data.assignmentRole === 'PIC') {
      db.prepare('UPDATE projects SET pic_user_id = ? WHERE id = ?').run(parsed.data.userId, projectId)
    }

    createAuditLog(req.user.id, 'ASSIGN_PROJECT', 'project', projectId, parsed.data)
    res.status(201).json({ message: 'Assignment berhasil ditambahkan' })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
})

app.get('/api/admin/projects/:projectId/assignments', requireRoles('ADMIN'), (req, res) => {
  const projectId = Number(req.params.projectId)
  if (Number.isNaN(projectId)) {
    return res.status(400).json({ message: 'Project tidak valid' })
  }

  const rows = db.prepare(`
    SELECT pa.id, pa.project_id, pa.user_id, pa.assignment_role, pa.created_at,
      u.name AS user_name, u.phone AS user_phone, u.role AS user_role,
      p.name AS project_name, p.code AS project_code
    FROM project_assignments pa
    JOIN users u ON u.id = pa.user_id
    JOIN projects p ON p.id = pa.project_id
    WHERE pa.project_id = ?
    ORDER BY pa.assignment_role, u.name
  `).all(projectId)

  res.json(rows)
})

app.patch('/api/admin/projects/:projectId/assignments/:assignmentId', requireRoles('ADMIN'), (req, res) => {
  const projectId = Number(req.params.projectId)
  const assignmentId = Number(req.params.assignmentId)
  const parsed = assignmentUpdateSchema.safeParse(req.body)

  if (!parsed.success || Number.isNaN(projectId) || Number.isNaN(assignmentId)) {
    return res.status(400).json({ message: 'Payload edit assignment tidak valid' })
  }

  const existing = db.prepare(`
    SELECT id, project_id, user_id, assignment_role
    FROM project_assignments
    WHERE id = ? AND project_id = ?
  `).get(assignmentId, projectId)
  if (!existing) {
    return res.status(404).json({ message: 'Assignment tidak ditemukan' })
  }

  const targetProject = db.prepare('SELECT id FROM projects WHERE id = ?').get(parsed.data.projectId)
  if (!targetProject) {
    return res.status(404).json({ message: 'Project tujuan tidak ditemukan' })
  }

  try {
    db.prepare(`
      UPDATE project_assignments
      SET project_id = ?
      WHERE id = ?
    `).run(parsed.data.projectId, assignmentId)

    if (existing.assignment_role === 'PIC') {
      db.prepare('UPDATE projects SET pic_user_id = NULL WHERE id = ? AND pic_user_id = ?').run(existing.project_id, existing.user_id)
      db.prepare('UPDATE projects SET pic_user_id = ? WHERE id = ?').run(existing.user_id, parsed.data.projectId)
    }

    createAuditLog(req.user.id, 'EDIT_PROJECT_ASSIGNMENT', 'project_assignment', assignmentId, {
      fromProjectId: existing.project_id,
      toProjectId: parsed.data.projectId,
      userId: existing.user_id,
      assignmentRole: existing.assignment_role,
    })
    res.json({ message: 'Assignment berhasil diubah' })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
})

app.delete('/api/admin/projects/:projectId/assignments/:assignmentId', requireRoles('ADMIN'), (req, res) => {
  const projectId = Number(req.params.projectId)
  const assignmentId = Number(req.params.assignmentId)

  if (Number.isNaN(projectId) || Number.isNaN(assignmentId)) {
    return res.status(400).json({ message: 'Parameter assignment tidak valid' })
  }

  const existing = db.prepare('SELECT user_id, assignment_role FROM project_assignments WHERE id = ? AND project_id = ?').get(assignmentId, projectId)
  if (!existing) {
    return res.status(404).json({ message: 'Assignment tidak ditemukan' })
  }

  db.prepare('DELETE FROM project_assignments WHERE id = ?').run(assignmentId)
  if (existing.assignment_role === 'PIC') {
    db.prepare('UPDATE projects SET pic_user_id = NULL WHERE id = ? AND pic_user_id = ?').run(projectId, existing.user_id)
  }

  createAuditLog(req.user.id, 'DELETE_PROJECT_ASSIGNMENT', 'project_assignment', assignmentId, { projectId })
  res.json({ message: 'Assignment berhasil dihapus' })
})

app.get('/api/admin/projects/:projectId/crew', requireRoles('ADMIN', 'PIC'), (req, res) => {
  const projectId = Number(req.params.projectId)
  if (Number.isNaN(projectId)) {
    return res.status(400).json({ message: 'Project tidak valid' })
  }

  if (!ensurePicProjectAccess(req.user, projectId)) {
    return res.status(403).json({ message: 'Anda tidak berhak melihat crew project ini' })
  }

  res.json(getProjectCrew(projectId))
})

app.post('/api/admin/qr/daily', requireRoles('ADMIN'), async (req, res) => {
  const parsed = qrSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Payload QR tidak valid', errors: parsed.error.flatten() })
  }

  const qrDate = parsed.data.qrDate ?? getTodayString()
  const token = crypto.randomBytes(18).toString('hex')
  const expiresAt = dayjs(`${qrDate}T23:59:59`).toISOString()
  const publicWebUrl = getPublicWebUrl(req)

  try {
    db.prepare(`
      INSERT INTO daily_qr_tokens (project_id, token, qr_date, expires_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(parsed.data.projectId, token, qrDate, expiresAt, req.user.id, getNowIso())
  } catch {
    const existing = db.prepare(`
      SELECT token, qr_date, expires_at
      FROM daily_qr_tokens
      WHERE project_id = ? AND qr_date = ?
    `).get(parsed.data.projectId, qrDate)

    if (!existing) {
      return res.status(500).json({ message: 'Gagal membuat QR harian' })
    }

    const qrValue = `${publicWebUrl}/?token=${existing.token}`
    const imageDataUrl = await QRCode.toDataURL(qrValue)
    return res.json({ token: existing.token, qrDate: existing.qr_date, expiresAt: existing.expires_at, qrValue, imageDataUrl })
  }

  createAuditLog(req.user.id, 'GENERATE_QR', 'project', parsed.data.projectId, { qrDate })
  const qrValue = `${publicWebUrl}/?token=${token}`
  const imageDataUrl = await QRCode.toDataURL(qrValue)
  res.status(201).json({ token, qrDate, expiresAt, qrValue, imageDataUrl })
})

app.get('/api/admin/qr/daily/active', requireRoles('ADMIN'), (req, res) => {
  const today = getTodayString()
  const nowIso = getNowIso()
  const publicWebUrl = getPublicWebUrl(req)

  const activeTokens = db.prepare(`
    SELECT q.id, q.project_id, q.token, q.qr_date, q.expires_at, p.code AS project_code, p.name AS project_name
    FROM daily_qr_tokens q
    JOIN projects p ON p.id = q.project_id
    WHERE q.qr_date = ?
      AND datetime(q.expires_at) >= datetime(?)
    ORDER BY p.name
  `).all(today, nowIso).map((item) => ({
    id: item.id,
    projectId: item.project_id,
    projectCode: item.project_code,
    projectName: item.project_name,
    qrDate: item.qr_date,
    expiresAt: item.expires_at,
    qrValue: `${publicWebUrl}/?token=${item.token}`,
  }))

  res.json(activeTokens)
})

app.delete('/api/admin/qr/daily/:qrId', requireRoles('ADMIN'), (req, res) => {
  const qrId = Number(req.params.qrId)
  if (Number.isNaN(qrId)) {
    return res.status(400).json({ message: 'QR tidak valid' })
  }

  const existing = db.prepare('SELECT id, project_id, qr_date FROM daily_qr_tokens WHERE id = ?').get(qrId)
  if (!existing) {
    return res.status(404).json({ message: 'QR tidak ditemukan' })
  }

  db.prepare('DELETE FROM daily_qr_tokens WHERE id = ?').run(qrId)
  createAuditLog(req.user.id, 'DELETE_DAILY_QR', 'daily_qr_token', qrId, {
    projectId: existing.project_id,
    qrDate: existing.qr_date,
  })

  res.json({ message: 'QR harian berhasil dihapus' })
})

app.post('/api/pic/overtime-assignments', requireRoles('ADMIN', 'PIC'), (req, res) => {
  const parsed = overtimeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: 'Payload lembur tidak valid', errors: parsed.error.flatten() })
  }

  if (!ensurePicProjectAccess(req.user, parsed.data.projectId)) {
    return res.status(403).json({ message: 'Anda tidak berhak assign lembur untuk project ini' })
  }

  const assignmentDate = parsed.data.assignmentDate ?? getTodayString()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO overtime_assignments (
      project_id, user_id, assigned_by, assignment_date, status, created_at
    ) VALUES (?, ?, ?, ?, 'ASSIGNED', ?)
  `)

  const insertedUserIds = []
  for (const userId of parsed.data.userIds) {
    const crewInProject = db.prepare(`
      SELECT id
      FROM project_assignments
      WHERE project_id = ? AND user_id = ? AND assignment_role = 'CREW'
    `).get(parsed.data.projectId, userId)

    if (!crewInProject) {
      continue
    }

    const result = insert.run(parsed.data.projectId, userId, req.user.id, assignmentDate, getNowIso())
    if (result.changes > 0) {
      insertedUserIds.push(userId)
    }
  }

  createAuditLog(req.user.id, 'ASSIGN_OVERTIME', 'project', parsed.data.projectId, {
    assignmentDate,
    userIds: insertedUserIds,
  })

  res.status(201).json({ assignmentDate, assignedUserIds: insertedUserIds })
})

app.get('/api/pic/overtime-assignments', requireRoles('ADMIN', 'PIC'), (req, res) => {
  const projectId = Number(req.query.projectId)
  const assignmentDate = String(req.query.assignmentDate || getTodayString())

  if (Number.isNaN(projectId)) {
    return res.status(400).json({ message: 'Project lembur tidak valid' })
  }

  if (!ensurePicProjectAccess(req.user, projectId)) {
    return res.status(403).json({ message: 'Anda tidak berhak melihat lembur project ini' })
  }

  const rows = db.prepare(`
    SELECT oa.id, oa.project_id, oa.user_id, oa.assignment_date, oa.status, oa.created_at,
      u.name AS user_name, u.phone AS user_phone,
      oa.assigned_by,
      assigner.name AS assigned_by_name
    FROM overtime_assignments oa
    JOIN users u ON u.id = oa.user_id
    JOIN users assigner ON assigner.id = oa.assigned_by
    WHERE oa.project_id = ? AND oa.assignment_date = ?
    ORDER BY u.name
  `).all(projectId, assignmentDate)

  res.json(rows)
})

app.patch('/api/pic/overtime-assignments/:id', requireRoles('ADMIN', 'PIC'), (req, res) => {
  const overtimeId = Number(req.params.id)
  const parsed = overtimeUpdateSchema.safeParse(req.body)

  if (!parsed.success || Number.isNaN(overtimeId)) {
    return res.status(400).json({ message: 'Payload edit lembur tidak valid' })
  }

  const existing = db.prepare('SELECT id, project_id FROM overtime_assignments WHERE id = ?').get(overtimeId)
  if (!existing) {
    return res.status(404).json({ message: 'Data lembur tidak ditemukan' })
  }

  if (!ensurePicProjectAccess(req.user, existing.project_id)) {
    return res.status(403).json({ message: 'Anda tidak berhak mengubah lembur project ini' })
  }

  const crewInProject = db.prepare(`
    SELECT id
    FROM project_assignments
    WHERE project_id = ? AND user_id = ? AND assignment_role = 'CREW'
  `).get(existing.project_id, parsed.data.userId)

  if (!crewInProject) {
    return res.status(400).json({ message: 'User tujuan bukan crew pada project ini' })
  }

  try {
    db.prepare(`
      UPDATE overtime_assignments
      SET user_id = ?, assignment_date = ?, status = ?
      WHERE id = ?
    `).run(parsed.data.userId, parsed.data.assignmentDate, parsed.data.status ?? 'ASSIGNED', overtimeId)

    createAuditLog(req.user.id, 'EDIT_OVERTIME_ASSIGNMENT', 'overtime_assignment', overtimeId, parsed.data)
    res.json({ message: 'Data lembur berhasil diubah' })
  } catch (error) {
    res.status(409).json({ message: error.message })
  }
})

app.delete('/api/pic/overtime-assignments/:id', requireRoles('ADMIN', 'PIC'), (req, res) => {
  const overtimeId = Number(req.params.id)
  if (Number.isNaN(overtimeId)) {
    return res.status(400).json({ message: 'Data lembur tidak valid' })
  }

  const existing = db.prepare('SELECT id, project_id FROM overtime_assignments WHERE id = ?').get(overtimeId)
  if (!existing) {
    return res.status(404).json({ message: 'Data lembur tidak ditemukan' })
  }

  if (!ensurePicProjectAccess(req.user, existing.project_id)) {
    return res.status(403).json({ message: 'Anda tidak berhak menghapus lembur project ini' })
  }

  db.prepare('DELETE FROM overtime_assignments WHERE id = ?').run(overtimeId)
  createAuditLog(req.user.id, 'DELETE_OVERTIME_ASSIGNMENT', 'overtime_assignment', overtimeId, { projectId: existing.project_id })
  res.json({ message: 'Data lembur berhasil dihapus' })
})

app.get('/api/admin/reports', requireRoles('ADMIN'), (req, res) => {
  const date = req.query.date || getTodayString()
  const projectId = req.query.projectId ? Number(req.query.projectId) : null

  const filters = ['date(ar.created_at) = ?']
  const params = [date]

  if (projectId) {
    if (!ensurePicProjectAccess(req.user, projectId)) {
      return res.status(403).json({ message: 'Anda tidak berhak melihat project ini' })
    }
    filters.push('ar.project_id = ?')
    params.push(projectId)
  } else if (req.user.role === 'PIC') {
    filters.push(`ar.project_id IN (
      SELECT project_id FROM project_assignments WHERE user_id = ? AND assignment_role = 'PIC'
    )`)
    params.push(req.user.id)
  }

  const attendance = db.prepare(`
    SELECT ar.id, ar.flow_type, ar.event_type, ar.status, ar.latitude, ar.longitude, ar.photo_path,
      ar.created_at, u.name AS crew_name, u.phone AS crew_phone, p.name AS project_name, p.code AS project_code
    FROM attendance_records ar
    JOIN users u ON u.id = ar.user_id
    JOIN projects p ON p.id = ar.project_id
    WHERE ${filters.join(' AND ')}
    ORDER BY ar.created_at DESC
  `).all(...params)

  const overtimeAssignments = db.prepare(`
    SELECT oa.id, oa.assignment_date, oa.status, u.name AS crew_name, p.name AS project_name,
      assigner.name AS assigned_by_name
    FROM overtime_assignments oa
    JOIN users u ON u.id = oa.user_id
    JOIN users assigner ON assigner.id = oa.assigned_by
    JOIN projects p ON p.id = oa.project_id
    WHERE oa.assignment_date = ?
      ${projectId ? 'AND oa.project_id = ?' : ''}
      ${req.user.role === 'PIC' && !projectId ? `AND oa.project_id IN (
        SELECT project_id FROM project_assignments WHERE user_id = ? AND assignment_role = 'PIC'
      )` : ''}
    ORDER BY p.name, u.name
  `).all(...[date, ...(projectId ? [projectId] : []), ...(req.user.role === 'PIC' && !projectId ? [req.user.id] : [])])

  res.json({ attendance, overtimeAssignments })
})

app.get('/api/admin/reports/summary', requireRoles('ADMIN'), (req, res) => {
  const startDate = String(req.query.startDate || getTodayString())
  const endDate = String(req.query.endDate || startDate)
  const projectId = req.query.projectId ? Number(req.query.projectId) : null

  if (startDate > endDate) {
    return res.status(400).json({ message: 'Tanggal awal tidak boleh lebih besar dari tanggal akhir' })
  }

  const filters = ['date(ar.created_at) BETWEEN ? AND ?']
  const params = [startDate, endDate]

  if (projectId) {
    if (!ensurePicProjectAccess(req.user, projectId)) {
      return res.status(403).json({ message: 'Anda tidak berhak melihat project ini' })
    }
    filters.push('ar.project_id = ?')
    params.push(projectId)
  } else if (req.user.role === 'PIC') {
    filters.push(`ar.project_id IN (
      SELECT project_id FROM project_assignments WHERE user_id = ? AND assignment_role = 'PIC'
    )`)
    params.push(req.user.id)
  }

  const summary = db.prepare(`
    SELECT
      p.name AS project_name,
      u.name AS crew_name,
      MIN(CASE WHEN ar.flow_type = 'ATTENDANCE' AND ar.event_type = 'CHECK_IN' THEN ar.created_at END) AS attendance_check_in,
      MAX(CASE WHEN ar.flow_type = 'ATTENDANCE' AND ar.event_type = 'CHECK_OUT' THEN ar.created_at END) AS attendance_check_out,
      MIN(CASE WHEN ar.flow_type = 'OVERTIME' AND ar.event_type = 'CHECK_IN' THEN ar.created_at END) AS overtime_check_in,
      MAX(CASE WHEN ar.flow_type = 'OVERTIME' AND ar.event_type = 'CHECK_OUT' THEN ar.created_at END) AS overtime_check_out
    FROM attendance_records ar
    JOIN users u ON u.id = ar.user_id
    JOIN projects p ON p.id = ar.project_id
    WHERE ${filters.join(' AND ')}
    GROUP BY ar.project_id, ar.user_id, p.name, u.name
    ORDER BY p.name, u.name
  `).all(...params)

  res.json({ summary })
})

app.get('/api/admin/reports/summary/export', requireRoles('ADMIN'), (req, res) => {
  const startDate = String(req.query.startDate || getTodayString())
  const endDate = String(req.query.endDate || startDate)
  const projectId = req.query.projectId ? Number(req.query.projectId) : null

  if (startDate > endDate) {
    return res.status(400).json({ message: 'Tanggal awal tidak boleh lebih besar dari tanggal akhir' })
  }

  const filters = ['date(ar.created_at) BETWEEN ? AND ?']
  const params = [startDate, endDate]

  if (projectId) {
    if (!ensurePicProjectAccess(req.user, projectId)) {
      return res.status(403).json({ message: 'Anda tidak berhak melihat project ini' })
    }
    filters.push('ar.project_id = ?')
    params.push(projectId)
  } else if (req.user.role === 'PIC') {
    filters.push(`ar.project_id IN (
      SELECT project_id FROM project_assignments WHERE user_id = ? AND assignment_role = 'PIC'
    )`)
    params.push(req.user.id)
  }

  const rows = db.prepare(`
    SELECT
      p.name AS nama_project,
      u.name AS nama_crew,
      strftime('%H:%M', MIN(CASE WHEN ar.flow_type = 'ATTENDANCE' AND ar.event_type = 'CHECK_IN' THEN ar.created_at END)) AS jam_masuk,
      strftime('%H:%M', MAX(CASE WHEN ar.flow_type = 'ATTENDANCE' AND ar.event_type = 'CHECK_OUT' THEN ar.created_at END)) AS jam_keluar,
      strftime('%H:%M', MIN(CASE WHEN ar.flow_type = 'OVERTIME' AND ar.event_type = 'CHECK_IN' THEN ar.created_at END)) AS jam_masuk_lembur,
      strftime('%H:%M', MAX(CASE WHEN ar.flow_type = 'OVERTIME' AND ar.event_type = 'CHECK_OUT' THEN ar.created_at END)) AS jam_keluar_lembur
    FROM attendance_records ar
    JOIN users u ON u.id = ar.user_id
    JOIN projects p ON p.id = ar.project_id
    WHERE ${filters.join(' AND ')}
    GROUP BY ar.project_id, ar.user_id, p.name, u.name
    ORDER BY p.name, u.name
  `).all(...params)

  const header = [
    'Nama Project',
    'Nama Crew',
    'Jam Masuk',
    'Jam Keluar',
    'Jam Masuk Lembur',
    'Jam Keluar Lembur',
  ]

  const valueMap = {
    'Nama Project': 'nama_project',
    'Nama Crew': 'nama_crew',
    'Jam Masuk': 'jam_masuk',
    'Jam Keluar': 'jam_keluar',
    'Jam Masuk Lembur': 'jam_masuk_lembur',
    'Jam Keluar Lembur': 'jam_keluar_lembur',
  }

  const csvLines = [
    header.join(','),
    ...rows.map((row) => header.map((key) => `"${String(row[valueMap[key]] ?? '').replaceAll('"', '""')}"`).join(',')),
  ]

  const selectedProjectName = projectId
    ? db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId)?.name
    : null
  const safeProjectName = (selectedProjectName || 'Semua-Project').replace(/[^a-zA-Z0-9-_]+/g, '-')

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="rangkuman-${safeProjectName}-${startDate}-to-${endDate}.csv"`)
  res.send(csvLines.join('\n'))
})

app.get('/api/admin/reports/export', requireRoles('ADMIN'), (req, res) => {
  const date = req.query.date || getTodayString()
  const projectId = req.query.projectId ? Number(req.query.projectId) : null

  const filters = ['date(ar.created_at) = ?']
  const params = [date]

  if (projectId) {
    if (!ensurePicProjectAccess(req.user, projectId)) {
      return res.status(403).json({ message: 'Anda tidak berhak melihat project ini' })
    }
    filters.push('ar.project_id = ?')
    params.push(projectId)
  } else if (req.user.role === 'PIC') {
    filters.push(`ar.project_id IN (
      SELECT project_id FROM project_assignments WHERE user_id = ? AND assignment_role = 'PIC'
    )`)
    params.push(req.user.id)
  }

  const rows = db.prepare(`
    SELECT ar.flow_type, ar.event_type, ar.status, ar.created_at, u.name AS crew_name,
      u.phone AS crew_phone, p.code AS project_code, p.name AS project_name,
      COALESCE(ar.latitude, '') AS latitude, COALESCE(ar.longitude, '') AS longitude
    FROM attendance_records ar
    JOIN users u ON u.id = ar.user_id
    JOIN projects p ON p.id = ar.project_id
    WHERE ${filters.join(' AND ')}
    ORDER BY ar.created_at DESC
  `).all(...params)

  const header = [
    'flow_type',
    'event_type',
    'status',
    'created_at',
    'crew_name',
    'crew_phone',
    'project_code',
    'project_name',
    'latitude',
    'longitude',
  ]

  const csvLines = [
    header.join(','),
    ...rows.map((row) => header.map((key) => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(',')),
  ]

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="report-${date}.csv"`)
  res.send(csvLines.join('\n'))
})

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ message: error.message })
  }

  console.error(error)
  res.status(500).json({ message: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`)
})
