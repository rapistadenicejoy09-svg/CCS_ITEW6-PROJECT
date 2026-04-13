/**
 * Role-Based Access Control (RBAC) - System Security Module
 * Controls user access based on roles and permissions.
 */

export const ROLES = {
  ADMIN: 'admin',
  STUDENT: 'student',
  FACULTY: 'faculty',
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
  ],
  [ROLES.STUDENT]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.STUDENT_PROFILE,
    PERMISSIONS.FACULTY_PROFILE,
    PERMISSIONS.EVENTS_VIEW,
    PERMISSIONS.SCHEDULING_VIEW,
    PERMISSIONS.COLLEGE_RESEARCH_VIEW,
    PERMISSIONS.INSTRUCTIONS_VIEW,
  ],
  [ROLES.FACULTY]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.FACULTY_PROFILE,
    PERMISSIONS.STUDENT_PROFILE,
    PERMISSIONS.EVENTS_VIEW,
    PERMISSIONS.EVENTS_MANAGE,
    PERMISSIONS.SCHEDULING_VIEW,
    PERMISSIONS.SCHEDULING_MANAGE,
    PERMISSIONS.COLLEGE_RESEARCH_VIEW,
    PERMISSIONS.COLLEGE_RESEARCH_MANAGE,
    PERMISSIONS.INSTRUCTIONS_VIEW,
    PERMISSIONS.INSTRUCTIONS_MANAGE,
  ],
}

/** Path → required permission */
export const PATH_PERMISSIONS = {
  '/': PERMISSIONS.DASHBOARD_VIEW,
  '/admin-profile': PERMISSIONS.ADMIN_PROFILE,
  '/student-profile': PERMISSIONS.STUDENT_PROFILE,
  '/faculty-my-profile': PERMISSIONS.FACULTY_MY_PROFILE,
  '/faculty-profile': PERMISSIONS.FACULTY_PROFILE,
  '/events': PERMISSIONS.EVENTS_VIEW,
  '/scheduling': PERMISSIONS.SCHEDULING_VIEW,
  '/college-research': PERMISSIONS.COLLEGE_RESEARCH_VIEW,
  '/instructions': PERMISSIONS.INSTRUCTIONS_VIEW,
}

/**
 * Get current user role from session
 */
export function getCurrentRole() {
  try {
    const raw = localStorage.getItem('authUser')
    if (!raw) return null
    const user = JSON.parse(raw)
    if (user?.role === ROLES.ADMIN) return ROLES.ADMIN
    if (user?.role === ROLES.STUDENT) return ROLES.STUDENT
    if (user?.role === ROLES.FACULTY) return ROLES.FACULTY
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
  if (path === '/admin/create-student' || path.startsWith('/admin/student/')) {
    return hasPermission(PERMISSIONS.MANAGE_USERS)
  }
  if (path === '/admin/instructions/add' || /^\/admin\/instructions\/[^/]+\/edit$/.test(path)) {
    return hasPermission(PERMISSIONS.INSTRUCTIONS_MANAGE)
  }
  if (/^\/admin\/instructions\/[^/]+$/.test(path)) {
    return hasPermission(PERMISSIONS.INSTRUCTIONS_VIEW)
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
