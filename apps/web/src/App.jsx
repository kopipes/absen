import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import dayjs from 'dayjs'

function isLocalApiHost(hostname) {
  if (!hostname) {
    return false
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1') {
    return true
  }

  if (hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
    return true
  }

  const privateRangeMatch = hostname.match(/^172\.(\d{1,3})\./)
  if (privateRangeMatch) {
    const subnet = Number(privateRangeMatch[1])
    return subnet >= 16 && subnet <= 31
  }

  return false
}

function getDefaultApiBase() {
  if (typeof window === 'undefined') {
    return 'http://localhost:4000/api'
  }

  const { protocol, hostname, origin } = window.location
  if (isLocalApiHost(hostname)) {
    return `${protocol}//${hostname}:4000/api`
  }

  return `${origin}/api`
}

const API_BASE = import.meta.env.VITE_API_URL || getDefaultApiBase()

function resolveUploadedPhotoUrl(photoPath) {
  if (!photoPath) {
    return ''
  }

  if (/^https?:\/\//i.test(photoPath)) {
    return photoPath
  }

  const normalizedPath = photoPath.startsWith('/') ? photoPath : `/${photoPath}`
  const apiOrigin = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE

  if (normalizedPath.startsWith('/api/')) {
    return `${apiOrigin}${normalizedPath}`
  }

  if (normalizedPath.startsWith('/uploads/')) {
    return `${API_BASE}${normalizedPath}`
  }

  return `${apiOrigin}${normalizedPath}`
}

const http = axios.create({
  baseURL: API_BASE,
})

function buildDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return []
  }

  const firstDate = dayjs(startDate)
  const lastDate = dayjs(endDate)
  if (!firstDate.isValid() || !lastDate.isValid() || firstDate.isAfter(lastDate, 'day')) {
    return []
  }

  const dates = []
  let cursor = firstDate

  while (cursor.format('YYYY-MM-DD') <= lastDate.format('YYYY-MM-DD')) {
    dates.push(cursor.format('YYYY-MM-DD'))
    cursor = cursor.add(1, 'day')
  }

  return dates
}

const USER_ROLES = ['ADMIN', 'PIC', 'CREW', 'HEAD CREW', 'KASIR', 'SPG', 'Back Up SPG', 'Talent', 'LO', 'Crew Store']
const ASSIGNMENT_ROLE_SET = new Set(['PIC', 'CREW', 'HEAD CREW', 'KASIR', 'SPG', 'Back Up SPG', 'Talent', 'LO', 'Crew Store'])
const NO_PASSWORD_ROLES = new Set(['CREW', 'HEAD CREW', 'KASIR', 'SPG', 'Back Up SPG', 'Talent', 'LO', 'Crew Store'])

