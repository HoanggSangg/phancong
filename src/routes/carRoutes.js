const express = require('express');
const router = express.Router();
const carController = require('../controllers/carController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/stats', authorize('admin', 'giam_sat', 'ktv'), carController.getCarStats);
router.get('/working-pending', authorize('admin', 'giam_sat', 'ktv'), carController.getWorkingAndPendingCars);
router.get('/by-location/:locationId', authorize('admin', 'giam_sat', 'ktv'), carController.getCarsByLocation);
router.get('/by-plate/:plateNumber', authorize('admin', 'giam_sat', 'ktv'), carController.getCarByPlateNumber);
router.get('/overdue', authorize('admin', 'giam_sat', 'ktv'), carController.getOverdueCars);
router.get('/repair-history', authorize('admin', 'giam_sat', 'ktv'), carController.getRepairHistory);
router.get('/:id/repair-items', authorize('admin', 'giam_sat', 'ktv'), carController.getCarRepairItems);
router.put('/:id/repair-items/assignments', authorize('admin', 'giam_sat'), carController.assignRepairItemWorkers);
router.put('/:id/repair-items/manual', authorize('admin', 'giam_sat'), carController.saveManualRepairItems);
router.get('/:id/workers', authorize('admin', 'giam_sat'), carController.getCarWorkers);
router.get('/:id/workers/history', authorize('admin', 'giam_sat'), carController.getCarWorkersHistory);
router.get('/:id/workers/export', authorize('admin', 'giam_sat'), carController.exportCarWorkersReport);
router.get('/', authorize('admin', 'giam_sat', 'ktv'), carController.getAllCars);
router.get('/:id', authorize('admin', 'giam_sat', 'ktv'), carController.getCarById);
router.post('/', authorize('admin', 'giam_sat'), carController.createCar);
router.put('/:id', authorize('admin', 'giam_sat'), carController.updateCar);
router.put('/:id/status', authorize('admin', 'giam_sat'), carController.updateCarStatus);
router.delete('/:id', authorize('admin'), carController.deleteCar);

module.exports = router;
