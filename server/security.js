export const ROLES = {
  ADMIN: 'admin',
  STUDENT: 'student',
  FACULTY: 'faculty',
  DEAN: 'dean',
  DEPARTMENT_CHAIR: 'department_chair',
  SECRETARY: 'secretary',
  FACULTY_PROFESSOR: 'faculty_professor',
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

  // Document Management System (NEW)
  DOC_CREATE: 'doc:create',
  DOC_READ_OWN: 'doc:read_own',
  DOC_UPDATE_OWN: 'doc:update_own',
  DOC_APPROVE: 'doc:approve',
  DOC_DELETE: 'doc:delete',
  VIEW_REPORTS: 'reports:view',
  MANAGE_DEPARTMENT: 'dept:manage',
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
    PERMISSIONS.DOC_CREATE,
    PERMISSIONS.DOC_APPROVE,
    PERMISSIONS.DOC_DELETE,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_DEPARTMENT,
  ]),
  [ROLES.STUDENT]: new Set([
     PERMISSIONS.DASHBOARD_VIEW,
     PERMISSIONS.STUDENT_PROFILE,
     PERMISSIONS.EVENTS_VIEW,
     PERMISSIONS.DOC_CREATE,
     PERMISSIONS.DOC_READ_OWN,
     PERMISSIONS.DOC_UPDATE_OWN,
     PERMISSIONS.COLLEGE_RESEARCH_VIEW,
   ]),
  [ROLES.FACULTY]: new Set([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.EVENTS_VIEW,
    PERMISSIONS.EVENTS_MANAGE, // Can create/manage their own events
    PERMISSIONS.DOC_CREATE,
    PERMISSIONS.DOC_READ_OWN,
    PERMISSIONS.DOC_UPDATE_OWN,
    PERMISSIONS.DOC_APPROVE, // Minor submissions/Student submissions
    PERMISSIONS.COLLEGE_RESEARCH_VIEW,
  ]),
  [ROLES.DEAN]: new Set([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.FACULTY_PROFILE,
    PERMISSIONS.STUDENT_PROFILE,
    PERMISSIONS.EVENTS_VIEW,
    PERMISSIONS.EVENTS_MANAGE,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.DOC_READ_OWN,
    PERMISSIONS.DOC_APPROVE,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_DEPARTMENT,
    PERMISSIONS.COLLEGE_RESEARCH_VIEW,
  ]),
  [ROLES.DEPARTMENT_CHAIR]: new Set([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.FACULTY_PROFILE,
    PERMISSIONS.STUDENT_PROFILE,
    PERMISSIONS.EVENTS_VIEW,
    PERMISSIONS.EVENTS_MANAGE,
    PERMISSIONS.DOC_READ_OWN,
    PERMISSIONS.DOC_APPROVE,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_DEPARTMENT,
    PERMISSIONS.COLLEGE_RESEARCH_VIEW,
  ]),
  [ROLES.SECRETARY]: new Set([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.STUDENT_PROFILE,
    PERMISSIONS.EVENTS_VIEW,
    PERMISSIONS.EVENTS_MANAGE,
    PERMISSIONS.DOC_CREATE,
    PERMISSIONS.DOC_READ_OWN,
    PERMISSIONS.DOC_UPDATE_OWN,
    PERMISSIONS.MANAGE_DEPARTMENT, // Organizing department docs
    PERMISSIONS.COLLEGE_RESEARCH_VIEW,
  ]),
  [ROLES.FACULTY_PROFESSOR]: new Set([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FACULTY_MY_PROFILE,
    PERMISSIONS.EVENTS_VIEW,
    PERMISSIONS.EVENTS_MANAGE,
    PERMISSIONS.DOC_CREATE,
    PERMISSIONS.DOC_READ_OWN,
    PERMISSIONS.DOC_UPDATE_OWN,
    PERMISSIONS.DOC_APPROVE,
    PERMISSIONS.COLLEGE_RESEARCH_VIEW,
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

/**
 * Require an authenticated user whose role is one of the allowed values.
 * Returns 403 for missing user, missing role, or disallowed role (never reveals which).
 */
export function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles)
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (!allowed.has(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

