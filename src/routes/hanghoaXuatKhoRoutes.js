const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');
const {
  listHanghoa,
  getHanghoa,
  lookupHanghoa,
  listXuatKhoLichSu,
  luuXuatTheoRo,
  xuatKho,
} = require('../controllers/xuatKhoController');

const hanghoaRouter = express.Router();
const xeRouter = express.Router();

/** Gắn req.user nếu có token — không chặn khi thiếu (trang tải ảnh công khai). */
const optionalAuthenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next();

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (user?.isActive) req.user = user;
  } catch {
    // bỏ qua — vẫn cho dùng API công khai
  }
  return next();
};

hanghoaRouter.get('/', listHanghoa);
hanghoaRouter.get('/lookup', lookupHanghoa);
hanghoaRouter.get('/xuat-theo-ro', listXuatKhoLichSu);
hanghoaRouter.post('/xuat-theo-ro', optionalAuthenticate, luuXuatTheoRo);
hanghoaRouter.get('/:id', getHanghoa);

xeRouter.post('/xuat-kho', optionalAuthenticate, xuatKho);

module.exports = {
  hanghoaRouter,
  xeRouter,
};
