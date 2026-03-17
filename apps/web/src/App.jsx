import { useEffect, useMemo, useState } from 'react'
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

const http = axios.create({
  baseURL: API_BASE,
})

function App() {
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const tokenFromUrl = searchParams.get('token') || ''

  const [mode, setMode] = useState('crew')
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
  const [loginForm, setLoginForm] = useState({ phone: '081100000001', password: 'admin123' })
  const [adminData, setAdminData] = useState({ projects: [], users: [] })
  const [projectCrew, setProjectCrew] = useState([])
  const [projectAssignments, setProjectAssignments] = useState([])
  const [overtimeAssignments, setOvertimeAssignments] = useState([])
  const [reportData, setReportData] = useState({ attendance: [], overtimeAssignments: [] })
  const [summaryRows, setSummaryRows] = useState([])
  const [loadingAdmin, setLoadingAdmin] = useState(false)
  const [loadingAssignments, setLoadingAssignments] = useState(false)
  const [loadingOvertimeAssignments, setLoadingOvertimeAssignments] = useState(false)
  const [qrResult, setQrResult] = useState(null)
  const [activeDailyQrs, setActiveDailyQrs] = useState([])
  const [userForm, setUserForm] = useState({ name: '', ktp: '', phone: '', role: 'CREW', password: '' })
  const [projectForm, setProjectForm] = useState({ code: '', name: '', picUserId: '' })
  const [assignmentForm, setAssignmentForm] = useState({ projectId: '', userId: '', assignmentRole: 'CREW' })
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
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [changePasswordForm, setChangePasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const [editingUserId, setEditingUserId] = useState(null)
  const [editingUserName, setEditingUserName] = useState('')

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
        setLocationState({ latitude: null, longitude: null, status: 'Lokasi gagal diambil. Data tetap bisa dikirim sebagai review.' })
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function submitCrewEvent(eventType) {
    if (!publicProject || !tokenFromUrl || !selectedCrewId) {
      setCrewMessage('Pilih nama crew terlebih dahulu.')
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
        setNotice(`Login sebagai ${data.user.name} (${data.user.role}) berhasil.`)
      } catch (error) {
        setNotice(`Login berhasil, tetapi dashboard gagal dimuat: ${getErrorMessage(error, 'Tidak dapat memuat data admin')}`)
      }
    } catch (error) {
      setNotice(getErrorMessage(error, 'Login gagal'))
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
        password: userForm.role === 'CREW' ? null : (userForm.password || null),
      }, { headers: authHeader() })
      setUserForm({ name: '', ktp: '', phone: '', role: 'CREW', password: '' })
      await loadAdminBootstrap()
      setNotice('User baru berhasil ditambahkan.')
      showToast('User berhasil ditambahkan', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal menambah user'))
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
      setNotice('Project berhasil dibuat.')
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
      setNotice('Project berhasil diubah.')
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
      setNotice('Project berhasil dihapus.')
      showToast('Project berhasil dihapus', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal menghapus project'))
    }
  }

  async function assignProject(event) {
    event.preventDefault()
    try {
      await http.post(`/admin/projects/${assignmentForm.projectId}/assignments`, {
        userId: Number(assignmentForm.userId),
        assignmentRole: assignmentForm.assignmentRole,
      }, { headers: authHeader() })
      await loadAdminBootstrap()
      if (assignmentForm.projectId) {
        await loadProjectCrew(assignmentForm.projectId)
        await loadProjectAssignments(assignmentForm.projectId)
      }
      setNotice('Assignment project berhasil disimpan.')
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
      setNotice('QR harian berhasil dibuat.')
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
      setNotice('QR harian berhasil dihapus.')
      showToast('QR harian berhasil dihapus', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal menghapus QR harian'))
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
      setNotice('Report berhasil dimuat ulang.')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal memuat report'))
    }
  }

  async function refreshSummary(event) {
    event?.preventDefault()
    try {
      await loadSummary({
        projectId: summaryForm.projectId || undefined,
        startDate: summaryForm.startDate,
        endDate: summaryForm.endDate,
      })
      setNotice('Rangkuman berhasil dimuat ulang.')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal memuat rangkuman'))
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

  function startEditUser(user) {
    setEditingUserId(user.id)
    setEditingUserName(user.name)
  }

  function cancelEditUser() {
    setEditingUserId(null)
    setEditingUserName('')
  }

  async function saveEditUser(userId) {
    if (!editingUserName.trim() || editingUserName.trim().length < 2) {
      setNotice('Nama minimal 2 karakter')
      return
    }

    try {
      await http.patch(`/admin/users/${userId}`, { name: editingUserName.trim() }, { headers: authHeader() })
      await loadAdminBootstrap()
      cancelEditUser()
      showToast('Nama user berhasil diubah', 'success')
    } catch (error) {
      setNotice(getErrorMessage(error, 'Gagal mengubah nama user'))
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
      setNotice('Password berhasil diubah')
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
      setNotice('Assignment berhasil diubah.')
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
      setNotice('Assignment berhasil dihapus.')
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
      setNotice('Data lembur berhasil dihapus.')
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
    setMode('crew')
    setNotice('Logout berhasil.')
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Crew Management PV</p>
          <img className="app-logo" src="/emaki-logo.png" alt="EMAKI logo" />
          <p className="subtitle">
            Crew masuk lewat QR harian. Admin dan PIC mengelola project, assignment, lembur, dan laporan dari dashboard yang sama.
          </p>
        </div>

        <div className="mode-switch">
          <button className={mode === 'crew' ? 'active' : ''} onClick={() => setMode('crew')} type="button">
            Crew
          </button>
          <button className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')} type="button">
            Admin / PIC
          </button>
          {authState.user && (
            <>
              <button onClick={() => setShowChangePasswordModal(true)} type="button">
                Ubah Password
              </button>
              <button onClick={logoutAdmin} type="button">
                Logout
              </button>
            </>
          )}
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      {toasts.length > 0 && (
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.type === 'success' ? 'success' : ''}`}>
              <p>{toast.message}</p>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Tutup notifikasi">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {mode === 'crew' ? (
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
                  <p className="hint">Gunakan kamera depan HP untuk selfie masuk atau pulang.</p>

                  <label>Geolocation</label>
                  <button className="secondary-action" onClick={handleLocate} type="button">
                    Ambil lokasi
                  </button>
                  <p className="hint">
                    {locationState.status}
                    {locationState.latitude != null && ` (${locationState.latitude.toFixed(5)}, ${locationState.longitude.toFixed(5)})`}
                  </p>

                  <div className="action-row">
                    <button disabled={crewSubmitting || !selectedCrewId} onClick={() => submitCrewEvent('CHECK_IN')} type="button">
                      {crewSubmitting ? 'Menyimpan...' : 'Masuk'}
                    </button>
                    <button disabled={crewSubmitting || !selectedCrewId} onClick={() => submitCrewEvent('CHECK_OUT')} type="button">
                      {crewSubmitting ? 'Menyimpan...' : 'Pulang'}
                    </button>
                  </div>

                  {crewMessage && <p className="result-text">{crewMessage}</p>}
                </div>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="panel admin-layout">
          {!authState.token ? (
            <form className="card auth-card" onSubmit={loginAdmin}>
              <p className="section-label">Login Admin / PIC</p>
              <h2>Masuk ke dashboard</h2>
              <label>Nomor HP</label>
              <input value={loginForm.phone} onChange={(event) => setLoginForm((current) => ({ ...current, phone: event.target.value }))} />
              <label>Password</label>
              <input type="password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} />
              <button disabled={loadingAdmin} type="submit">{loadingAdmin ? 'Memproses...' : 'Login'}</button>
              <p className="hint">Seed default: admin 081100000001 / admin123, PIC 081100000002 / pic123.</p>
            </form>
          ) : (
            <div className="admin-grid">
              {!isPicOnly && <div className="admin-nav">
                {!isPicOnly && (
                  <button className={adminPage === 'dashboard' ? 'active' : ''} onClick={() => setAdminPage('dashboard')} type="button">
                    Dashboard
                  </button>
                )}

                {canManageAdmin && (
                  <button className={adminPage === 'users' ? 'active' : ''} onClick={() => setAdminPage('users')} type="button">
                    List User
                  </button>
                )}
                {canManageAdmin && (
                  <button className={adminPage === 'assignment-management' ? 'active' : ''} onClick={() => setAdminPage('assignment-management')} type="button">
                    Manajemen Assignment
                  </button>
                )}
                {canManageAdmin && (
                  <button className={adminPage === 'overtime-management' ? 'active' : ''} onClick={() => setAdminPage('overtime-management')} type="button">
                    Manajemen Lembur
                  </button>
                )}
                {canManageAdmin && (
                  <button className={adminPage === 'report' ? 'active' : ''} onClick={() => setAdminPage('report')} type="button">
                    Report
                  </button>
                )}
                {canManageAdmin && (
                  <button className={adminPage === 'summary' ? 'active' : ''} onClick={() => setAdminPage('summary')} type="button">
                    Rangkuman
                  </button>
                )}
              </div>}

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
                      <option value="CREW">Crew</option>
                      <option value="PIC">PIC</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    {userForm.role !== 'CREW' && (
                      <>
                        <label>Password (khusus Admin/PIC)</label>
                        <input value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} />
                      </>
                    )}
                    <button type="submit">Simpan user</button>
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
                        onChange={(event) => setUserListFilters((current) => ({ ...current, search: event.target.value }))}
                        placeholder="Cari nama atau no telp"
                      />
                      <select value={userListFilters.role} onChange={(event) => setUserListFilters((current) => ({ ...current, role: event.target.value }))}>
                        <option value="">Semua role</option>
                        <option value="ADMIN">Admin</option>
                        <option value="PIC">PIC</option>
                        <option value="CREW">Crew</option>
                      </select>
                      <select value={userListFilters.status} onChange={(event) => setUserListFilters((current) => ({ ...current, status: event.target.value }))}>
                        <option value="">Semua status</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                      </select>
                      <select value={userListFilters.project} onChange={(event) => setUserListFilters((current) => ({ ...current, project: event.target.value }))}>
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
                          {filteredAdminUsers.map((user) => (
                            <tr key={user.id}>
                              <td>
                                {editingUserId === user.id ? (
                                  <input
                                    value={editingUserName}
                                    onChange={(event) => setEditingUserName(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') saveEditUser(user.id)
                                      if (event.key === 'Escape') cancelEditUser()
                                    }}
                                    autoFocus
                                    style={{ minWidth: 120, marginBottom: 0 }}
                                  />
                                ) : user.name}
                              </td>
                              <td>{user.ktp || '-'}</td>
                              <td>{user.phone}</td>
                              <td>{user.role}</td>
                              <td>
                                <span className={`status-badge ${user.status === 'ACTIVE' ? 'status-active' : 'status-inactive'}`}>
                                  {user.status}
                                </span>
                              </td>
                              <td>{user.projectNames.length ? user.projectNames.join(', ') : '-'}</td>
                              <td>
                                {editingUserId === user.id ? (
                                  <div className="action-row">
                                    <button type="button" onClick={() => saveEditUser(user.id)}>Simpan</button>
                                    <button type="button" className="secondary-action" onClick={cancelEditUser}>Batal</button>
                                  </div>
                                ) : (
                                  <div className="action-row">
                                    <button type="button" className="secondary-action" onClick={() => startEditUser(user)}>Edit</button>
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
                    <select
                      value={reportForm.projectId}
                      onChange={async (event) => {
                        const projectId = event.target.value
                        setReportForm((current) => ({ ...current, projectId }))
                        await loadProjectCrew(projectId)
                      }}
                    >
                      <option value="">Semua project</option>
                      {adminData.projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                      ))}
                    </select>
                    <input type="date" value={reportForm.date} onChange={(event) => setReportForm((current) => ({ ...current, date: event.target.value }))} />
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
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.attendance.map((row) => (
                              <tr key={row.id}>
                                <td>{formatDateTime(row.created_at)}</td>
                                <td>{row.project_code}</td>
                                <td>{row.crew_name}</td>
                                <td>{row.flow_type}</td>
                                <td>{row.event_type}</td>
                                <td>{row.status}</td>
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
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.overtimeAssignments.map((row) => (
                              <tr key={row.id}>
                                <td>{row.assignment_date}</td>
                                <td>{row.project_name}</td>
                                <td>{row.crew_name}</td>
                                <td>{row.assigned_by_name}</td>
                                <td>{row.status}</td>
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
                    <select
                      value={summaryForm.projectId}
                      onChange={(event) => setSummaryForm((current) => ({ ...current, projectId: event.target.value }))}
                    >
                      <option value="">Semua project</option>
                      {adminData.projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                      ))}
                    </select>
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
                            <td>{`${row.crew_name}${row.summary_date ? ` - ${formatDate(row.summary_date)}` : ''}`}</td>
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
              ) : adminPage === 'assignment-management' && canManageAdmin ? (
                <div className="grid">
                  <form className="card" onSubmit={assignProject}>
                    <p className="section-label">Assignment</p>
                    <h2>Assign user ke project</h2>
                    <label>Project</label>
                    <select
                      value={assignmentForm.projectId}
                      onChange={async (event) => {
                        const projectId = event.target.value
                        setAssignmentForm((current) => ({ ...current, projectId }))
                        await loadProjectCrew(projectId)
                        await loadProjectAssignments(projectId)
                      }}
                    >
                      <option value="">Pilih project</option>
                      {adminData.projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                      ))}
                    </select>
                    <label>User</label>
                    <select value={assignmentForm.userId} onChange={(event) => setAssignmentForm((current) => ({ ...current, userId: event.target.value }))}>
                      <option value="">Pilih user</option>
                      {nonAdminUsers.map((user) => (
                        <option key={user.id} value={user.id}>{user.name} · {user.role}</option>
                      ))}
                    </select>
                    <label>Role assignment</label>
                    <select value={assignmentForm.assignmentRole} onChange={(event) => setAssignmentForm((current) => ({ ...current, assignmentRole: event.target.value }))}>
                      <option value="CREW">Crew</option>
                      <option value="PIC">PIC</option>
                    </select>
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
                      <select
                        value={assignmentForm.projectId}
                        onChange={async (event) => {
                          const projectId = event.target.value
                          setAssignmentForm((current) => ({ ...current, projectId }))
                          await loadProjectCrew(projectId)
                          await loadProjectAssignments(projectId)
                        }}
                      >
                        <option value="">Pilih project</option>
                        {adminData.projects.map((project) => (
                          <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                        ))}
                      </select>
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
                                <div className="action-row">
                                  {editingAssignmentId === assignment.id ? (
                                    <>
                                      <button type="button" className="secondary-action" onClick={() => saveProjectAssignment(assignment)}>Simpan</button>
                                      <button type="button" className="secondary-action" onClick={cancelEditProjectAssignment}>Batal</button>
                                    </>
                                  ) : (
                                    <button type="button" className="secondary-action" onClick={() => startEditProjectAssignment(assignment)}>Edit</button>
                                  )}
                                  <button type="button" className="secondary-action" onClick={() => deleteProjectAssignment(assignment)}>Hapus</button>
                                </div>
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
                    <select
                      value={overtimeForm.projectId}
                      onChange={async (event) => {
                        const projectId = event.target.value
                        setOvertimeForm((current) => ({ ...current, projectId, userIds: [] }))
                        await loadProjectCrew(projectId)
                        await loadOvertimeAssignments(projectId, overtimeForm.assignmentDate)
                      }}
                    >
                      <option value="">Pilih project</option>
                      {adminData.projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                      ))}
                    </select>
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
                    <div className="panel-header">
                      <div>
                        <p className="section-label">Manajemen Lembur</p>
                        <h2>Hapus assignment lembur</h2>
                      </div>
                      <span className="tag">{overtimeAssignments.length} data</span>
                    </div>

                    <form className="filter-row" onSubmit={(event) => event.preventDefault()}>
                      <select
                        value={overtimeForm.projectId}
                        onChange={async (event) => {
                          const projectId = event.target.value
                          setOvertimeForm((current) => ({ ...current, projectId, userIds: [] }))
                          await loadProjectCrew(projectId)
                          await loadOvertimeAssignments(projectId, overtimeForm.assignmentDate)
                        }}
                      >
                        <option value="">Pilih project</option>
                        {adminData.projects.map((project) => (
                          <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                        ))}
                      </select>
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
                        <span>Crew Project</span>
                      </div>
                    </div>
                  </div>

                  <form className="card" onSubmit={assignOvertime}>
                    <p className="section-label">Lembur</p>
                    <h2>Assign crew lembur</h2>
                    <label>Project</label>
                    <select
                      value={overtimeForm.projectId}
                      onChange={async (event) => {
                        const projectId = event.target.value
                        setOvertimeForm((current) => ({ ...current, projectId, userIds: [] }))
                        await loadProjectCrew(projectId)
                        await loadOvertimeAssignments(projectId, overtimeForm.assignmentDate)
                      }}
                    >
                      <option value="">Pilih project</option>
                      {adminData.projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                      ))}
                    </select>
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
              ) : (
              <div className="grid">
                <div className="card hero-card">
                  <p className="section-label">Session</p>
                  <h2>{authState.user?.name}</h2>
                  <p className="hint">Role: {authState.user?.role}</p>
                  <div className="stats-row">
                    <div>
                      <strong>{adminData.projects.length}</strong>
                      <span>Project</span>
                    </div>
                    <div>
                      <strong>{adminData.users.length}</strong>
                      <span>User</span>
                    </div>
                    <div>
                      <strong>{projectCrew.length}</strong>
                      <span>Crew aktif</span>
                    </div>
                  </div>
                </div>

                <form className="card" onSubmit={generateQr}>
                  <p className="section-label">QR Harian</p>
                  <h2>Generate akses crew</h2>
                  <label>Project</label>
                  <select value={qrForm.projectId} onChange={(event) => setQrForm((current) => ({ ...current, projectId: event.target.value }))}>
                    <option value="">Pilih project</option>
                    {adminData.projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                    ))}
                  </select>
                  <label>Tanggal QR</label>
                  <input type="date" value={qrForm.qrDate} onChange={(event) => setQrForm((current) => ({ ...current, qrDate: event.target.value }))} />
                  <button type="submit">Generate QR</button>
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
                                <button className="secondary-action" type="button" onClick={() => deleteActiveQr(item)}>Hapus</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </form>
                {canManageAdmin && (
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
                    <button type="submit">Simpan project</button>

                    <label>List project</label>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Kode</th>
                            <th>Nama</th>
                            <th>PIC</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminData.projects.map((project) => (
                            <tr key={project.id}>
                              <td>
                                {editingProjectId === project.id ? (
                                  <input value={editingProjectForm.code} onChange={(event) => setEditingProjectForm((current) => ({ ...current, code: event.target.value }))} />
                                ) : project.code}
                              </td>
                              <td>
                                {editingProjectId === project.id ? (
                                  <input value={editingProjectForm.name} onChange={(event) => setEditingProjectForm((current) => ({ ...current, name: event.target.value }))} />
                                ) : project.name}
                              </td>
                              <td>
                                {editingProjectId === project.id ? (
                                  <select value={editingProjectForm.picUserId} onChange={(event) => setEditingProjectForm((current) => ({ ...current, picUserId: event.target.value }))}>
                                    <option value="">Tanpa PIC</option>
                                    {picOptions.map((user) => (
                                      <option key={user.id} value={user.id}>{user.name}</option>
                                    ))}
                                  </select>
                                ) : (project.picName || '-')}
                              </td>
                              <td>
                                {editingProjectId === project.id ? (
                                  <div className="action-row">
                                    <button type="button" onClick={() => saveProject(project.id)}>Simpan</button>
                                    <button className="secondary-action" type="button" onClick={cancelEditProject}>Batal</button>
                                  </div>
                                ) : (
                                  <div className="action-row">
                                    <button type="button" onClick={() => startEditProject(project)}>Edit</button>
                                    <button className="secondary-action" type="button" onClick={() => deleteProject(project)}>Hapus</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </form>
                )}
              </div>
              )}
            </div>
          )}
        </section>
      )}

      {showChangePasswordModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Ubah Password</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowChangePasswordModal(false)
                  setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
                }}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="modal-body" onSubmit={handleChangePassword}>
              <label>Password Lama</label>
              <input
                type="password"
                value={changePasswordForm.oldPassword}
                onChange={(event) => setChangePasswordForm((current) => ({ ...current, oldPassword: event.target.value }))}
                placeholder="Masukkan password lama"
              />

              <label>Password Baru</label>
              <input
                type="password"
                value={changePasswordForm.newPassword}
                onChange={(event) => setChangePasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                placeholder="Masukkan password baru"
              />

              <label>Konfirmasi Password Baru</label>
              <input
                type="password"
                value={changePasswordForm.confirmPassword}
                onChange={(event) => setChangePasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                placeholder="Konfirmasi password baru"
              />

              <div className="modal-actions">
                <button type="submit" disabled={changePasswordLoading}>
                  {changePasswordLoading ? 'Menyimpan...' : 'Simpan'}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    setShowChangePasswordModal(false)
                    setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
                  }}
                >
                  Batal
                </button>
              </div>
            </form>
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
