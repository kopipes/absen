import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dayjs from 'dayjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const databasePath = path.resolve(__dirname, '../../data/dev.db')

export const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const now = () => new Date().toISOString()
const today = () => dayjs().format('YYYY-MM-DD')
const SUPPORTED_USER_ROLES = ['ADMIN', 'PIC', 'CREW', 'HEAD CREW', 'KASIR', 'SPG', 'Back Up SPG']

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'PIC', 'CREW', 'HEAD CREW', 'KASIR', 'SPG', 'Back Up SPG')),
      password TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pic_user_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (pic_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS project_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      assignment_role TEXT NOT NULL CHECK (assignment_role IN ('PIC', 'CREW')),
      created_at TEXT NOT NULL,
      UNIQUE (project_id, user_id, assignment_role),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_qr_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      qr_date TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (project_id, qr_date),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS overtime_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      assigned_by INTEGER NOT NULL,
      assignment_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'CANCELLED')),
      created_at TEXT NOT NULL,
      UNIQUE (project_id, user_id, assignment_date),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      flow_type TEXT NOT NULL CHECK (flow_type IN ('ATTENDANCE', 'OVERTIME')),
      event_type TEXT NOT NULL CHECK (event_type IN ('CHECK_IN', 'CHECK_OUT')),
      photo_path TEXT,
      latitude REAL,
      longitude REAL,
      status TEXT NOT NULL DEFAULT 'OK' CHECK (status IN ('OK', 'NEEDS_REVIEW')),
      source_token TEXT NOT NULL,
      assignment_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES overtime_assignments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_project_date ON attendance_records (project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records (user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_overtime_assignment_date ON overtime_assignments (assignment_date, project_id);
  `)

  ensureUserColumns()
  repairLegacyUserForeignKeys()
  ensureUserRoleConstraint()
  ensureUserColumns()

  seedDatabase()
}

function ensureUserRoleConstraint() {
  const tableInfo = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'users'
  `).get()

  const tableSql = tableInfo?.sql || ''
  const hasAllRoles = SUPPORTED_USER_ROLES.every((role) => tableSql.includes(`'${role}'`))
  if (hasAllRoles) {
    return
  }

  db.exec('PRAGMA foreign_keys = OFF')
  db.exec('BEGIN TRANSACTION')

  try {
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('ADMIN', 'PIC', 'CREW', 'HEAD CREW', 'KASIR', 'SPG', 'Back Up SPG')),
        password TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        ktp TEXT
      )
    `)

    db.exec(`
      INSERT INTO users_new (id, name, phone, role, password, status, created_at, ktp)
      SELECT id, name, phone, role, password, status, created_at, ktp
      FROM users
    `)

    db.exec('DROP TABLE users')
    db.exec('ALTER TABLE users_new RENAME TO users')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

function repairLegacyUserForeignKeys() {
  const tables = ['projects', 'project_assignments', 'daily_qr_tokens', 'overtime_assignments', 'attendance_records', 'audit_logs']

  const brokenTables = tables.filter((tableName) => {
    const fks = db.prepare(`PRAGMA foreign_key_list(${tableName})`).all()
    return fks.some((fk) => fk.table === 'users_legacy')
  })

  if (brokenTables.length === 0) {
    return
  }

  db.exec('PRAGMA foreign_keys = OFF')
  db.exec('BEGIN TRANSACTION')

  try {
    for (const tableName of brokenTables) {
      const createRow = db.prepare(`
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
      `).get(tableName)

      const createSql = createRow?.sql || ''
      const fixedTableName = `${tableName}_fixed`
      const fixedCreateSql = createSql
        .replace(new RegExp(`CREATE TABLE\\s+${tableName}`, 'i'), `CREATE TABLE ${fixedTableName}`)
        .replaceAll('users_legacy', 'users')

      db.exec(fixedCreateSql)

      const columns = db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name)
      const columnList = columns.join(', ')
      db.exec(`INSERT INTO ${fixedTableName} (${columnList}) SELECT ${columnList} FROM ${tableName}`)
      db.exec(`DROP TABLE ${tableName}`)
      db.exec(`ALTER TABLE ${fixedTableName} RENAME TO ${tableName}`)
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

function ensureUserColumns() {
  const userColumns = db.prepare('PRAGMA table_info(users)').all()
  const columnNames = new Set(userColumns.map((column) => column.name))

  if (!columnNames.has('ktp')) {
    db.exec('ALTER TABLE users ADD COLUMN ktp TEXT')
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ktp_unique ON users(ktp) WHERE ktp IS NOT NULL')
}

function seedDatabase() {
  const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
  if (totalUsers > 0) {
    return
  }

  const insertUser = db.prepare(`
    INSERT INTO users (name, ktp, phone, role, password, status, created_at)
    VALUES (@name, @ktp, @phone, @role, @password, 'ACTIVE', @createdAt)
  `)

  const createdAt = now()
  const adminInfo = { name: 'Admin Crew', ktp: '3173000000000001', phone: '081100000001', role: 'ADMIN', password: 'admin123', createdAt }
  const picInfo = { name: 'PIC Event 1', ktp: '3173000000000002', phone: '081100000002', role: 'PIC', password: 'pic123', createdAt }
  const crewMembers = [
    { name: 'Budi', ktp: '3173000000000101', phone: '081100000101', role: 'CREW', password: null, createdAt },
    { name: 'Sari', ktp: '3173000000000102', phone: '081100000102', role: 'CREW', password: null, createdAt },
    { name: 'Andi', ktp: '3173000000000103', phone: '081100000103', role: 'CREW', password: null, createdAt },
  ]

  const seedTx = db.transaction(() => {
    const adminResult = insertUser.run(adminInfo)
    const picResult = insertUser.run(picInfo)
    const crewIds = crewMembers.map((crew) => insertUser.run(crew).lastInsertRowid)

    const projectResult = db.prepare(`
      INSERT INTO projects (code, name, pic_user_id, is_active, created_at)
      VALUES (?, ?, ?, 1, ?)
    `).run('PRJ-001', 'Project Demo Lapangan', picResult.lastInsertRowid, createdAt)

    const insertAssignment = db.prepare(`
      INSERT INTO project_assignments (project_id, user_id, assignment_role, created_at)
      VALUES (?, ?, ?, ?)
    `)

    insertAssignment.run(projectResult.lastInsertRowid, picResult.lastInsertRowid, 'PIC', createdAt)
    for (const crewId of crewIds) {
      insertAssignment.run(projectResult.lastInsertRowid, crewId, 'CREW', createdAt)
    }

    db.prepare(`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(adminResult.lastInsertRowid, 'SEED', 'system', 'bootstrap', 'Initial SQLite seed created', createdAt)
  })

  seedTx()
}

export function createAuditLog(actorUserId, action, entityType, entityId, details) {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(actorUserId ?? null, action, entityType, String(entityId), details ? JSON.stringify(details) : null, now())
}

export function getTodayString() {
  return today()
}

export function getNowIso() {
  return now()
}
