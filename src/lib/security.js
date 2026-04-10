/**
 * Role-Based Access Control (RBAC) - System Security Module
 * Controls user access based on roles and permissions.
 */

export const ROLES = {
  ADMIN: 'admin',
  STUDENT: 'student',
  FACULTY: 'faculty',
  DEAN: 'dean',
  DEPARTMENT_CHAIR: 'department_chair',
  SECRETARY: 'secretary',
  FACULTY_PROFESSOR: 'faculty_professor',
}

/** Permissions define what actions/features a role can access */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard:view',
  ADMIN_PROFILE: 'admin:profile',
  STUDENT_PROFILE: 'student:profile',
  FACULTY_PROFILE: 'faculty:profile',
  FACULTY_MY_PROFILE: 'faculty:my_profile',
  EVENTS_VIEW: 'events:view',
  EVENTS_MANAGE: 'events:manage',
  SCHEDULING_VIEW: 'scheduling:view',
  SCHEDULING_MANAGE: 'scheduling:manage',
  COLLEGE_RESEARCH_VIEW: 'college_research:view',
  COLLEGE_RESEARCH_MANAGE: 'college_research:manage',
  INSTRUCTIONS_VIEW: 'instructions:view',
  INSTRUCTIONS_MANAGE: 'instructions:manage',
  CREATE_ADMIN_ACCOUNT: 'admin:create_account',
  MANAGE_USERS: 'users:manage',

  // Document Management System (NEW)
  DOC_CREATE: 'doc:create',
  DOC_READ_OWN: 'doc:read_own',
  DOC_UPDATE_OWN: 'doc:update_own',
  DOC_APPROVE: 'doc:approve',
  DOC_DELETE: 'doc:delete',
  VIEW_REPORTS: 'reports:view',
  MANAGE_DEPARTMENT: 'dept:manage',
}

/** Role → Permissions mapping */
const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ADMIN_PROFILE,
    PERMISSIONS.STUDENT_PROFILE,
    PERMISSIONS.FACULTY_PROFILE,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.EVENTS_VIEW,
    PERMISSIONS.EVENTS_MANAGE,
    PERMISSIONS.SCHEDULING_VIEW,
    PERMISSIONS.SCHEDULING_MANAGE,
    PERMISSIONS.COLLEGE_RESEARCH_VIEW,
    PERMISSIONS.COLLEGE_RESEARCH_MANAGE,
    PERMISSIONS.INSTRUCTIONS_VIEW,
    PERMISSIONS.INSTRUCTIONS_MANAGE,
    PERMISSIONS.CREATE_ADMIN_ACCOUNT,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.DOC_CREATE,
    PERMISSIONS.DOC_APPROVE,
    PERMISSIONS.DOC_DELETE,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_DEPARTMENT,
  ],
  [ROLES.STUDENT]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.STUDENT_PROFILE,
    PERMISSIONS.DOC_CREATE,
    PERMISSIONS.DOC_READ_OWN,
    PERMISSIONS.DOC_UPDATE_OWN,
    PERMISSIONS.INSTRUCTIONS_VIEW,
  ],
  [ROLES.FACULTY]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.DOC_CREATE,
    PERMISSIONS.DOC_READ_OWN,
    PERMISSIONS.DOC_UPDATE_OWN,
    PERMISSIONS.DOC_APPROVE,
  ],
  [ROLES.DEAN]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.FACULTY_PROFILE,
    PERMISSIONS.STUDENT_PROFILE,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.DOC_READ_OWN,
    PERMISSIONS.DOC_APPROVE,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_DEPARTMENT,
  ],
  [ROLES.DEPARTMENT_CHAIR]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.FACULTY_PROFILE,
    PERMISSIONS.STUDENT_PROFILE,
    PERMISSIONS.DOC_READ_OWN,
    PERMISSIONS.DOC_APPROVE,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_DEPARTMENT,
  ],
  [ROLES.SECRETARY]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.STUDENT_PROFILE,
    PERMISSIONS.DOC_CREATE,
    PERMISSIONS.DOC_READ_OWN,
    PERMISSIONS.DOC_UPDATE_OWN,
    PERMISSIONS.MANAGE_DEPARTMENT,
  ],
  [ROLES.FACULTY_PROFESSOR]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.DOC_CREATE,
    PERMISSIONS.DOC_READ_OWN,
    PERMISSIONS.DOC_UPDATE_OWN,
    PERMISSIONS.DOC_APPROVE,
  ],
}

/** Path → required permission */
export const PATH_PERMISSIONS = {
  '/': PERMISSIONS.DASHBOARD_VIEW,
  '/admin-profile': PERMISSIONS.ADMIN_PROFILE,
  '/student-profile': PERMISSIONS.STUDENT_PROFILE,
  '/faculty-my-profile': PERMISSIONS.FACULTY_MY_PROFILE,
  '/faculty-profile': PERMISSIONS.FACULTY_PROFILE,
  '/faculty/teaching-load': PERMISSIONS.FACULTY_PROFILE,
  '/faculty/schedule': PERMISSIONS.SCHEDULING_VIEW,
  '/faculty/documents': PERMISSIONS.DOC_READ_OWN,
  '/faculty/evaluations': PERMISSIONS.DOC_READ_OWN,
  '/faculty/consultation': PERMISSIONS.FACULTY_MY_PROFILE,
  '/faculty/subjects': PERMISSIONS.FACULTY_PROFILE,
  '/events': PERMISSIONS.EVENTS_VIEW,
  '/scheduling': PERMISSIONS.SCHEDULING_VIEW,
  '/college-research': PERMISSIONS.COLLEGE_RESEARCH_VIEW,
  '/instructions': PERMISSIONS.INSTRUCTIONS_VIEW,
  '/admin/users': PERMISSIONS.MANAGE_USERS,
  '/admin/reports': PERMISSIONS.VIEW_REPORTS,
}

/**
 * Get current user role from session
 */
export function getCurrentRole() {
  try {
    const raw = localStorage.getItem('authUser')
    if (!raw) return null
    const user = JSON.parse(raw)
    const roleValue = user?.role
    if (!roleValue) return null
    
    // Check if the role value exists in our ROLES object
    const match = Object.values(ROLES).find(r => r === roleValue)
    return match || null
  } catch {
    // ignore
  }
  return null
}

/**
 * Check if the current role has a specific permission
 */
export function hasPermission(permission) {
  const role = getCurrentRole()
  if (!role) return false
  const permissions = ROLE_PERMISSIONS[role]
  return permissions?.includes(permission) ?? false
}

/**
 * Check if the current role can access a path
 */
export function canAccessPath(path) {
  if (path === '/admin/create-student' || path.startsWith('/admin/student/') || path === '/admin/users') {
    return hasPermission(PERMISSIONS.MANAGE_USERS)
  }
  const perm = PATH_PERMISSIONS[path]
  if (!perm) return true
  return hasPermission(perm)
}

/**
 * Get allowed routes/modules for current role
 */
export function getAllowedModules(modules) {
  const role = getCurrentRole()
  if (!role) return []
  const permissions = ROLE_PERMISSIONS[role]
  return modules.filter((m) => {
    const perm = PATH_PERMISSIONS[m.path]
    return !perm || permissions?.includes(perm)
  })
}
