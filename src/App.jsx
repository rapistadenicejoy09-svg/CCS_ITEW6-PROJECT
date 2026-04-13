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
import FacultyLogin from './pages/FacultyLogin'
import FacultyRegister from './pages/FacultyRegister'
import InstructionsPage from './pages/InstructionsPage'
import AdminAddMaterial from './pages/AdminAddMaterial'
import AdminViewMaterial from './pages/AdminViewMaterial'
import AdminEditMaterial from './pages/AdminEditMaterial'
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
        <Route path="/admin/create-account" element={<AdminCreateAccount />} />
        <Route path="/student/login" element={<StudentLogin />} />
        <Route path="/student/register" element={<Navigate to="/student/login" replace />} />
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
            <Route path="faculty-profile" element={<ModulePage />} />
            <Route path="events" element={<ModulePage />} />
            <Route path="scheduling" element={<ModulePage />} />
            <Route path="college-research" element={<ModulePage />} />
            <Route path="instructions" element={<InstructionsPage />} />
            <Route path="admin/instructions/add" element={<AdminAddMaterial />} />
            <Route path="admin/instructions/:id" element={<AdminViewMaterial />} />
            <Route path="admin/instructions/:id/edit" element={<AdminEditMaterial />} />
          </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
