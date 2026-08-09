const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { setupAuditLog } = require('../utils/auditLog');
const { hasPermission } = require('../utils/permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'phancong-dev-secret-change-me';
const USER_CACHE_TTL_MS = 60_000;
const userCache = new Map();

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    let token = header.startsWith('Bearer ') ? header.slice(7) : null;
    // Cho <img>/<video src> — không gửi được header Authorization
    if (!token && req.query?.access_token) {
      token = String(req.query.access_token).trim();
    }

    if (!token) {
      return res.status(401).json({ message: 'Chưa đăng nhập' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const cached = userCache.get(String(decoded.userId));
    if (cached && cached.expiresAt > Date.now() && cached.user) {
      req.user = cached.user;
      setupAuditLog(req, res);
      return next();
    }

    if (cached && !cached.user) {
      userCache.delete(String(decoded.userId));
    }

    const user = await User.findById(decoded.userId).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Tài khoản không hợp lệ hoặc đã bị khóa' });
    }

    userCache.set(String(decoded.userId), {
      user,
      expiresAt: Date.now() + USER_CACHE_TTL_MS,
    });

    req.user = user;
    setupAuditLog(req, res);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ' });
  }
};

const access = (roles, permission) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Chưa đăng nhập' });
  }

  try {
    if (req.user.role === 'admin') {
      return next();
    }

    // Catalog quyền (default theo role hoặc custom) là nguồn chính
    if (permission && hasPermission(req.user, permission)) {
      return next();
    }

    // Fallback danh sách role (tương thích route cũ / thiếu permission key)
    if (Array.isArray(roles) && roles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Lỗi kiểm tra quyền truy cập' });
  }
};

const signToken = (userId) => jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });

const sanitizeUser = (user) => ({
  _id: user._id,
  username: user.username,
  fullName: user.fullName,
  role: user.role,
  worker: user.worker?._id || user.worker || null,
  isActive: user.isActive,
  permissions: user.permissions || [],
  createdAt: user.createdAt,
});

module.exports = {
  authenticate,
  access,
  signToken,
  sanitizeUser,
  JWT_SECRET,
};
