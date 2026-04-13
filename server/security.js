export const ROLES = {
  ADMIN: 'admin',
  STUDENT: 'student',
  FACULTY: 'faculty',
}

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

export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: new Set([
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
  ]),
  [ROLES.STUDENT]: new Set([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.STUDENT_PROFILE,
    PERMISSIONS.FACULTY_PROFILE,
    PERMISSIONS.EVENTS_VIEW,
    PERMISSIONS.SCHEDULING_VIEW,
    PERMISSIONS.COLLEGE_RESEARCH_VIEW,
    PERMISSIONS.INSTRUCTIONS_VIEW,
  ]),
  [ROLES.FACULTY]: new Set([
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
  ]),
}

export function hasPermission(role, permission) {
  const set = ROLE_PERMISSIONS[role]
  const allowed = set ? set.has(permission) : false
  if (!allowed) {
    console.warn(`[Security] Permission denied: Role "${role}" lacks permission "${permission}"`)
  }
  return allowed
}

export function authorize(permission) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      console.warn(`[Security] Forbidden: No user or role found in request for permission "${permission}"`)
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (hasPermission(req.user.role, permission)) {
      next()
    } else {
      res.status(403).json({ error: 'Forbidden: Missing permission' })
    }
  }
}

