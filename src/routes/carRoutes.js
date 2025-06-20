const express = require('express');
const router = express.Router();
const carController = require('../controllers/carController');

// ✅ Thống kê số lượng xe theo trạng thái
router.get('/stats', carController.getCarStats);

// ✅ Lấy danh sách xe đang sửa và chờ sửa
router.get('/working-pending', carController.getWorkingAndPendingCars);

// ✅ Lấy danh sách xe theo địa điểm (location)
router.get('/by-location/:locationId', carController.getCarsByLocation);

// ✅ Lấy xe theo biển số (phải đặt TRƯỚC '/:id' để không bị ăn nhầm)
router.get('/by-plate/:plateNumber', carController.getCarByPlateNumber);

// ✅ Lấy danh sách xe trễ hẹn (phải đặt TRƯỚC '/:id')
router.get('/overdue', carController.getOverdueCars);

// ✅ Lấy tất cả xe
router.get('/', carController.getAllCars);

// ✅ Lấy xe theo ID
router.get('/:id', carController.getCarById);

// ✅ Tạo xe mới
router.post('/', carController.createCar);

// ✅ Cập nhật xe
router.put('/:id', carController.updateCar);

// ✅ Cập nhật trạng thái xe
router.put('/:id/status', carController.updateCarStatus);

// ✅ Xóa xe
router.delete('/:id', carController.deleteCar);

module.exports = router;
