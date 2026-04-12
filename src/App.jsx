import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import Layout from './Layout'
import Dashboard from './pages/Dashboard'
import ModulePage from './pages/ModulePage'
import AdminProfile from './pages/AdminProfile'
import StudentProfileRoute from './pages/StudentProfileRoute'
import AdminCreateStudent from './pages/AdminCreateStudent'
import AdminStudentView from './pages/AdminStudentView'
import FacultyProfile from './pages/FacultyProfile'
import FacultyDashboard from './pages/FacultyDashboard'
import FacultyTeachingLoad from './pages/FacultyTeachingLoad'
import FacultySchedule from './pages/FacultySchedule'
import FacultyDocuments from './pages/FacultyDocuments'
import FacultyEvaluations from './pages/FacultyEvaluations'
import FacultyConsultation from './pages/FacultyConsultation'
import FacultySubjects from './pages/FacultySubjects'
import AdminLogin from './pages/AdminLogin'
import AdminBootstrapAccount from './pages/AdminBootstrapAccount'
import AdminAdminsPage from './pages/AdminAdminsPage'
import AdminFacultyList from './pages/AdminFacultyList'
import AdminFacultyView from './pages/AdminFacultyView'
import AdminCreateFaculty from './pages/AdminCreateFaculty'
import ActivityLog from './pages/ActivityLog'
import StudentLogin from './pages/StudentLogin'
import FacultyLogin from './pages/FacultyLogin'
import FacultyRegister from './pages/FacultyRegister'
import CollegeResearch from './pages/CollegeResearch'
import { canAccessPath } from './lib/security'
import './App.css'

function RequireAuth() {
  const hasToken = Boolean(localStorage.getItem('authToken'))
  return hasToken ? <Outlet /> : <Navigate to="/admin/login" replace />
}

function RequirePermission() {
  const location = useLocation()
  const path = location.pathname

  // Allow root path or public paths to avoid infinite redirect loops
  // before the profile is fully loaded/synchronized.
  if (path === '/') return <Outlet />

  if (!canAccessPath(path)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

/** Old URL: send admins to in-app provision; others to first-time bootstrap. */
function LegacyAdminCreateAccountRedirect() {
  try {
    const token = localStorage.getItem('authToken')
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    if (token && user?.role === 'admin') {
      return <Navigate to="/admin/admins" replace />
    }
  } catch {
    // fall through
  }
  return <Navigate to="/admin/bootstrap" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/create-account" element={<LegacyAdminCreateAccountRedirect />} />
        <Route path="/admin/bootstrap" element={<AdminBootstrapAccount />} />
        <Route path="/admin/provision-admin" element={<Navigate to="/admin/admins" replace />} />
        <Route path="/student/login" element={<StudentLogin />} />
        <Route path="/student/register" element={<Navigate to="/student/login" replace />} />
        <Route path="/faculty/login" element={<FacultyLogin />} />
        <Route path="/faculty/register" element={<FacultyRegister />} />
        <Route element={<RequireAuth />}>
          <Route element={<RequirePermission />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="faculty-dashboard" element={<FacultyDashboard />} />
            <Route path="admin-profile" element={<AdminProfile />} />
            <Route path="student-profile" element={<StudentProfileRoute />} />
            <Route path="admin/create-student" element={<AdminCreateStudent />} />
            <Route path="admin/student/:id" element={<AdminStudentView />} />
            <Route path="admin/faculty" element={<AdminFacultyList />} />
            <Route path="admin/faculty/:id" element={<AdminFacultyView />} />
            <Route path="admin/create-faculty" element={<AdminCreateFaculty />} />
            <Route path="admin/admins" element={<AdminAdminsPage />} />
            <Route path="activity-log" element={<ActivityLog />} />
            <Route path="admin/reports" element={<ModulePage />} />
            <Route path="faculty-my-profile" element={<FacultyProfile />} />
            <Route path="faculty/teaching-load" element={<FacultyTeachingLoad />} />
            <Route path="faculty/schedule" element={<FacultySchedule />} />
            <Route path="faculty/documents" element={<FacultyDocuments />} />
            <Route path="faculty/evaluations" element={<FacultyEvaluations />} />
            <Route path="faculty/consultation" element={<FacultyConsultation />} />
            <Route path="faculty/subjects" element={<FacultySubjects />} />
            <Route path="events" element={<ModulePage />} />
            <Route path="scheduling" element={<ModulePage />} />
            <Route path="college-research" element={<CollegeResearch />} />
            <Route path="instructions" element={<ModulePage />} />
          </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
