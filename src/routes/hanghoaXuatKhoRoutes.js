const express = require('express');
const { optionalAuthenticate } = require('../middleware/optionalAuth');
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
