const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('./auth');

/** Gắn req.user nếu có token hợp lệ — không chặn khi thiếu / sai token (API công khai). */
const optionalAuthenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    let token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token && req.query?.access_token) {
      token = String(req.query.access_token).trim();
    }
    if (!token) return next();

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (user?.isActive) {
      req.user = user;
    }
  } catch {
    // bỏ qua — vẫn cho dùng API công khai
  }
  return next();
};

module.exports = { optionalAuthenticate };
