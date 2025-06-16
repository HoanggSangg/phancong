const express = require('express');
const router = express.Router();
const carController = require('../controllers/carController');

// Lấy tất cả xe
router.get('/', carController.getAllCars);

// Lấy xe theo ID
router.get('/:id', carController.getCarById);

// Tạo xe mới
router.post('/', carController.createCar);

// Cập nhật xe
router.put('/:id', carController.updateCar);

// Xóa xe
router.delete('/:id', carController.deleteCar);

module.exports = router;