function ProjectSelect({ projects, value, onChange, placeholder = 'Semua project', includeAll = true }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
  }, [projects, search])
  const selected = projects.find((p) => String(p.id) === String(value))
  useEffect(() => {
    function onOut(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ padding: '8px 12px', border: '1.5px solid var(--line-strong)', borderRadius: '10px', background: 'var(--surface)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem', color: selected ? '#102031' : '#6b7a8d', userSelect: 'none', minHeight: 38 }}>
        <span>{selected ? `${selected.code} · ${selected.name}` : placeholder}</span>
        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>▾</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1.5px solid var(--line-strong)', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 260, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px' }}><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari project..." onClick={(e) => e.stopPropagation()} style={{ margin: 0, borderRadius: '8px' }} /></div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {includeAll && <div onClick={() => { onChange(''); setOpen(false); setSearch('') }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', color: !value ? 'var(--brand)' : '#3d5166', fontWeight: !value ? 700 : 400, background: !value ? 'rgba(13,109,119,0.07)' : 'transparent' }}>{placeholder}</div>}
            {filtered.length === 0 && <div style={{ padding: '10px 12px', fontSize: '0.82rem', color: '#7a90a4' }}>Tidak ada hasil</div>}
            {filtered.map((p) => (
              <div key={p.id} onClick={() => { onChange(String(p.id)); setOpen(false); setSearch('') }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', color: String(p.id) === String(value) ? 'var(--brand)' : '#102031', fontWeight: String(p.id) === String(value) ? 700 : 400, background: String(p.id) === String(value) ? 'rgba(13,109,119,0.07)' : 'transparent' }}>
                <span style={{ color: '#7a90a4', fontSize: '0.75rem', marginRight: 6 }}>{p.code}</span>{p.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function UserSelect({ users, value, onChange, placeholder = 'Pilih user' }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => u.name.toLowerCase().includes(q) || (u.phone || '').includes(q) || (u.role || '').toLowerCase().includes(q))
  }, [users, search])
  const selected = users.find((u) => String(u.id) === String(value))
  useEffect(() => {
    function onOut(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ padding: '8px 12px', border: '1.5px solid var(--line-strong)', borderRadius: '10px', background: 'var(--surface)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem', color: selected ? '#102031' : '#6b7a8d', userSelect: 'none', minHeight: 38 }}>
        <span>{selected ? `${selected.name} · ${selected.role}` : placeholder}</span>
        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>▾</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1.5px solid var(--line-strong)', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 280, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px' }}><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, no telp, atau role..." onClick={(e) => e.stopPropagation()} style={{ margin: 0, borderRadius: '8px' }} /></div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && <div style={{ padding: '10px 12px', fontSize: '0.82rem', color: '#7a90a4' }}>Tidak ada hasil</div>}
            {filtered.map((u) => (
              <div key={u.id} onClick={() => { onChange(String(u.id)); setOpen(false); setSearch('') }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', color: String(u.id) === String(value) ? 'var(--brand)' : '#102031', fontWeight: String(u.id) === String(value) ? 700 : 400, background: String(u.id) === String(value) ? 'rgba(13,109,119,0.07)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{u.name}</span>
                <span style={{ fontSize: '0.72rem', color: String(u.id) === String(value) ? 'var(--brand)' : '#7a90a4', marginLeft: 8 }}>{u.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const tokenFromUrl = searchParams.get('token') || ''

  const [mode, setMode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('token') ? 'crew' : 'admin'
  })
  const [notice, setNotice] = useState('')
  const [toasts, setToasts] = useState([])

  const [publicProject, setPublicProject] = useState(null)
  const [crewTab, setCrewTab] = useState('ATTENDANCE')
  const [crewList, setCrewList] = useState([])
  const [crewSearch, setCrewSearch] = useState('')
  const [selectedCrewId, setSelectedCrewId] = useState(null)
  const [locationState, setLocationState] = useState({ latitude: null, longitude: null, status: 'Belum diambil' })
  const [photoFile, setPhotoFile] = useState(null)
  const [crewSubmitting, setCrewSubmitting] = useState(false)
  const [crewMessage, setCrewMessage] = useState('')

  const [authState, setAuthState] = useState({ token: '', user: null })
  const [adminPage, setAdminPage] = useState('dashboard')
  const [loginForm, setLoginForm] = useState({ phone: '', password: '' })
  const [adminData, setAdminData] = useState({ projects: [], users: [] })
  const [projectCrew, setProjectCrew] = useState([])
  const [projectAssignments, setProjectAssignments] = useState([])
  const [overtimeAssignments, setOvertimeAssignments] = useState([])
  const [reportData, setReportData] = useState({ attendance: [], overtimeAssignments: [] })
  const [reportCrewSort, setReportCrewSort] = useState('CREW_ASC')
  const [summaryRows, setSummaryRows] = useState([])
  const [loadingAdmin, setLoadingAdmin] = useState(false)
  const [loadingAssignments, setLoadingAssignments] = useState(false)
  const [loadingOvertimeAssignments, setLoadingOvertimeAssignments] = useState(false)
  const [qrResult, setQrResult] = useState(null)
  const [activeDailyQrs, setActiveDailyQrs] = useState([])
  const [userForm, setUserForm] = useState({ name: '', ktp: '', phone: '', role: 'CREW', password: '' })
  const [crewUploadFile, setCrewUploadFile] = useState(null)
  const [crewUploadLoading, setCrewUploadLoading] = useState(false)
  const [backupRestoreFile, setBackupRestoreFile] = useState(null)
  const [backupLoading, setBackupLoading] = useState(false)
  const backupRestoreInputRef = useRef(null)
  const [projectForm, setProjectForm] = useState({ code: '', name: '', picUserId: '' })
  const [assignmentForm, setAssignmentForm] = useState({ projectId: '', userId: '' })
  const [editingAssignmentId, setEditingAssignmentId] = useState(null)
  const [editingAssignmentProjectId, setEditingAssignmentProjectId] = useState('')
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [editingProjectForm, setEditingProjectForm] = useState({ code: '', name: '', picUserId: '' })
  const [qrForm, setQrForm] = useState({ projectId: '', qrDate: dayjs().format('YYYY-MM-DD') })
  const [overtimeForm, setOvertimeForm] = useState({ projectId: '', assignmentDate: dayjs().format('YYYY-MM-DD'), userIds: [] })
  const [reportForm, setReportForm] = useState({ projectId: '', date: dayjs().format('YYYY-MM-DD') })
  const [summaryForm, setSummaryForm] = useState({
    projectId: '',
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD'),
  })
  const [userListFilters, setUserListFilters] = useState({ search: '', role: '', status: '', project: '' })
  const [userListPage, setUserListPage] = useState(1)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [changePasswordForm, setChangePasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const [editingUserId, setEditingUserId] = useState(null)
  const [editingUserForm, setEditingUserForm] = useState({ name: '', ktp: '', phone: '' })
  const [photoPreview, setPhotoPreview] = useState({ open: false, url: '', crewName: '' })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [projectListPage, setProjectListPage] = useState(1)
  const [projectListSearch, setProjectListSearch] = useState('')

  const filteredCrew = useMemo(() => {
    const query = crewSearch.trim().toLowerCase()
    if (!query) {
      return crewList
    }

    return crewList.filter((crew) => crew.name.toLowerCase().includes(query) || crew.phone.includes(query))
  }, [crewList, crewSearch])

  const picOptions = adminData.users.filter((user) => user.role === 'PIC')
  const nonAdminUsers = adminData.users.filter((user) => user.role !== 'ADMIN')
  const canManageAdmin = authState.user?.role === 'ADMIN'
  const isPicOnly = authState.user?.role === 'PIC'
  const filteredAdminUsers = useMemo(() => {
    return adminData.users.filter((user) => {
      const search = userListFilters.search.trim().toLowerCase()
      const matchesSearch = !search
        || user.name.toLowerCase().includes(search)
        || user.phone.includes(search)

      const matchesRole = !userListFilters.role || user.role === userListFilters.role
      const matchesStatus = !userListFilters.status || user.status === userListFilters.status
      const matchesProject = !userListFilters.project || user.projectNames.includes(userListFilters.project)

      return matchesSearch && matchesRole && matchesStatus && matchesProject
    })
  }, [adminData.users, userListFilters])

  const sortedReportAttendance = useMemo(() => {
    const rows = [...reportData.attendance]
    rows.sort((a, b) => {
      const crewCompare = String(a.crew_name || '').localeCompare(String(b.crew_name || ''), 'id', { sensitivity: 'base' })
      if (crewCompare !== 0) {
        return reportCrewSort === 'CREW_DESC' ? -crewCompare : crewCompare
      }
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })
    return rows
  }, [reportData.attendance, reportCrewSort])

  const sortedReportOvertimeAssignments = useMemo(() => {
    const rows = [...reportData.overtimeAssignments]
    rows.sort((a, b) => {
      const crewCompare = String(a.crew_name || '').localeCompare(String(b.crew_name || ''), 'id', { sensitivity: 'base' })
      if (crewCompare !== 0) {
        return reportCrewSort === 'CREW_DESC' ? -crewCompare : crewCompare
      }
      return String(a.assignment_date || '').localeCompare(String(b.assignment_date || ''))
    })
    return rows
  }, [reportData.overtimeAssignments, reportCrewSort])

  const detailDateColumns = useMemo(
    () => buildDateRange(summaryForm.startDate, summaryForm.endDate),
    [summaryForm.startDate, summaryForm.endDate],
  )

  const detailSummaryRows = useMemo(() => {
    const groups = new Map()

    for (const row of summaryRows) {
      const groupKey = `${row.project_id ?? row.project_name}::${row.user_id ?? row.crew_name}`
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          projectId: row.project_id,
          projectName: row.project_name,
          crewName: row.crew_name,
          position: row.position || '-',
          summaryByDate: new Map(),
        })
      }

      groups.get(groupKey).summaryByDate.set(row.summary_date, row)
    }

    return Array.from(groups.values()).sort((left, right) => {
      const projectCompare = String(left.projectName || '').localeCompare(String(right.projectName || ''), 'id', { sensitivity: 'base' })
      if (projectCompare !== 0) {
        return projectCompare
      }

      return String(left.crewName || '').localeCompare(String(right.crewName || ''), 'id', { sensitivity: 'base' })
    })
  }, [summaryRows])

  const showDetailProjectColumn = !summaryForm.projectId

  const incompleteCrewSteps = useMemo(() => {
    const steps = []

    if (!selectedCrewId) {
      steps.push('Pilih nama crew')
    }

    if (!photoFile) {
      steps.push('Upload foto selfie')
    }

    if (locationState.latitude == null || locationState.longitude == null) {
      steps.push('Ambil geotag lokasi')
    }

    return steps
  }, [selectedCrewId, photoFile, locationState.latitude, locationState.longitude])

  const isCrewSubmissionComplete = incompleteCrewSteps.length === 0

  useEffect(() => {
    if (!tokenFromUrl) {
      return
    }

    loadPublicProject(tokenFromUrl)
  }, [tokenFromUrl])

  useEffect(() => {
    if (!tokenFromUrl || !publicProject) {
      return
    }

    loadCrewList(tokenFromUrl, crewTab)
  }, [tokenFromUrl, publicProject, crewTab])

  useEffect(() => {
    if (mode !== 'admin' || !canManageAdmin || !authState.token) {
      return
    }

    loadActiveDailyQrs().catch(() => {})
    const intervalId = window.setInterval(() => {
      loadActiveDailyQrs().catch(() => {})
    }, 60000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [mode, canManageAdmin, authState.token])

  async function loadPublicProject(token) {
    try {
      const { data } = await http.get('/public/projects', { params: { token } })
      setPublicProject(data.project)
      setNotice('Akses QR valid. Crew bisa mulai absensi atau lembur.')
    } catch (error) {
      setNotice(getErrorMessage(error, 'QR harian tidak valid'))
      setPublicProject(null)
    }
  }

  async function loadCrewList(token, flowType) {
    try {
      const { data } = await http.get('/public/crew', {
        params: { token, flowType },
      })
      setCrewList(data.crew)
      setSelectedCrewId(data.crew[0]?.id ?? null)
      setCrewMessage(flowType === 'OVERTIME' && data.crew.length === 0 ? 'Belum ada crew yang di-assign lembur hari ini.' : '')
    } catch (error) {
      setCrewMessage(getErrorMessage(error, 'Gagal mengambil daftar crew'))
      setCrewList([])
      setSelectedCrewId(null)
    }
  }

  function handleLocate() {
    if (!navigator.geolocation) {
      setLocationState({ latitude: null, longitude: null, status: 'Browser tidak mendukung geolocation' })
      return
    }

    setLocationState((current) => ({ ...current, status: 'Mengambil lokasi...' }))

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          status: 'Lokasi berhasil diambil',
        })
      },
      () => {
        setLocationState({ latitude: null, longitude: null, status: 'Lokasi gagal diambil. Ambil lokasi dulu sebelum submit.' })
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function submitCrewEvent(eventType) {
    if (!publicProject || !tokenFromUrl) {
      setCrewMessage('QR tidak valid atau project tidak ditemukan.')
      return
    }

    if (!isCrewSubmissionComplete) {
      const message = `Step belum lengkap: ${incompleteCrewSteps.join(', ')}.`
      setCrewMessage(message)
      showToast(message, 'error')
      return
    }

    setCrewSubmitting(true)
    setCrewMessage('')

    try {
      const formData = new FormData()
      formData.append('token', tokenFromUrl)
      formData.append('projectId', String(publicProject.id))
      formData.append('userId', String(selectedCrewId))
      formData.append('flowType', crewTab)
      formData.append('eventType', eventType)

      if (photoFile) {
        formData.append('photo', photoFile)
      }

      if (locationState.latitude != null) {
        formData.append('latitude', String(locationState.latitude))
      }

      if (locationState.longitude != null) {
        formData.append('longitude', String(locationState.longitude))
      }

      const { data } = await http.post('/public/attendance', formData)
      setCrewMessage(`Berhasil kirim ${eventType === 'CHECK_IN' ? 'Masuk' : 'Pulang'} ${crewTab === 'ATTENDANCE' ? 'Absensi' : 'Lembur'} pada ${formatDateTime(data.createdAt)}. Status: ${data.status}.`)
    } catch (error) {
      setCrewMessage(getErrorMessage(error, 'Gagal mengirim absensi'))
    } finally {
      setCrewSubmitting(false)
    }
  }

  async function loginAdmin(event) {
    event.preventDefault()
    setLoadingAdmin(true)
    setNotice('')

    try {
      const { data } = await http.post('/auth/login', loginForm)
      const nextAuth = { token: data.token, user: data.user }
      setAuthState(nextAuth)
      setMode('admin')
      setAdminPage(data.user.role === 'PIC' ? 'overtime' : 'dashboard')

      try {
        await loadAdminBootstrap(nextAuth.token, data.user.role)
      } catch (error) {
        setNotice(`Login berhasil, tetapi dashboard gagal dimuat: ${getErrorMessage(error, 'Tidak dapat memuat data admin')}`)
      }
    } catch (error) {
      setNotice(getErrorMessage(error, 'Nomor HP atau password salah.'))
    } finally {
      setLoadingAdmin(false)
    }
  }

  async function loadAdminBootstrap(token = authState.token, userRole = authState.user?.role) {
    if (!token) {
      return
    }

    const { data } = await http.get('/admin/bootstrap', {
      headers: authHeader(token),
    })

    setAdminData({ projects: data.projects, users: normalizeAdminUsers(data.users) })

    const defaultProjectId = String(data.projects[0]?.id ?? '')
    setAssignmentForm((current) => ({ ...current, projectId: current.projectId || defaultProjectId }))
    setQrForm((current) => ({ ...current, projectId: current.projectId || defaultProjectId }))
    setOvertimeForm((current) => ({ ...current, projectId: current.projectId || defaultProjectId }))
    setReportForm((current) => ({ ...current, projectId: current.projectId || defaultProjectId }))
    setSummaryForm((current) => ({ ...current, projectId: current.projectId || defaultProjectId }))

    if (defaultProjectId) {
      await loadProjectCrew(defaultProjectId, token)
      await loadOvertimeAssignments(defaultProjectId, overtimeForm.assignmentDate, token)
      if (userRole === 'ADMIN') {
        await loadProjectAssignments(defaultProjectId, token)
      }
      if (userRole === 'ADMIN') {
        await loadReports({ projectId: defaultProjectId, date: reportForm.date }, token)
        await loadSummary({ projectId: defaultProjectId, startDate: summaryForm.startDate, endDate: summaryForm.endDate }, token)
        await loadActiveDailyQrs(token)
      }
    }
  }

  async function loadActiveDailyQrs(token = authState.token) {
    if (!token) {
      setActiveDailyQrs([])
      return
    }

    const { data } = await http.get('/admin/qr/daily/active', {
      headers: authHeader(token),
    })
    setActiveDailyQrs(data)
  }

  async function loadProjectCrew(projectId, token = authState.token) {
    if (!projectId || !token) {
      setProjectCrew([])
      return
    }

    const { data } = await http.get(`/admin/projects/${projectId}/crew`, {
      headers: authHeader(token),
    })
    setProjectCrew(data)
  }

  async function loadProjectAssignments(projectId, token = authState.token) {
    if (!projectId || !token) {
      setProjectAssignments([])
      return
    }

    setLoadingAssignments(true)
    try {
      const { data } = await http.get(`/admin/projects/${projectId}/assignments`, {
        headers: authHeader(token),
      })
      setProjectAssignments(data)
    } finally {
      setLoadingAssignments(false)
    }
  }

  async function loadOvertimeAssignments(projectId, assignmentDate = overtimeForm.assignmentDate, token = authState.token) {
    if (!projectId || !token) {
      setOvertimeAssignments([])
      return
    }

    setLoadingOvertimeAssignments(true)
    try {
      const { data } = await http.get('/pic/overtime-assignments', {
        headers: authHeader(token),
        params: {
          projectId,
          assignmentDate,
        },
      })
      setOvertimeAssignments(data)
    } finally {
      setLoadingOvertimeAssignments(false)
    }
  }

  async function loadReports(params, token = authState.token) {
    if (!token) {
      return
    }

    const { data } = await http.get('/admin/reports', {
      headers: authHeader(token),
      params,
    })
    setReportData({
      attendance: data.attendance || [],
      overtimeAssignments: data.overtimeAssignments || [],
    })
  }

  async function loadSummary(params, token = authState.token) {
    if (!token) {
      setSummaryRows([])
      return
    }

    const { data } = await http.get('/admin/reports/summary', {
      headers: authHeader(token),
      params,
    })
    setSummaryRows(data.summary || [])
  }

  async function createUser(event) {
    event.preventDefault()
    try {
      await http.post('/admin/users', {
        ...userForm,
        password: NO_PASSWORD_ROLES.has(userForm.role) ? null : (userForm.password || null),
      }, { headers: authHeader() })
      setUserForm({ name: '', ktp: '', phone: '', role: 'CREW', password: '' })
      await loadAdminBootstrap()
      showToast('User baru berhasil ditambahkan.', 'success')
      showToast('User berhasil ditambahkan', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal menambah user'))
    }
  }

  async function uploadCrewUsers(event) {
    event.preventDefault()
    if (!crewUploadFile) {
      setNotice('Pilih file CSV terlebih dahulu')
      return
    }

    const formData = new FormData()
    formData.append('file', crewUploadFile)

    setCrewUploadLoading(true)
    try {
      const { data } = await http.post('/admin/users/upload-crew', formData, {
        headers: {
          ...authHeader(),
          'Content-Type': 'multipart/form-data',
        },
      })

      await loadAdminBootstrap()
      setCrewUploadFile(null)
      const message = data.failedCount > 0
        ? `${data.createdCount} crew berhasil, ${data.failedCount} gagal.`
        : `${data.createdCount} crew berhasil diupload.`
      setNotice(message)
      showToast(message, 'success')
    } catch (error) {
      const apiMessage = error?.response?.data?.message
      const failedCount = error?.response?.data?.failedCount
      const message = failedCount
        ? `${apiMessage} (${failedCount} baris gagal)`
        : getErrorMessage(error, 'Gagal upload crew')
      setNotice(message)
    } finally {
      setCrewUploadLoading(false)
    }
  }

  async function createProject(event) {
    event.preventDefault()
    try {
      await http.post('/admin/projects', {
        ...projectForm,
        picUserId: projectForm.picUserId ? Number(projectForm.picUserId) : null,
      }, { headers: authHeader() })
      setProjectForm({ code: '', name: '', picUserId: '' })
      await loadAdminBootstrap()
      showToast('Project berhasil dibuat.', 'success')
      showToast('Project berhasil ditambahkan', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal membuat project'))
    }
  }

  function startEditProject(project) {
    setEditingProjectId(project.id)
    setEditingProjectForm({
      code: project.code,
      name: project.name,
      picUserId: project.picUserId ? String(project.picUserId) : '',
    })
  }

  function cancelEditProject() {
    setEditingProjectId(null)
    setEditingProjectForm({ code: '', name: '', picUserId: '' })
  }

  async function saveProject(projectId) {
    try {
      await http.patch(`/admin/projects/${projectId}`, {
        code: editingProjectForm.code,
        name: editingProjectForm.name,
        picUserId: editingProjectForm.picUserId ? Number(editingProjectForm.picUserId) : null,
      }, { headers: authHeader() })

      await loadAdminBootstrap()
      cancelEditProject()
      showToast('Project berhasil diubah.', 'success')
      showToast('Project berhasil diubah', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal mengubah project'))
    }
  }

  async function deleteProject(project) {
    const confirmed = window.confirm(`Hapus project ${project.code} · ${project.name}?`)
    if (!confirmed) {
      return
    }

    try {
      await http.delete(`/admin/projects/${project.id}`, {
        headers: authHeader(),
      })

      await loadAdminBootstrap()
      showToast('Project berhasil dihapus.', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal menghapus project'))
    }
  }

  async function toggleProjectActive(project) {
    try {
      await http.patch(`/admin/projects/${project.id}/toggle-active`, {}, { headers: authHeader() })
      await loadAdminBootstrap()
      showToast(project.isActive ? 'Project dinonaktifkan.' : 'Project diaktifkan.', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal mengubah status project'))
    }
  }

  async function assignProject(event) {
    event.preventDefault()

    const selectedUser = nonAdminUsers.find((user) => user.id === Number(assignmentForm.userId))
    if (!selectedUser) {
      setNotice('Pilih user yang valid untuk assignment.')
      return
    }

    if (!ASSIGNMENT_ROLE_SET.has(selectedUser.role)) {
      setNotice(`Role user ${selectedUser.role} tidak bisa di-assign ke project.`)
      return
    }

    try {
      await http.post(`/admin/projects/${assignmentForm.projectId}/assignments`, {
        userId: Number(assignmentForm.userId),
        assignmentRole: selectedUser.role,
      }, { headers: authHeader() })
      await loadAdminBootstrap()
      if (assignmentForm.projectId) {
        await loadProjectCrew(assignmentForm.projectId)
        await loadProjectAssignments(assignmentForm.projectId)
      }
      showToast('Assignment project berhasil disimpan.', 'success')
      showToast('Assignment project berhasil disimpan', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal menyimpan assignment'))
    }
  }

  async function generateQr(event) {
    event.preventDefault()
    try {
      const { data } = await http.post('/admin/qr/daily', {
        projectId: Number(qrForm.projectId),
        qrDate: qrForm.qrDate,
      }, { headers: authHeader() })
      setQrResult(data)
      await loadActiveDailyQrs()
      showToast('QR harian berhasil dibuat.', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal membuat QR harian'))
    }
  }

  async function deleteActiveQr(item) {
    const confirmed = window.confirm(`Hapus QR aktif untuk ${item.projectCode} · ${item.projectName}?`)
    if (!confirmed) {
      return
    }

    try {
      await http.delete(`/admin/qr/daily/${item.id}`, {
        headers: authHeader(),
      })

      if (qrResult?.token && qrResult.qrValue === item.qrValue) {
        setQrResult(null)
      }
      await loadActiveDailyQrs()
      showToast('QR harian berhasil dihapus.', 'success')
      showToast('QR harian berhasil dihapus', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal menghapus QR harian'))
    }
  }

  async function copyQrLink(qrValue) {
    if (!qrValue) {
      setNotice('Link QR tidak tersedia')
      return
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(qrValue)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = qrValue
        textArea.setAttribute('readonly', '')
        textArea.style.position = 'absolute'
        textArea.style.left = '-9999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }

      showToast('Link QR berhasil disalin', 'success')
    } catch {
      setNotice('Gagal menyalin link QR')
    }
  }

  async function assignOvertime(event) {
    event.preventDefault()
    try {
      const { data } = await http.post('/pic/overtime-assignments', {
        projectId: Number(overtimeForm.projectId),
        assignmentDate: overtimeForm.assignmentDate,
        userIds: overtimeForm.userIds.map(Number),
      }, { headers: authHeader() })
      await loadOvertimeAssignments(overtimeForm.projectId, overtimeForm.assignmentDate)
      if (canManageAdmin) {
        await loadReports({ projectId: overtimeForm.projectId, date: overtimeForm.assignmentDate })
      }
      setNotice(`Lembur berhasil di-assign ke ${data.assignedUserIds.length} crew.`)
      showToast(`Lembur berhasil di-assign ke ${data.assignedUserIds.length} crew`, 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal assign lembur'))
    }
  }

  function showToast(message, type = 'success') {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((current) => [...current, { id, type, message }])

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3200)
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  async function refreshReports(event) {
    event?.preventDefault()
    try {
      await loadReports({
        projectId: reportForm.projectId || undefined,
        date: reportForm.date,
      })
      showToast('Report berhasil dimuat ulang.', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal memuat report'))
    }
  }

  async function updateAttendanceReview(row, approved) {
    const actionLabel = approved ? 'approve' : 'tolak'
    const confirmed = window.confirm(`${actionLabel === 'approve' ? 'Approve' : 'Tolak'} review untuk ${row.crew_name} (${row.flow_type} - ${row.event_type})?`)
    if (!confirmed) {
      return
    }

    try {
      await http.patch(`/admin/attendance/${row.id}/review`, {
        approved,
      }, { headers: authHeader() })

      await loadReports({
        projectId: reportForm.projectId || undefined,
        date: reportForm.date,
      })

      showToast(`Review attendance berhasil di-${approved ? 'approve' : 'tolak'}`, 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal memperbarui review attendance'))
    }
  }

  function openPhotoPreview(row) {
    const url = resolveUploadedPhotoUrl(row.photo_path)
    if (!url) {
      setNotice('Foto tidak tersedia')
      return
    }

    setPhotoPreview({
      open: true,
      url,
      crewName: row.crew_name || 'Crew',
    })
  }

  async function refreshSummary(event) {
    event?.preventDefault()
    try {
      await loadSummary({
        projectId: summaryForm.projectId || undefined,
        startDate: summaryForm.startDate,
        endDate: summaryForm.endDate,
      })
      showToast('Rangkuman berhasil dimuat ulang.', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal memuat rangkuman'))
    }
  }

  async function refreshDetailReport(event) {
    event?.preventDefault()
    try {
      await loadSummary({
        projectId: summaryForm.projectId || undefined,
        startDate: summaryForm.startDate,
        endDate: summaryForm.endDate,
      })
      showToast('Detail absen berhasil dimuat ulang.', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal memuat detail absen'))
    }
  }

  async function downloadCsv() {
    try {
      const { data } = await http.get('/admin/reports/export', {
        headers: authHeader(),
        params: {
          date: reportForm.date,
          projectId: reportForm.projectId || undefined,
        },
        responseType: 'blob',
      })

      const blobUrl = window.URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `report-${reportForm.date}.csv`
      link.click()
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal export CSV'))
    }
  }

  async function downloadSummaryCsv() {
    try {
      const { data } = await http.get('/admin/reports/summary/export', {
        headers: authHeader(),
        params: {
          startDate: summaryForm.startDate,
          endDate: summaryForm.endDate,
          projectId: summaryForm.projectId || undefined,
        },
        responseType: 'blob',
      })

      const blobUrl = window.URL.createObjectURL(data)
      const link = document.createElement('a')
      const selectedProjectName = summaryForm.projectId
        ? adminData.projects.find((project) => String(project.id) === String(summaryForm.projectId))?.name
        : 'Semua-Project'
      const safeProjectName = String(selectedProjectName || 'Semua-Project').replace(/[^a-zA-Z0-9-_]+/g, '-')
      link.href = blobUrl
      link.download = `rangkuman-${safeProjectName}-${summaryForm.startDate}-to-${summaryForm.endDate}.csv`
      link.click()
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal export rangkuman'))
    }
  }

  async function downloadDetailSummaryCsv() {
    try {
      const header = ['No']
      if (showDetailProjectColumn) {
        header.push('Project')
      }
      header.push('Nama', 'Posisi')

      for (const date of detailDateColumns) {
        const formattedDate = formatDate(date)
        header.push(`${formattedDate} In`, `${formattedDate} Out`)
      }

      const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

      const rows = detailSummaryRows.map((row, index) => {
        const values = [index + 1]
        if (showDetailProjectColumn) {
          values.push(row.projectName)
        }
        values.push(row.crewName, row.position)

        for (const date of detailDateColumns) {
          const dayRecord = row.summaryByDate.get(date)
          values.push(
            formatTime(dayRecord?.attendance_check_in),
            formatTime(dayRecord?.attendance_check_out),
          )
        }

        return values.map(escapeCsv).join(',')
      })

      const csvString = [header.map(escapeCsv).join(','), ...rows].join('\n')
      const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' })
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      const selectedProjectName = summaryForm.projectId
        ? adminData.projects.find((project) => String(project.id) === String(summaryForm.projectId))?.name
        : 'Semua-Project'
      const safeProjectName = String(selectedProjectName || 'Semua-Project').replace(/[^a-zA-Z0-9-_]+/g, '-')

      link.href = blobUrl
      link.download = `detail-absen-${safeProjectName}-${summaryForm.startDate}-to-${summaryForm.endDate}.csv`
      link.click()
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal export detail absen'))
    }
  }

  async function downloadDatabaseBackup() {
    setBackupLoading(true)

    try {
      const { data, headers } = await http.get('/admin/backup/export', {
        headers: authHeader(),
        responseType: 'blob',
      })

      const contentDisposition = headers?.['content-disposition'] || ''
      const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
      const fileName = fileNameMatch?.[1] || `crew-backup-${dayjs().format('YYYYMMDD-HHmmss')}.db`

      const blobUrl = window.URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      link.click()
      window.URL.revokeObjectURL(blobUrl)

      showToast('Backup database berhasil diunduh', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal mengunduh backup database'))
    } finally {
      setBackupLoading(false)
    }
  }

  async function restoreDatabaseBackup(event) {
    event.preventDefault()

    if (!backupRestoreFile) {
      setNotice('Pilih file backup (.db) terlebih dahulu')
      return
    }

    const confirmed = window.confirm('Restore backup akan menimpa data saat ini. Lanjutkan?')
    if (!confirmed) {
      return
    }

    setBackupLoading(true)

    try {
      const formData = new FormData()
      formData.append('backup', backupRestoreFile)

      const { data } = await http.post('/admin/backup/restore', formData, {
        headers: {
          ...authHeader(),
          'Content-Type': 'multipart/form-data',
        },
      })

      setBackupRestoreFile(null)
      if (backupRestoreInputRef.current) {
        backupRestoreInputRef.current.value = ''
      }

      await loadAdminBootstrap()
      showToast('Restore backup berhasil', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal restore backup'))
    } finally {
      setBackupLoading(false)
    }
  }

  function startEditUser(user) {
    setEditingUserId(user.id)
    setEditingUserForm({
      name: user.name || '',
      ktp: user.ktp || '',
      phone: user.phone || '',
    })
  }

  function cancelEditUser() {
    setEditingUserId(null)
    setEditingUserForm({ name: '', ktp: '', phone: '' })
  }

  async function saveEditUser(userId) {
    if (!editingUserForm.name.trim() || editingUserForm.name.trim().length < 2) {
      setNotice('Nama minimal 2 karakter')
      return
    }

    if (!editingUserForm.ktp.trim() || editingUserForm.ktp.trim().length < 8) {
      setNotice('KTP minimal 8 karakter')
      return
    }

    if (!editingUserForm.phone.trim() || editingUserForm.phone.trim().length < 8) {
      setNotice('No telp minimal 8 karakter')
      return
    }

    try {
      await http.patch(`/admin/users/${userId}`, {
        name: editingUserForm.name.trim(),
        ktp: editingUserForm.ktp.trim(),
        phone: editingUserForm.phone.trim(),
      }, { headers: authHeader() })
      await loadAdminBootstrap()
      cancelEditUser()
      showToast('Data user berhasil diubah', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal mengubah data user'))
    }
  }

  async function toggleUserStatus(user) {
    const nextStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const confirmed = window.confirm(`Ubah status "${user.name}" menjadi ${nextStatus}?`)
    if (!confirmed) {
      return
    }

    try {
      await http.patch(`/admin/users/${user.id}/status`, {}, { headers: authHeader() })
      await loadAdminBootstrap()
      showToast(`Status user diubah ke ${nextStatus}`, 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal mengubah status user'))
    }
  }

  async function deleteUser(user) {
    const confirmed = window.confirm(`Hapus user "${user.name}"? Tindakan ini tidak bisa dibatalkan.`)
    if (!confirmed) {
      return
    }

    try {
      await http.delete(`/admin/users/${user.id}`, { headers: authHeader() })
      await loadAdminBootstrap()
      showToast('User berhasil dihapus', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal menghapus user'))
    }
  }

  async function changePicPassword(user) {
    if (user.role !== 'PIC') {
      return
    }

    const newPassword = window.prompt(`Masukkan password baru untuk PIC "${user.name}"`)?.trim()
    if (!newPassword) {
      return
    }

    if (newPassword.length < 3) {
      setNotice('Password minimal 3 karakter')
      return
    }

    const confirmed = window.confirm(`Ubah password PIC "${user.name}" sekarang?`)
    if (!confirmed) {
      return
    }

    try {
      await http.patch(`/admin/users/${user.id}/password`, { newPassword }, { headers: authHeader() })
      showToast('Password PIC berhasil diubah', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal mengubah password PIC'))
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault()
    
    if (!changePasswordForm.oldPassword || !changePasswordForm.newPassword || !changePasswordForm.confirmPassword) {
      setNotice('Semua field harus diisi')
      return
    }

    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      setNotice('Password baru dan konfirmasi tidak sama')
      return
    }

    if (changePasswordForm.newPassword.length < 3) {
      setNotice('Password minimal 3 karakter')
      return
    }

    setChangePasswordLoading(true)
    try {
      await http.post('/auth/change-password', {
        oldPassword: changePasswordForm.oldPassword,
        newPassword: changePasswordForm.newPassword,
      }, { headers: authHeader() })
      
      setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
      setShowChangePasswordModal(false)
      showToast('Password berhasil diubah', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal mengubah password'))
    } finally {
      setChangePasswordLoading(false)
    }
  }

  function startEditProjectAssignment(assignment) {
    setEditingAssignmentId(assignment.id)
    setEditingAssignmentProjectId(String(assignment.project_id))
  }

  function cancelEditProjectAssignment() {
    setEditingAssignmentId(null)
    setEditingAssignmentProjectId('')
  }

  async function saveProjectAssignment(assignment) {
    const nextProjectId = Number(editingAssignmentProjectId)
    if (Number.isNaN(nextProjectId)) {
      setNotice('Project tujuan tidak valid.')
      return
    }

    try {
      await http.patch(`/admin/projects/${assignment.project_id}/assignments/${assignment.id}`, {
        projectId: nextProjectId,
      }, { headers: authHeader() })

      await loadProjectAssignments(String(assignment.project_id))
      await loadProjectCrew(String(assignment.project_id))
      cancelEditProjectAssignment()
      showToast('Assignment berhasil diubah', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal mengubah assignment'))
    }
  }

  async function deleteProjectAssignment(assignment) {
    const confirmed = window.confirm(`Hapus assignment ${assignment.user_name} dari project ini?`)
    if (!confirmed) {
      return
    }

    try {
      await http.delete(`/admin/projects/${assignment.project_id}/assignments/${assignment.id}`, {
        headers: authHeader(),
      })

      await loadProjectAssignments(String(assignment.project_id))
      await loadProjectCrew(String(assignment.project_id))
      showToast('Assignment berhasil dihapus', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal menghapus assignment'))
    }
  }

  async function deleteOvertimeAssignment(assignment) {
    const confirmed = window.confirm(`Hapus assignment lembur ${assignment.user_name}?`)
    if (!confirmed) {
      return
    }

    try {
      await http.delete(`/pic/overtime-assignments/${assignment.id}`, {
        headers: authHeader(),
      })

      await loadOvertimeAssignments(String(assignment.project_id), overtimeForm.assignmentDate)
      if (canManageAdmin) {
        await loadReports({ projectId: overtimeForm.projectId, date: overtimeForm.assignmentDate })
      }
      showToast('Data lembur berhasil dihapus', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal menghapus data lembur'))
    }
  }

  function authHeader(token = authState.token) {
    return { Authorization: `Bearer ${token}` }
  }

  function logoutAdmin() {
    setAuthState({ token: '', user: null })
    setAdminPage('dashboard')
    setAdminData({ projects: [], users: [] })
    setProjectCrew([])
    setProjectAssignments([])
    setOvertimeAssignments([])
    setReportData({ attendance: [], overtimeAssignments: [] })
    setSummaryRows([])
    setQrResult(null)
    setActiveDailyQrs([])
    setBackupRestoreFile(null)
    setMode('admin')
    // setNotice('Logout berhasil.')
  }

  // Derived values for project list with search + pagination (change #5)
  const filteredProjects = useMemo(() => {
    const q = projectListSearch.trim().toLowerCase()
    if (!q) return adminData.projects
    return adminData.projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    )
  }, [adminData.projects, projectListSearch])
  const projectListPageSize = 10
  const projectListTotalPages = Math.max(1, Math.ceil(filteredProjects.length / projectListPageSize))
  const pagedProjects = filteredProjects.slice(
    (projectListPage - 1) * projectListPageSize,
    projectListPage * projectListPageSize,
  )

  if (mode === 'crew') {
    return (
      <div className="shell">
        {toasts.length > 0 && (
          <div className="toast-stack" role="status" aria-live="polite">
            {toasts.map((toast) => (
              <div key={toast.id} className={`toast ${toast.type === 'success' ? 'success' : ''}`}>
                <p>{toast.message}</p>
                <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Tutup notifikasi">×</button>
              </div>
            ))}
          </div>
        )}
        {notice && <div className="notice">{notice}</div>}
        <section className="panel crew-layout">
          <div className="panel-header">
            <div>
              <p className="section-label">Akses Crew</p>
              <h2>{publicProject ? publicProject.name : 'Scan QR harian terlebih dahulu'}</h2>
            </div>
            {publicProject && (
              <div className="tag-stack">
                <span className="tag">{publicProject.code}</span>
                <span className="tag">Berlaku sampai {dayjs(publicProject.expiresAt).format('HH:mm')}</span>
              </div>
            )}
          </div>

          {!tokenFromUrl ? (
            <div className="empty-state">
              <p>Halaman crew hanya bisa diakses dari QR harian. Buka URL yang dihasilkan admin untuk project hari ini.</p>
            </div>
          ) : !publicProject ? (
            <div className="empty-state">
              <p>Token QR tidak valid atau sudah kedaluwarsa.</p>
            </div>
          ) : (
            <>
              <div className="tab-row">
                <button className={crewTab === 'ATTENDANCE' ? 'active' : ''} onClick={() => setCrewTab('ATTENDANCE')} type="button">
                  Absensi
                </button>
                <button className={crewTab === 'OVERTIME' ? 'active' : ''} onClick={() => setCrewTab('OVERTIME')} type="button">
                  Lembur
                </button>
              </div>

              <div className="grid two-columns">
                <div className="card">
                  <label>Cari nama crew</label>
                  <input value={crewSearch} onChange={(event) => setCrewSearch(event.target.value)} placeholder="Nama atau no telp" />

                  <div className="crew-list">
                    {filteredCrew.map((crew) => (
                      <button
                        key={crew.id}
                        className={Number(selectedCrewId) === crew.id ? 'crew-item active' : 'crew-item'}
                        onClick={() => setSelectedCrewId(crew.id)}
                        type="button"
                      >
                        <span>{crew.name}</span>
                        <small>{crew.phone}</small>
                      </button>
                    ))}

                    {filteredCrew.length === 0 && <p className="hint">Tidak ada crew yang cocok dengan pencarian.</p>}
                  </div>
                </div>

                <div className="card">
                  <label>Selfie crew</label>
                  <input type="file" accept="image/*" capture="user" onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} />
                  <p className="hint">Gunakan kamera depan HP untuk selfie masuk atau pulang. (Wajib)</p>

                  <label>Geolocation</label>
                  <button className="secondary-action" onClick={handleLocate} type="button">
                    Ambil lokasi
                  </button>
                  <p className="hint">
                    {locationState.status}
                    {locationState.latitude != null && ` (${locationState.latitude.toFixed(5)}, ${locationState.longitude.toFixed(5)})`}
                  </p>
                  <p className="hint">Geotag wajib diambil sebelum submit.</p>
                  {!isCrewSubmissionComplete && (
                    <p className="hint">Lengkapi dulu: {incompleteCrewSteps.join(' · ')}</p>
                  )}

                  <div className="action-row">
                    <button disabled={crewSubmitting} onClick={() => submitCrewEvent('CHECK_IN')} type="button">
                      {crewSubmitting ? 'Menyimpan...' : 'Masuk'}
                    </button>
                    <button disabled={crewSubmitting} onClick={() => submitCrewEvent('CHECK_OUT')} type="button">
                      {crewSubmitting ? 'Menyimpan...' : 'Pulang'}
                    </button>
                  </div>

                  {crewMessage && <p className="result-text">{crewMessage}</p>}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    )
  }

  if (!authState.token) {
    return (
      <div className="shell">
        {toasts.length > 0 && (
          <div className="toast-stack" role="status" aria-live="polite">
            {toasts.map((toast) => (
              <div key={toast.id} className={`toast ${toast.type === 'success' ? 'success' : ''}`}>
                <p>{toast.message}</p>
                <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Tutup notifikasi">×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <form className="card auth-card" onSubmit={loginAdmin} style={{ width: '100%', maxWidth: 360 }}>
            <p className="section-label">Login Admin / PIC</p>
            <h2>Masuk ke dashboard</h2>
            <label>Nomor HP</label>
            <input value={loginForm.phone} onChange={(event) => setLoginForm((current) => ({ ...current, phone: event.target.value }))} />
            <label>Password</label>
            <input type="password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} />
            {notice && <div className="notice" style={{ marginTop: 8, marginBottom: 0 }}>{notice}</div>}
            <button disabled={loadingAdmin} type="submit" style={{ marginTop: 16, width: '100%' }}>{loadingAdmin ? 'Memproses...' : 'Login'}</button>
          </form>
        </div>
      </div>
    )
  }

  // Authenticated admin/PIC sidebar layout
  const sidebarStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: 220,
    height: '100vh',
    background: 'var(--surface)',
    borderRight: '1.5px solid var(--line-strong)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
    overflowY: 'auto',
  }
  const navItemStyle = (active) => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '9px 18px',
    background: active ? 'rgba(13,109,119,0.10)' : 'transparent',
    color: active ? 'var(--brand)' : '#3d5166',
    fontWeight: active ? 700 : 400,
    fontSize: '0.88rem',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 0,
  })
  const sectionLabelStyle = {
    padding: '14px 18px 4px',
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#9aacbb',
    textTransform: 'uppercase',
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 99, display: 'none' }}
          className="mobile-overlay"
        />
      )}

      {/* Fixed left sidebar */}
      <div style={{ ...sidebarStyle, transform: undefined }} className={`app-sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div style={{ padding: '20px 18px 16px', borderBottom: '1.5px solid var(--line-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/emaki-logo.png" alt="Logo" style={{ height: 44, width: 'auto', display: 'block' }} />
        </div>

        <nav style={{ flex: 1, paddingTop: 8 }}>
          <button style={navItemStyle(adminPage === 'dashboard')} onClick={() => setAdminPage('dashboard')} type="button">
            Dashboard
          </button>
          {canManageAdmin && (
            <button style={navItemStyle(adminPage === 'projects')} onClick={() => setAdminPage('projects')} type="button">
              Projects
            </button>
          )}
          {canManageAdmin && (
            <button style={navItemStyle(adminPage === 'users')} onClick={() => setAdminPage('users')} type="button">
              Users
            </button>
          )}
          {canManageAdmin && (
            <button style={navItemStyle(adminPage === 'assignment-management')} onClick={() => setAdminPage('assignment-management')} type="button">
              Assignment
            </button>
          )}
          <button style={navItemStyle(adminPage === 'overtime-management')} onClick={() => setAdminPage('overtime-management')} type="button">
            Lembur
          </button>

          {canManageAdmin && (
            <>
              <div style={sectionLabelStyle}>Laporan</div>
              <button style={navItemStyle(adminPage === 'report')} onClick={() => setAdminPage('report')} type="button">
                Laporan Harian
              </button>
              <button style={navItemStyle(adminPage === 'summary')} onClick={() => setAdminPage('summary')} type="button">
                Ringkasan
              </button>
              <button style={navItemStyle(adminPage === 'detail-report')} onClick={() => setAdminPage('detail-report')} type="button">
                Detail Absensi
              </button>
            </>
          )}

          {canManageAdmin && (
            <>
              <div style={sectionLabelStyle}>Sistem</div>
              <button style={navItemStyle(adminPage === 'admin')} onClick={() => setAdminPage('admin')} type="button">
                Admin
              </button>
            </>
          )}
        </nav>

        {/* Sidebar footer */}
        <div style={{ padding: '12px 18px', borderTop: '1.5px solid var(--line-strong)' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#102031', margin: 0 }}>{authState.user?.name}</p>
          <p style={{ fontSize: '0.72rem', color: '#7a90a4', margin: '2px 0 10px' }}>{authState.user?.role}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              type="button"
              style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'transparent', border: '1.5px solid var(--line-strong)', borderRadius: 8, cursor: 'pointer', color: '#3d5166', textAlign: 'left' }}
              onClick={() => setShowChangePasswordModal(true)}
            >
              Ubah Password
            </button>
            <button
              type="button"
              style={{ fontSize: '0.78rem', padding: '6px 10px', background: 'transparent', border: '1.5px solid var(--line-strong)', borderRadius: 8, cursor: 'pointer', color: '#c0392b', textAlign: 'left' }}
              onClick={logoutAdmin}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ marginLeft: 220, flex: 1, minWidth: 0 }} className="main-content-area">
        {/* Mobile topbar */}
        <div className="mobile-topbar-bar">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', padding: '0 4px', color: '#3d5166', lineHeight: 1 }}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <img src="/emaki-logo.png" alt="Logo" style={{ height: 28, width: 'auto' }} />
        </div>
        {toasts.length > 0 && (
          <div className="toast-stack" role="status" aria-live="polite">
            {toasts.map((toast) => (
              <div key={toast.id} className={`toast ${toast.type === 'success' ? 'success' : ''}`}>
                <p>{toast.message}</p>
                <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Tutup notifikasi">×</button>
              </div>
            ))}
          </div>
        )}
        {notice && <div className="notice">{notice}</div>}

        <div className="admin-grid">
          <div className="admin-content">
              {adminPage === 'users' && canManageAdmin ? (
                <div className="grid">
                  <form className="card" onSubmit={createUser}>
                    <p className="section-label">Master Crew</p>
                    <h2>Tambah user</h2>
                    <label>Nama</label>
                    <input value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} />
                    <label>KTP</label>
                    <input value={userForm.ktp} onChange={(event) => setUserForm((current) => ({ ...current, ktp: event.target.value }))} />
                    <label>No telp</label>
                    <input value={userForm.phone} onChange={(event) => setUserForm((current) => ({ ...current, phone: event.target.value }))} />
                    <label>Role</label>
                    <select value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}>
                      {USER_ROLES.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    {!NO_PASSWORD_ROLES.has(userForm.role) && (
                      <>
                        <label>Password (khusus Admin/PIC)</label>
                        <input value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} />
                      </>
                    )}
                    <button type="submit" style={{ marginTop: 16 }}>Simpan user</button>

                    <hr />
                    <p className="section-label">Upload massal crew</p>
                    <label>File CSV (name, ktp, phone, role)</label>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => setCrewUploadFile(event.target.files?.[0] || null)}
                    />
                    <p className="hint">Role mengikuti file upload (CREW / HEAD CREW / KASIR / SPG / Back Up SPG / Talent / LO / Crew Store). Password tetap kosong.</p>
                    <button type="button" onClick={uploadCrewUsers} disabled={crewUploadLoading}>
                      {crewUploadLoading ? 'Mengupload...' : 'Upload crew'}
                    </button>
                  </form>

                  <div className="card">
                    <div className="panel-header">
                      <div>
                        <p className="section-label">List User</p>
                        <h2>Daftar user terdaftar</h2>
                      </div>
                      <span className="tag">{filteredAdminUsers.length} dari {adminData.users.length} user</span>
                    </div>

                    <div className="filter-grid">
                      <input
                        value={userListFilters.search}
                        onChange={(event) => { setUserListFilters((current) => ({ ...current, search: event.target.value })); setUserListPage(1) }}
                        placeholder="Cari nama atau no telp"
                      />
                      <select value={userListFilters.role} onChange={(event) => { setUserListFilters((current) => ({ ...current, role: event.target.value })); setUserListPage(1) }}>
                        <option value="">Semua role</option>
                        {USER_ROLES.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                      <select value={userListFilters.status} onChange={(event) => { setUserListFilters((current) => ({ ...current, status: event.target.value })); setUserListPage(1) }}>
                        <option value="">Semua status</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                      </select>
                      <select value={userListFilters.project} onChange={(event) => { setUserListFilters((current) => ({ ...current, project: event.target.value })); setUserListPage(1) }}>
                        <option value="">Semua project</option>
                        {adminData.projects.map((project) => (
                          <option key={project.id} value={project.name}>{project.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Nama</th>
                            <th>KTP</th>
                            <th>No telp</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Project</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAdminUsers.slice((userListPage - 1) * 10, userListPage * 10).map((user) => (
                            <tr key={user.id}>
                              <td>
                                {editingUserId === user.id ? (
                                  <input
                                    value={editingUserForm.name}
                                    onChange={(event) => setEditingUserForm((current) => ({ ...current, name: event.target.value }))}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') saveEditUser(user.id)
                                      if (event.key === 'Escape') cancelEditUser()
                                    }}
                                    autoFocus
                                    style={{ minWidth: 120, marginBottom: 0 }}
                                  />
                                ) : user.name}
                              </td>
                              <td>
                                {editingUserId === user.id ? (
                                  <input
                                    value={editingUserForm.ktp}
                                    onChange={(event) => setEditingUserForm((current) => ({ ...current, ktp: event.target.value }))}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') saveEditUser(user.id)
                                      if (event.key === 'Escape') cancelEditUser()
                                    }}
                                    style={{ minWidth: 140, marginBottom: 0 }}
                                  />
                                ) : (user.ktp || '-')}
                              </td>
                              <td>
                                {editingUserId === user.id ? (
                                  <input
                                    value={editingUserForm.phone}
                                    onChange={(event) => setEditingUserForm((current) => ({ ...current, phone: event.target.value }))}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') saveEditUser(user.id)
                                      if (event.key === 'Escape') cancelEditUser()
                                    }}
                                    style={{ minWidth: 120, marginBottom: 0 }}
                                  />
                                ) : user.phone}
                              </td>
                              <td>{user.role}</td>
                              <td>{user.status}</td>
                              <td>{user.projectNames?.join(', ') || '-'}</td>
                              <td>
                                {editingUserId === user.id ? (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button type="button" className="secondary-action" onClick={() => saveEditUser(user.id)}>Simpan</button>
                                    <button type="button" className="secondary-action" onClick={cancelEditUser}>Batal</button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    <button type="button" className="secondary-action" onClick={() => startEditUser(user)}>Edit</button>
                                    {user.role === 'PIC' && (
                                      <button type="button" className="secondary-action" onClick={() => changePicPassword(user)}>
                                        Password PIC
                                      </button>
                                    )}
                                    <button type="button" className="secondary-action" onClick={() => toggleUserStatus(user)}>
                                      {user.status === 'ACTIVE' ? 'Non-aktif' : 'Aktifkan'}
                                    </button>
                                    <button type="button" className="secondary-action" onClick={() => deleteUser(user)}>Hapus</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(() => {
                      const totalPages = Math.ceil(filteredAdminUsers.length / 10)
                      if (totalPages <= 1) return null
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--ink-3)' }}>
                            Halaman {userListPage} dari {totalPages} &middot; {filteredAdminUsers.length} user
                          </span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button type="button" className="secondary-action" style={{ padding: '4px 10px', fontSize: '0.8rem' }} disabled={userListPage === 1} onClick={() => setUserListPage(1)}>&#171;</button>
                            <button type="button" className="secondary-action" style={{ padding: '4px 10px', fontSize: '0.8rem' }} disabled={userListPage === 1} onClick={() => setUserListPage(p => p - 1)}>&#8249;</button>
                            <button type="button" className="secondary-action" style={{ padding: '4px 10px', fontSize: '0.8rem' }} disabled={userListPage === totalPages} onClick={() => setUserListPage(p => p + 1)}>&#8250;</button>
                            <button type="button" className="secondary-action" style={{ padding: '4px 10px', fontSize: '0.8rem' }} disabled={userListPage === totalPages} onClick={() => setUserListPage(totalPages)}>&#187;</button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              ) : adminPage === 'report' && canManageAdmin ? (
                <div className="card">
                  <div className="panel-header">
                    <div>
                      <p className="section-label">Report</p>
                      <h2>Absensi dan lembur</h2>
                    </div>
                    <button className="secondary-action" onClick={downloadCsv} type="button">
                      Export CSV
                    </button>
                  </div>

                  <form className="filter-row" onSubmit={refreshReports}>
                    <ProjectSelect
                      projects={adminData.projects}
                      value={reportForm.projectId}
                      onChange={(v) => { setReportForm((c) => ({ ...c, projectId: v })); loadProjectCrew(v) }}
                      placeholder="Semua project"
                    />
                    <input type="date" value={reportForm.date} onChange={(event) => setReportForm((current) => ({ ...current, date: event.target.value }))} />
                    <select value={reportCrewSort} onChange={(event) => setReportCrewSort(event.target.value)}>
                      <option value="CREW_ASC">Crew A-Z</option>
                      <option value="CREW_DESC">Crew Z-A</option>
                    </select>
                    <button type="submit">Muat report</button>
                  </form>

                  <div className="grid">
                    <div>
                      <h3>Data absensi</h3>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Waktu</th>
                              <th>Project</th>
                              <th>Crew</th>
                              <th>Flow</th>
                              <th>Event</th>
                              <th>Status</th>
                              <th>Geo Tag</th>
                              <th>Foto</th>
                              <th>Review</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedReportAttendance.map((row) => (
                              <tr key={row.id}>
                                <td>{formatDateTime(row.created_at)}</td>
                                <td>{row.project_name}</td>
                                <td>{row.crew_name}</td>
                                <td>{row.flow_type}</td>
                                <td>{row.event_type}</td>
                                <td>{row.status}</td>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(row.has_geo_tag)}
                                    readOnly
                                    disabled
                                    aria-label={`Geo tag ${row.crew_name}`}
                                  />
                                </td>
                                <td>
                                  {row.photo_path ? (
                                    <button
                                      type="button"
                                      className="secondary-action"
                                      onClick={() => setPhotoPreview({ open: true, url: resolveUploadedPhotoUrl(row.photo_path), crewName: row.crew_name })}
                                    >
                                      Lihat
                                    </button>
                                  ) : '-'}
                                </td>
                                <td>{row.review_status || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h3>Assignment lembur</h3>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Tanggal</th>
                              <th>Project</th>
                              <th>Crew</th>
                              <th>Assigned by</th>
                              <th>Status</th>
                              <th>Geo Tag</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedReportOvertimeAssignments.map((row) => (
                              <tr key={row.id}>
                                <td>{row.assignment_date}</td>
                                <td>{row.project_name}</td>
                                <td>{row.crew_name}</td>
                                <td>{row.assigned_by_name}</td>
                                <td>{row.status}</td>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(row.has_geo_tag)}
                                    readOnly
                                    disabled
                                    aria-label={`Geo tag lembur ${row.crew_name}`}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              ) : adminPage === 'summary' && canManageAdmin ? (
                <div className="card">
                  <div className="panel-header">
                    <div>
                      <p className="section-label">Rangkuman</p>
                      <h2>Rekap jam crew per project</h2>
                    </div>
                    <button className="secondary-action" onClick={downloadSummaryCsv} type="button">
                      Export CSV
                    </button>
                  </div>

                  <form className="filter-row summary-filter-row" onSubmit={refreshSummary}>
                    <ProjectSelect
                      projects={adminData.projects}
                      value={summaryForm.projectId}
                      onChange={(v) => setSummaryForm((c) => ({ ...c, projectId: v }))}
                      placeholder="Semua project"
                    />
                    <div className="summary-date-range">
                      <p className="section-label">Date Range</p>
                      <div className="summary-date-fields">
                        <div className="summary-date-item">
                          <label>Start</label>
                          <input
                            type="date"
                            value={summaryForm.startDate}
                            onChange={(event) => setSummaryForm((current) => ({ ...current, startDate: event.target.value }))}
                          />
                        </div>
                        <div className="summary-date-item">
                          <label>End</label>
                          <input
                            type="date"
                            value={summaryForm.endDate}
                            onChange={(event) => setSummaryForm((current) => ({ ...current, endDate: event.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                    <button type="submit">Muat rangkuman</button>
                  </form>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Nama Project</th>
                          <th>Tanggal</th>
                          <th>Nama Crew</th>
                          <th>Jam Masuk</th>
                          <th>Jam Keluar</th>
                          <th>Jam Masuk lembur</th>
                          <th>Jam Keluar lembur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryRows.map((row, index) => (
                          <tr key={`${row.project_name}-${row.crew_name}-${row.summary_date || index}`}>
                            <td>{row.project_name}</td>
                            <td>{row.summary_date ? formatDate(row.summary_date) : '-'}</td>
                            <td>{row.crew_name}</td>
                            <td>{formatTime(row.attendance_check_in)}</td>
                            <td>{formatTime(row.attendance_check_out)}</td>
                            <td>{formatTime(row.overtime_check_in)}</td>
                            <td>{formatTime(row.overtime_check_out)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {summaryRows.length === 0 && <p className="hint">Belum ada data rangkuman pada filter ini.</p>}
                </div>
              ) : adminPage === 'detail-report' && canManageAdmin ? (
                <div className="card">
                  <div className="panel-header">
                    <div>
                      <p className="section-label">Detail Absen</p>
                      <h2>Nama, posisi, dan detail absen per tanggal</h2>
                    </div>
                    <button className="secondary-action" onClick={downloadDetailSummaryCsv} type="button">
                      Export CSV
                    </button>
                  </div>

                  <form className="filter-row summary-filter-row" onSubmit={refreshDetailReport}>
                    <ProjectSelect
                      projects={adminData.projects}
                      value={summaryForm.projectId}
                      onChange={(v) => setSummaryForm((c) => ({ ...c, projectId: v }))}
                      placeholder="Semua project"
                    />
                    <div className="summary-date-range">
                      <p className="section-label">Date Range</p>
                      <div className="summary-date-fields">
                        <div className="summary-date-item">
                          <label>Start</label>
                          <input
                            type="date"
                            value={summaryForm.startDate}
                            onChange={(event) => setSummaryForm((current) => ({ ...current, startDate: event.target.value }))}
                          />
                        </div>
                        <div className="summary-date-item">
                          <label>End</label>
                          <input
                            type="date"
                            value={summaryForm.endDate}
                            onChange={(event) => setSummaryForm((current) => ({ ...current, endDate: event.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                    <button type="submit">Muat detail</button>
                  </form>

                  <div className="table-wrap detail-report-table">
                    <table>
                      <thead>
                        <tr>
                          <th rowSpan="2">No</th>
                          {showDetailProjectColumn && <th rowSpan="2">Project</th>}
                          <th rowSpan="2">Nama</th>
                          <th rowSpan="2">Posisi</th>
                          {detailDateColumns.map((date) => (
                            <th key={date} colSpan="2">{formatDate(date)}</th>
                          ))}
                        </tr>
                        <tr>
                          {detailDateColumns.flatMap((date) => [
                            <th key={`${date}-in`}>In</th>,
                            <th key={`${date}-out`}>Out</th>,
                          ])}
                        </tr>
                      </thead>
                      <tbody>
                        {detailSummaryRows.map((row, index) => (
                          <tr key={`${row.projectId ?? row.projectName}-${row.crewName}-${index}`}>
                            <td>{index + 1}</td>
                            {showDetailProjectColumn && <td>{row.projectName}</td>}
                            <td>{row.crewName}</td>
                            <td>{row.position}</td>
                            {detailDateColumns.flatMap((date) => {
                              const dayRecord = row.summaryByDate.get(date)
                              return [
                                <td key={`${date}-in`}>
                                  <div className="detail-day-cell">
                                    <span>{formatTime(dayRecord?.attendance_check_in)}</span>
                                  </div>
                                </td>,
                                <td key={`${date}-out`}>
                                  <div className="detail-day-cell">
                                    <span>{formatTime(dayRecord?.attendance_check_out)}</span>
                                  </div>
                                </td>,
                              ]
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {detailSummaryRows.length === 0 && <p className="hint">Belum ada data detail absen pada filter ini.</p>}
                </div>
              ) : adminPage === 'assignment-management' && canManageAdmin ? (
                <div className="grid">
                  <form className="card" onSubmit={assignProject}>
                    <p className="section-label">Assignment</p>
                    <h2>Assign user ke project</h2>
                    <label>Project</label>
                    <ProjectSelect
                      projects={adminData.projects}
                      value={assignmentForm.projectId}
                      onChange={async (v) => {
                        setAssignmentForm((c) => ({ ...c, projectId: v }))
                        await loadProjectCrew(v)
                        await loadProjectAssignments(v)
                      }}
                      placeholder="Pilih project"
                      includeAll={false}
                    />
                    <label>User</label>
                    <UserSelect
                      users={nonAdminUsers}
                      value={assignmentForm.userId}
                      onChange={(userId) => setAssignmentForm((current) => ({ ...current, userId }))}
                      placeholder="Pilih user"
                    />
                    <p className="hint">Role assignment otomatis mengikuti role user yang dipilih.</p>
                    <button type="submit">Simpan assignment</button>
                  </form>

                  <div className="card">
                    <div className="panel-header">
                      <div>
                        <p className="section-label">Manajemen Assignment</p>
                        <h2>Edit / Hapus assignment project</h2>
                      </div>
                      <span className="tag">{projectAssignments.length} assignment</span>
                    </div>

                    <form className="filter-row" onSubmit={(event) => event.preventDefault()}>
                      <ProjectSelect
                        projects={adminData.projects}
                        value={assignmentForm.projectId}
                        onChange={async (v) => {
                          setAssignmentForm((c) => ({ ...c, projectId: v }))
                          await loadProjectCrew(v)
                          await loadProjectAssignments(v)
                        }}
                        placeholder="Pilih project"
                        includeAll={false}
                      />
                    </form>

                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Project</th>
                            <th>No Telp</th>
                            <th>Role Assignment</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectAssignments.map((assignment) => (
                            <tr key={assignment.id}>
                              <td>{assignment.user_name}</td>
                              <td>
                                {editingAssignmentId === assignment.id ? (
                                  <select
                                    value={editingAssignmentProjectId}
                                    onChange={(event) => setEditingAssignmentProjectId(event.target.value)}
                                  >
                                    {adminData.projects.map((project) => (
                                      <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  `${assignment.project_code} · ${assignment.project_name}`
                                )}
                              </td>
                              <td>{assignment.user_phone}</td>
                              <td>{assignment.assignment_role}</td>
                              <td>
                                {editingAssignmentId === assignment.id ? (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button type="button" className="secondary-action" onClick={() => saveProjectAssignment(assignment.id)}>Simpan</button>
                                    <button type="button" className="secondary-action" onClick={cancelEditProjectAssignment}>Batal</button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button type="button" className="secondary-action" onClick={() => startEditProjectAssignment(assignment)}>Edit</button>
                                    <button type="button" className="secondary-action" onClick={() => deleteProjectAssignment(assignment)}>Hapus</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {loadingAssignments && <p className="hint">Memuat assignment...</p>}
                    {!loadingAssignments && projectAssignments.length === 0 && <p className="hint">Belum ada assignment pada project ini.</p>}
                    <p className="hint">Klik Edit untuk membuka dropdown project, lalu Simpan untuk memindahkan assignment.</p>
                  </div>
                </div>
              ) : adminPage === 'overtime-management' && canManageAdmin ? (
                <div className="grid">
                  <form className="card" onSubmit={assignOvertime}>
                    <p className="section-label">Lembur</p>
                    <h2>Assign crew lembur</h2>
                    <label>Project</label>
                    <ProjectSelect
                      projects={adminData.projects}
                      value={overtimeForm.projectId}
                      onChange={async (v) => {
                        setOvertimeForm((c) => ({ ...c, projectId: v, userIds: [] }))
                        await loadProjectCrew(v)
                        await loadOvertimeAssignments(v, overtimeForm.assignmentDate)
                      }}
                      placeholder="Pilih project"
                      includeAll={false}
                    />
                    <label>Tanggal lembur</label>
                    <input
                      type="date"
                      value={overtimeForm.assignmentDate}
                      onChange={async (event) => {
                        const assignmentDate = event.target.value
                        setOvertimeForm((current) => ({ ...current, assignmentDate }))
                        if (overtimeForm.projectId) {
                          await loadOvertimeAssignments(overtimeForm.projectId, assignmentDate)
                        }
                      }}
                    />
                    <label>Pilih crew</label>
                    <div className="checkbox-list">
                      {projectCrew.map((crew) => (
                        <label key={crew.id} className="checkbox-item">
                          <input
                            checked={overtimeForm.userIds.includes(String(crew.id))}
                            onChange={(event) => {
                              setOvertimeForm((current) => ({
                                ...current,
                                userIds: event.target.checked
                                  ? [...current.userIds, String(crew.id)]
                                  : current.userIds.filter((id) => id !== String(crew.id)),
                              }))
                            }}
                            type="checkbox"
                          />
                          <span>{crew.name}</span>
                        </label>
                      ))}
                    </div>
                    <button type="submit">Assign lembur</button>
                  </form>

                  <div className="card">
                    <p className="section-label">Manajemen Lembur</p>
                    <h2>Hapus assignment lembur</h2>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Crew</th>
                            <th>No Telp</th>
                            <th>Tanggal</th>
                            <th>Assigned by</th>
                            <th>Status</th>
                            <th>Hapus</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overtimeAssignments.map((assignment) => (
                            <tr key={assignment.id}>
                              <td>{assignment.user_name}</td>
                              <td>{assignment.user_phone}</td>
                              <td>{assignment.assignment_date}</td>
                              <td>{assignment.assigned_by_name || '-'}</td>
                              <td>{assignment.status}</td>
                              <td>
                                <button type="button" className="secondary-action" onClick={() => deleteOvertimeAssignment(assignment)}>Hapus</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {loadingOvertimeAssignments && <p className="hint">Memuat data lembur...</p>}
                    {!loadingOvertimeAssignments && overtimeAssignments.length === 0 && <p className="hint">Belum ada assignment lembur pada tanggal ini.</p>}
                  </div>
                </div>
              ) : adminPage === 'overtime' && isPicOnly ? (
                <div className="grid">
                  <div className="card hero-card">
                    <p className="section-label">Session PIC</p>
                    <h2>{authState.user?.name}</h2>
                    <p className="hint">Akses PIC dibatasi hanya untuk assignment lembur.</p>
                    <div className="stats-row">
                      <div>
                        <strong>{adminData.projects.length}</strong>
                        <span>Project PIC</span>
                      </div>
                      <div>
                        <strong>{projectCrew.length}</strong>
                        <span>Crew aktif</span>
                      </div>
                    </div>
                  </div>

                  <form className="card" onSubmit={assignOvertime}>
                    <p className="section-label">Lembur</p>
                    <h2>Assign crew lembur</h2>
                    <label>Project</label>
                    <ProjectSelect
                      projects={adminData.projects}
                      value={overtimeForm.projectId}
                      onChange={async (v) => {
                        setOvertimeForm((c) => ({ ...c, projectId: v, userIds: [] }))
                        await loadProjectCrew(v)
                        await loadOvertimeAssignments(v, overtimeForm.assignmentDate)
                      }}
                      placeholder="Pilih project"
                      includeAll={false}
                    />
                    <input
                      type="date"
                      value={overtimeForm.assignmentDate}
                      onChange={async (event) => {
                        const assignmentDate = event.target.value
                        setOvertimeForm((current) => ({ ...current, assignmentDate }))
                        if (overtimeForm.projectId) {
                          await loadOvertimeAssignments(overtimeForm.projectId, assignmentDate)
                        }
                      }}
                    />
                    <div className="checkbox-list">
                      {projectCrew.map((crew) => (
                        <label key={crew.id} className="checkbox-item">
                          <input
                            checked={overtimeForm.userIds.includes(String(crew.id))}
                            onChange={(event) => {
                              setOvertimeForm((current) => ({
                                ...current,
                                userIds: event.target.checked
                                  ? [...current.userIds, String(crew.id)]
                                  : current.userIds.filter((id) => id !== String(crew.id)),
                              }))
                            }}
                            type="checkbox"
                          />
                          <span>{crew.name}</span>
                        </label>
                      ))}
                    </div>
                    <button type="submit">Assign lembur</button>
                  </form>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Crew</th>
                          <th>No Telp</th>
                          <th>Tanggal</th>
                          <th>Assigned by</th>
                          <th>Status</th>
                          <th>Hapus</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overtimeAssignments.map((assignment) => (
                          <tr key={assignment.id}>
                            <td>{assignment.user_name}</td>
                            <td>{assignment.user_phone}</td>
                            <td>{assignment.assignment_date}</td>
                            <td>{assignment.assigned_by_name || '-'}</td>
                            <td>{assignment.status}</td>
                            <td>
                              <button type="button" className="secondary-action" onClick={() => deleteOvertimeAssignment(assignment)}>Hapus</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {loadingOvertimeAssignments && <p className="hint">Memuat data lembur...</p>}
                  {!loadingOvertimeAssignments && overtimeAssignments.length === 0 && <p className="hint">Belum ada assignment lembur pada tanggal ini.</p>}
                </div>
              ) : adminPage === 'projects' && canManageAdmin ? (
                <div className="grid">
                  <form className="card" onSubmit={createProject}>
                    <p className="section-label">Master Project</p>
                    <h2>Tambah project</h2>
                    <label>Kode project</label>
                    <input value={projectForm.code} onChange={(event) => setProjectForm((current) => ({ ...current, code: event.target.value }))} />
                    <label>Nama project</label>
                    <input value={projectForm.name} onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))} />
                    <label>PIC Event</label>
                    <select value={projectForm.picUserId} onChange={(event) => setProjectForm((current) => ({ ...current, picUserId: event.target.value }))}>
                      <option value="">Pilih PIC</option>
                      {picOptions.map((user) => (
                        <option key={user.id} value={user.id}>{user.name}</option>
                      ))}
                    </select>
                    <button type="submit" style={{ marginTop: 16 }}>Simpan project</button>
                  </form>

                  <div className="card">
                    <div className="panel-header">
                      <div>
                        <p className="section-label">List Project</p>
                        <h2>Daftar project</h2>
                      </div>
                      <span className="tag">{filteredProjects.length} project</span>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <input
                        value={projectListSearch}
                        onChange={(event) => { setProjectListSearch(event.target.value); setProjectListPage(1) }}
                        placeholder="Cari kode atau nama project..."
                      />
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Kode</th>
                            <th>Nama</th>
                            <th>PIC</th>
                            <th>Status</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedProjects.map((project) => (
                            <tr key={project.id}>
                              <td>
                                {editingProjectId === project.id ? (
                                  <input
                                    value={editingProjectForm.code}
                                    onChange={(event) => setEditingProjectForm((current) => ({ ...current, code: event.target.value }))}
                                    style={{ minWidth: 80, marginBottom: 0 }}
                                  />
                                ) : project.code}
                              </td>
                              <td>
                                {editingProjectId === project.id ? (
                                  <input
                                    value={editingProjectForm.name}
                                    onChange={(event) => setEditingProjectForm((current) => ({ ...current, name: event.target.value }))}
                                    style={{ minWidth: 160, marginBottom: 0 }}
                                  />
                                ) : project.name}
                              </td>
                              <td>
                                {editingProjectId === project.id ? (
                                  <select
                                    value={editingProjectForm.picUserId}
                                    onChange={(event) => setEditingProjectForm((current) => ({ ...current, picUserId: event.target.value }))}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <option value="">Pilih PIC</option>
                                    {picOptions.map((user) => (
                                      <option key={user.id} value={user.id}>{user.name}</option>
                                    ))}
                                  </select>
                                ) : (project.picName || '-')}
                              </td>
                              <td>
                                <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, background: project.isActive ? '#dcfce7' : '#fee2e2', color: project.isActive ? '#16a34a' : '#dc2626' }}>
                                  {project.isActive ? 'Aktif' : 'Nonaktif'}
                                </span>
                              </td>
                              <td>
                                {editingProjectId === project.id ? (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button type="button" className="secondary-action" onClick={() => saveProject(project.id)}>Simpan</button>
                                    <button type="button" className="secondary-action" onClick={cancelEditProject}>Batal</button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button type="button" className="secondary-action" onClick={() => startEditProject(project)}>Edit</button>
                                    <button type="button" className="secondary-action" onClick={() => toggleProjectActive(project)}>
                                      {project.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                    </button>
                                    <button type="button" className="secondary-action" onClick={() => deleteProject(project)}>Hapus</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {projectListTotalPages > 1 && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                        <button type="button" className="secondary-action" onClick={() => setProjectListPage(1)} disabled={projectListPage === 1}>«</button>
                        <button type="button" className="secondary-action" onClick={() => setProjectListPage((p) => Math.max(1, p - 1))} disabled={projectListPage === 1}>‹</button>
                        <span style={{ fontSize: '0.82rem', color: '#7a90a4' }}>Hal {projectListPage} / {projectListTotalPages}</span>
                        <button type="button" className="secondary-action" onClick={() => setProjectListPage((p) => Math.min(projectListTotalPages, p + 1))} disabled={projectListPage === projectListTotalPages}>›</button>
                        <button type="button" className="secondary-action" onClick={() => setProjectListPage(projectListTotalPages)} disabled={projectListPage === projectListTotalPages}>»</button>
                      </div>
                    )}
                  </div>
                </div>
              ) : adminPage === 'admin' && canManageAdmin ? (
                <div className="grid">
                  <form className="card" onSubmit={restoreDatabaseBackup}>
                    <p className="section-label">Backup Database</p>
                    <h2>Backup &amp; Restore</h2>
                    <p className="hint">Backup hanya mencakup database SQLite (.db), bukan file foto pada folder uploads.</p>

                    <button type="button" onClick={downloadDatabaseBackup} disabled={backupLoading}>
                      {backupLoading ? 'Memproses...' : 'Download backup terbaru'}
                    </button>

                    <hr />
                    <label>Restore dari file backup (.db)</label>
                    <input
                      ref={backupRestoreInputRef}
                      type="file"
                      accept=".db,application/x-sqlite3,application/octet-stream"
                      onChange={(event) => setBackupRestoreFile(event.target.files?.[0] || null)}
                    />
                    <button type="submit" className="secondary-action" disabled={backupLoading || !backupRestoreFile}>
                      {backupLoading ? 'Memproses...' : 'Restore backup'}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="grid">
                  <div className="card hero-card">
                    <p className="section-label">Session</p>
                    <h2 style={{ marginBottom: 2 }}>{authState.user?.name}</h2>
                    <p className="hint" style={{ marginBottom: 16 }}>{authState.user?.role} &middot; {dayjs().format('dddd, DD MMM YYYY')}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                      <div style={{ background: '#f7f9fb', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--brand)', lineHeight: 1 }}>{adminData.projects.filter(p => p.isActive).length}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project Aktif</div>
                      </div>
                      <div style={{ background: '#f7f9fb', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--brand)', lineHeight: 1 }}>{adminData.projects.length}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Project</div>
                      </div>
                      <div style={{ background: '#f7f9fb', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--brand)', lineHeight: 1 }}>{adminData.users.length}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Users</div>
                      </div>
                      <div style={{ background: '#f7f9fb', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--brand)', lineHeight: 1 }}>{nonAdminUsers.length}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Crew</div>
                      </div>
                      <div style={{ background: '#f7f9fb', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: activeDailyQrs.length > 0 ? '#16a34a' : 'var(--brand)', lineHeight: 1 }}>{activeDailyQrs.length}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>QR aktif</div>
                      </div>
                    </div>
                  </div>

                  <form className="card" onSubmit={generateQr}>
                    <p className="section-label">QR Harian</p>
                    <h2>Generate akses crew</h2>
                    <label>Project</label>
                    <ProjectSelect
                      projects={adminData.projects}
                      value={qrForm.projectId}
                      onChange={(v) => setQrForm((c) => ({ ...c, projectId: v }))}
                      placeholder="Pilih project"
                      includeAll={false}
                    />
                    <label>Tanggal QR</label>
                    <input type="date" value={qrForm.qrDate} onChange={(event) => setQrForm((current) => ({ ...current, qrDate: event.target.value }))} />
                    <button type="submit" style={{ marginTop: 16 }}>Generate QR</button>
                    {qrResult && (
                      <div className="qr-box">
                        <img alt="QR Harian" src={qrResult.imageDataUrl} />
                        <p className="hint break-all">{qrResult.qrValue}</p>
                      </div>
                    )}
                    <label>QR aktif hari ini</label>
                    {activeDailyQrs.length === 0 ? (
                      <p className="hint">Belum ada QR aktif hari ini.</p>
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Project</th>
                              <th>Berlaku sampai</th>
                              <th>Link QR</th>
                              <th>Copy</th>
                              <th>Hapus</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeDailyQrs.map((item) => (
                              <tr key={item.id}>
                                <td>{item.projectCode} · {item.projectName}</td>
                                <td>{formatDateTime(item.expiresAt)}</td>
                                <td className="break-all">{item.qrValue}</td>
                                <td>
                                  <button className="secondary-action" type="button" onClick={() => copyQrLink(item.qrValue)}>Copy</button>
                                </td>
                                <td>
                                  <button className="secondary-action" type="button" onClick={() => deleteActiveQr(item)}>Hapus</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </form>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="modal-overlay" onClick={() => setShowChangePasswordModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Ubah Password</h3>
              <button
                className="modal-close"
                onClick={() => setShowChangePasswordModal(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="modal-body" onSubmit={handleChangePassword}>
              {notice && <div className="notice">{notice}</div>}
              <label>Password lama</label>
              <input
                type="password"
                value={changePasswordForm.oldPassword}
                onChange={(event) => setChangePasswordForm((current) => ({ ...current, oldPassword: event.target.value }))}
              />
              <label>Password baru</label>
              <input
                type="password"
                value={changePasswordForm.newPassword}
                onChange={(event) => setChangePasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
              />
              <label>Konfirmasi password baru</label>
              <input
                type="password"
                value={changePasswordForm.confirmPassword}
                onChange={(event) => setChangePasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              />
              <button type="submit" disabled={changePasswordLoading}>
                {changePasswordLoading ? 'Menyimpan...' : 'Simpan password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {photoPreview.open && (
        <div className="modal-overlay" onClick={() => setPhotoPreview({ open: false, url: '', crewName: '' })}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Foto {photoPreview.crewName}</h3>
              <button
                className="modal-close"
                onClick={() => setPhotoPreview({ open: false, url: '', crewName: '' })}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="modal-body photo-preview-body">
              <img
                src={photoPreview.url}
                alt={`Foto ${photoPreview.crewName}`}
                className="photo-preview-image"
              />
              <a href={photoPreview.url} target="_blank" rel="noreferrer">
                Buka di tab baru
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatDateTime(value) {
  return dayjs(value).format('DD MMM YYYY HH:mm')
}

function formatDate(value) {
  return dayjs(value).format('DD MMM YYYY')
}

function formatTime(value) {
  if (!value) {
    return '-'
  }

  return dayjs(value).format('HH:mm')
}

function normalizeAdminUsers(users = []) {
  return users.map((user) => ({
    ...user,
    ktp: user.ktp || '',
    projectNames: Array.isArray(user.projectNames) ? user.projectNames : [],
  }))
}

function getErrorMessage(error, fallback) {
  if (error?.code === 'ERR_NETWORK') {
    return `Tidak dapat terhubung ke API (${API_BASE})`
  }

  return error?.response?.data?.message || fallback
}

export default App
