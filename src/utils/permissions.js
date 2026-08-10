const ROLES = {
  ADMIN: 'admin',
  GIAM_SAT: 'giam_sat',
  KTV: 'ktv',
  LAI_XE: 'lai_xe',
  KHO: 'kho',
  CVDV: 'cvdv',
};

const KTV_LIKE_ROLES = ['ktv', 'lai_xe', 'kho'];
const GIAM_SAT_LIKE_ROLES = ['giam_sat', 'cvdv'];
const UPLOAD_IMAGE_ROLES = ['admin', 'giam_sat', 'ktv', 'lai_xe', 'kho', 'cvdv'];

const PERMISSION_CATALOG = [
  { key: 'cars.today', defaultRoles: ['admin', 'giam_sat', 'ktv', 'lai_xe', 'kho', 'cvdv'] },
  { key: 'cars.manage', defaultRoles: ['admin', 'giam_sat', 'ktv', 'lai_xe', 'kho', 'cvdv'] },
  { key: 'cars.add', defaultRoles: ['admin', 'giam_sat', 'cvdv'] },
  { key: 'cars.upload-image', defaultRoles: ['admin', 'giam_sat', 'ktv', 'lai_xe', 'kho', 'cvdv'] },
  { key: 'cars.delete', defaultRoles: ['admin'] },
  { key: 'cars.voice', defaultRoles: ['admin', 'giam_sat', 'cvdv'] },
  { key: 'workers.main', defaultRoles: ['admin', 'giam_sat', 'cvdv'] },
  { key: 'workers.woker', defaultRoles: ['admin', 'giam_sat', 'ktv', 'lai_xe', 'kho', 'cvdv'] },
  { key: 'workers.available', defaultRoles: ['admin', 'giam_sat', 'cvdv'] },
  { key: 'workers.repair-history', defaultRoles: ['admin', 'giam_sat', 'ktv', 'lai_xe', 'kho', 'cvdv'] },
  { key: 'teams.manage', defaultRoles: ['admin', 'giam_sat', 'cvdv'] },
  { key: 'reports.revenue', defaultRoles: ['admin', 'giam_sat', 'cvdv'] },
  { key: 'reports.dashboard', defaultRoles: ['admin'] },
  { key: 'reports.dashboard', defaultRoles: ['admin'] },
  { key: 'reports.praise', defaultRoles: ['admin', 'giam_sat', 'cvdv'] },
  { key: 'reports.warning', defaultRoles: ['admin', 'giam_sat', 'cvdv'] },
  { key: 'system.locations', defaultRoles: ['admin'] },
  { key: 'system.insurance', defaultRoles: ['admin'] },
  { key: 'system.supervisors', defaultRoles: ['admin'] },
  { key: 'system.users', defaultRoles: ['admin'] },
  { key: 'system.permissions', defaultRoles: ['admin'] },
  { key: 'system.audit-logs', defaultRoles: ['admin'] },
  { key: 'system.ktv-messages', defaultRoles: ['admin', 'giam_sat', 'cvdv'] },
  { key: 'system.settings', defaultRoles: ['admin'] },
  { key: 'payroll.manage', defaultRoles: ['admin'] },
  { key: 'payroll.day-work', defaultRoles: ['admin'] },
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

const isKtvLike = (roleOrUser) => {
  const role = typeof roleOrUser === 'object' ? roleOrUser?.role : roleOrUser;
  return KTV_LIKE_ROLES.includes(role);
};

const isGiamSatLike = (roleOrUser) => {
  const role = typeof roleOrUser === 'object' ? roleOrUser?.role : roleOrUser;
  return GIAM_SAT_LIKE_ROLES.includes(role);
};

module.exports = {
  ROLES,
  KTV_LIKE_ROLES,
  GIAM_SAT_LIKE_ROLES,
  UPLOAD_IMAGE_ROLES,
  PERMISSION_KEYS,
  PERMISSION_CATALOG,
  sanitizePermissions,
  getDefaultPermissionsForRole,
  usesCustomPermissions,
  getEffectivePermissions,
  hasPermission,
  isKtvLike,
  isGiamSatLike,
};
