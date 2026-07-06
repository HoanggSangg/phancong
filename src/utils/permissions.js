const ROLES = {
  ADMIN: 'admin',
  GIAM_SAT: 'giam_sat',
  KTV: 'ktv',
};

const PERMISSION_CATALOG = [
  { key: 'cars.today', defaultRoles: ['admin', 'giam_sat', 'ktv'] },
  { key: 'cars.manage', defaultRoles: ['admin', 'giam_sat', 'ktv'] },
  { key: 'cars.add', defaultRoles: ['admin', 'giam_sat'] },
  { key: 'cars.delete', defaultRoles: ['admin'] },
  { key: 'cars.voice', defaultRoles: ['admin', 'giam_sat'] },
  { key: 'workers.main', defaultRoles: ['admin', 'giam_sat'] },
  { key: 'workers.woker', defaultRoles: ['admin', 'giam_sat', 'ktv'] },
  { key: 'workers.available', defaultRoles: ['admin', 'giam_sat'] },
  { key: 'workers.repair-history', defaultRoles: ['admin', 'giam_sat'] },
  { key: 'teams.manage', defaultRoles: ['admin', 'giam_sat'] },
  { key: 'reports.revenue', defaultRoles: ['admin', 'giam_sat'] },
  { key: 'reports.dashboard', defaultRoles: ['admin'] },
  { key: 'reports.dashboard', defaultRoles: ['admin'] },
  { key: 'reports.praise', defaultRoles: ['admin', 'giam_sat'] },
  { key: 'reports.warning', defaultRoles: ['admin', 'giam_sat'] },
  { key: 'system.locations', defaultRoles: ['admin'] },
  { key: 'system.supervisors', defaultRoles: ['admin'] },
  { key: 'system.users', defaultRoles: ['admin'] },
  { key: 'system.permissions', defaultRoles: ['admin'] },
  { key: 'system.audit-logs', defaultRoles: ['admin'] },
  { key: 'system.ktv-messages', defaultRoles: ['admin', 'giam_sat'] },
];

const PERMISSION_KEYS = PERMISSION_CATALOG.map((item) => item.key);

const sanitizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return [];
  return [...new Set(permissions.filter((key) => PERMISSION_KEYS.includes(key)))];
};

const getDefaultPermissionsForRole = (role) =>
  PERMISSION_CATALOG.filter((item) => item.defaultRoles.includes(role)).map((item) => item.key);

const usesCustomPermissions = (user) =>
  Array.isArray(user?.permissions) && user.permissions.length > 0;

const getEffectivePermissions = (user) => {
  if (!user) return [];
  if (user.role === ROLES.ADMIN) return PERMISSION_KEYS;
  if (usesCustomPermissions(user)) return sanitizePermissions(user.permissions);
  return getDefaultPermissionsForRole(user.role);
};

const hasPermission = (user, permissionKey) => {
  if (!user) return false;
  if (user.role === ROLES.ADMIN) return true;
  return getEffectivePermissions(user).includes(permissionKey);
};

module.exports = {
  ROLES,
  PERMISSION_KEYS,
  PERMISSION_CATALOG,
  sanitizePermissions,
  getDefaultPermissionsForRole,
  usesCustomPermissions,
  getEffectivePermissions,
  hasPermission,
};
