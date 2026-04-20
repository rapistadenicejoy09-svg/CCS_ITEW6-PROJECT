import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import Layout from './Layout'
import Dashboard from './pages/Dashboard'
import ModulePage from './pages/ModulePage'
import AdminProfile from './pages/AdminProfile'
import StudentProfileRoute from './pages/StudentProfileRoute'
import AdminCreateStudent from './pages/AdminCreateStudent'
import AdminStudentView from './pages/AdminStudentView'
import FacultyProfile from './pages/FacultyProfile'
import AdminLogin from './pages/AdminLogin'
import AdminCreateAccount from './pages/AdminCreateAccount'
import StudentLogin from './pages/StudentLogin'
import StudentRegister from './pages/StudentRegister'
import FacultyLogin from './pages/FacultyLogin'
import FacultyRegister from './pages/FacultyRegister'
import InstructionsPage from './pages/InstructionsPage'
import AdminAddMaterial from './pages/AdminAddMaterial'
import AdminViewMaterial from './pages/AdminViewMaterial'
import AdminEditMaterial from './pages/AdminEditMaterial'
import SchedulingPage from './pages/SchedulingPage'
import SchedulingAddPage from './pages/SchedulingAddPage'
import SchedulingViewPage from './pages/SchedulingViewPage'
import SchedulingEditPage from './pages/SchedulingEditPage'
import CollegeResearch from './pages/CollegeResearch'
import AdminFacultyList from './pages/AdminFacultyList'
import AdminCreateFaculty from './pages/AdminCreateFaculty'
import AdminFacultyView from './pages/AdminFacultyView'
import AdminEventList from './pages/AdminEventList'
import AdminAdminsPage from './pages/AdminAdminsPage'
import AdminBootstrapAccount from './pages/AdminBootstrapAccount'
import ActivityLog from './pages/ActivityLog'
import FacultyDashboard from './pages/FacultyDashboard'
import FacultyTeachingLoad from './pages/FacultyTeachingLoad'
import FacultySchedule from './pages/FacultySchedule'
import FacultyDocuments from './pages/FacultyDocuments'
import FacultyEvaluations from './pages/FacultyEvaluations'
import FacultyConsultation from './pages/FacultyConsultation'
import FacultySubjects from './pages/FacultySubjects'
import { canAccessPath } from './lib/security'
import './App.css'

function RequireAuth() {
  const hasToken = Boolean(localStorage.getItem('authToken'))
  return hasToken ? <Outlet /> : <Navigate to="/admin/login" replace />
}

function RequirePermission() {
  const location = useLocation()
  const path = location.pathname

  if (!canAccessPath(path)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/setup" element={<AdminBootstrapAccount />} />
        <Route path="/admin/create-account" element={<AdminCreateAccount />} />
        <Route path="/student/login" element={<StudentLogin />} />
        <Route path="/student/register" element={<StudentRegister />} />
        <Route path="/faculty/login" element={<FacultyLogin />} />
        <Route path="/faculty/register" element={<FacultyRegister />} />
        <Route element={<RequireAuth />}>
          <Route element={<RequirePermission />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="admin-profile" element={<AdminProfile />} />
            <Route path="student-profile" element={<StudentProfileRoute />} />
            <Route path="admin/create-student" element={<AdminCreateStudent />} />
            <Route path="admin/student/:id" element={<AdminStudentView />} />
            <Route path="faculty-my-profile" element={<FacultyProfile />} />
            <Route path="faculty-profile" element={<AdminFacultyList />} />
            <Route path="admin/faculty/create" element={<AdminCreateFaculty />} />
            <Route path="admin/faculty/:id" element={<AdminFacultyView />} />
            <Route path="events" element={<AdminEventList />} />
            <Route path="scheduling" element={<SchedulingPage />} />
            <Route path="scheduling/add" element={<SchedulingAddPage />} />
            <Route path="scheduling/:id" element={<SchedulingViewPage />} />
            <Route path="scheduling/:id/edit" element={<SchedulingEditPage />} />
            <Route path="college-research" element={<CollegeResearch />} />
            <Route path="instructions" element={<InstructionsPage />} />
            <Route path="admin/instructions/add" element={<AdminAddMaterial />} />
            <Route path="admin/instructions/:id" element={<AdminViewMaterial />} />
            <Route path="admin/instructions/:id/edit" element={<AdminEditMaterial />} />

            {/* New Faculty & Admin Modules */}
            <Route path="admin/admins" element={<AdminAdminsPage />} />
            <Route path="faculty-dashboard" element={<FacultyDashboard />} />
            <Route path="admin/activity-log" element={<ActivityLog />} />
            <Route path="admin/reports" element={<ModulePage />} />
            <Route path="faculty/teaching-load" element={<FacultyTeachingLoad />} />
            <Route path="faculty/schedule" element={<FacultySchedule />} />
            <Route path="faculty/documents" element={<FacultyDocuments />} />
            <Route path="faculty/evaluations" element={<FacultyEvaluations />} />
            <Route path="faculty/consultation" element={<FacultyConsultation />} />
            <Route path="faculty/subjects" element={<FacultySubjects />} />
          </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
