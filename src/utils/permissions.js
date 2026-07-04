const PERMISSION_KEYS = [
  'cars.today',
  'cars.manage',
  'cars.add',
  'cars.delete',
  'cars.voice',
  'workers.main',
  'workers.available',
  'workers.woker',
  'workers.repair-history',
  'workers.kpi',
  'teams.manage',
  'reports.revenue',
  'reports.praise',
  'reports.warning',
  'system.locations',
  'system.supervisors',
  'system.users',
  'system.permissions',
  'system.audit-logs',
];

const sanitizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return [];
  return [...new Set(permissions.filter((key) => PERMISSION_KEYS.includes(key)))];
};

module.exports = {
  PERMISSION_KEYS,
  sanitizePermissions,
};
