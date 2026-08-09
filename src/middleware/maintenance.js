const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('./auth');
const { getSystemSettings } = require('../utils/systemSettings');

const ALWAYS_ALLOW_PREFIXES = [
  '/api/system/status',
  '/api/system/version',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/me',
];

const isAlwaysAllowed = (req) => {
  if (req.method === 'OPTIONS') return true;
  if (req.path === '/' || req.originalUrl === '/') return true;

  const url = req.originalUrl || req.url || '';
  return ALWAYS_ALLOW_PREFIXES.some((prefix) => url.startsWith(prefix));
};

const tryResolveAdmin = async (req) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return false;

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('role isActive').lean();
    return Boolean(user?.isActive && user.role === 'admin');
  } catch {
    return false;
  }
};

/**
 * Khi bảo trì: chỉ admin còn dùng API; các request khác nhận 503.
 * /api/system/status và login/register luôn mở.
 */
const blockIfMaintenance = async (req, res, next) => {
  // Đọc lại DB để tắt bảo trì có hiệu lực ngay (không kẹt cache cũ)
  const settings = await getSystemSettings();
  if (!settings.maintenanceMode) return next();
  if (isAlwaysAllowed(req)) return next();

  const isAdmin = await tryResolveAdmin(req);
  if (isAdmin) return next();

  return res.status(503).json({
    code: 'MAINTENANCE',
    message: settings.maintenanceMessage
      || 'Hệ thống đang bảo trì. Vui lòng quay lại sau.',
    maintenanceMode: true,
  });
};

module.exports = {
  blockIfMaintenance,
};
