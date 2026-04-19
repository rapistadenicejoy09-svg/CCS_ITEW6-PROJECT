import AdminStudentList from './AdminStudentList'
import StudentProfile from './StudentProfile'

function getRole() {
  try {
    const raw = localStorage.getItem('authUser')
    const user = raw ? JSON.parse(raw) : null
    return user?.role || null
  } catch {
    return null
  }
}

export default function StudentProfileRoute() {
  const role = getRole()
  if (role === 'admin') return <AdminStudentList />
  return <StudentProfile />
}
