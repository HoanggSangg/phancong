const express = require('express');
const router = express.Router();

const {
    getAllWorkers,
    getWorkerById,
    createWorker,
    updateWorker,
    deleteWorker,
    getMainWorkers,
    getAssistantWorkers,
    getAvailableWorkers,
    getBusyWorkersWithCars
} = require('../controllers/wokerController'); // Đảm bảo đúng tên: workerController

// Lấy tất cả thợ
router.get('/', getAllWorkers);

// Lấy thợ đang rảnh
router.get('/available', getAvailableWorkers);

// Lấy thợ đang bận và xe họ đang làm
router.get('/busy', getBusyWorkersWithCars);

// Lấy thợ theo ID
router.get('/:id', getWorkerById);

// Tạo thợ mới
router.post('/', createWorker);

// Cập nhật thông tin thợ
router.put('/:id', updateWorker);

// Xóa thợ
router.delete('/:id', deleteWorker);

module.exports = router;
