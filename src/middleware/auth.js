const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { setupAuditLog } = require('../utils/auditLog');

const JWT_SECRET = process.env.JWT_SECRET || 'phancong-dev-secret-change-me';

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Chưa đăng nhập' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Tài khoản không hợp lệ hoặc đã bị khóa' });
    }

    req.user = user;
    setupAuditLog(req, res);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Chưa đăng nhập' });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
  }

  return next();
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
  authorize,
  signToken,
  sanitizeUser,
  JWT_SECRET,
};
