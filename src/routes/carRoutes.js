const express = require('express');
const router = express.Router();
const carController = require('../controllers/carController');
const { authenticate, access } = require('../middleware/auth');

router.use(authenticate);

router.get('/stats', access(['admin', 'giam_sat', 'ktv'], 'cars.today'), carController.getCarStats);
router.get('/working-pending', access(['admin', 'giam_sat', 'ktv'], 'cars.today'), carController.getWorkingAndPendingCars);
router.get('/by-location/:locationId', access(['admin', 'giam_sat', 'ktv'], 'cars.today'), carController.getCarsByLocation);
router.get('/by-plate/:plateNumber', access(['admin', 'giam_sat', 'ktv'], 'cars.today'), carController.getCarByPlateNumber);
router.get('/overdue', access(['admin', 'giam_sat', 'ktv'], 'cars.today'), carController.getOverdueCars);
router.get('/manage-list', access(['admin', 'giam_sat', 'ktv'], 'cars.manage'), carController.getManageCarsList);
router.get('/repair-history', access(['admin', 'giam_sat', 'ktv'], 'workers.repair-history'), carController.getRepairHistory);
router.get('/:id/repair-items', access(['admin', 'giam_sat', 'ktv'], 'cars.manage'), carController.getCarRepairItems);
router.put('/:id/repair-items/assignments', access(['admin', 'giam_sat'], 'cars.add'), carController.assignRepairItemWorkers);
router.put('/:id/repair-items/manual', access(['admin', 'giam_sat'], 'cars.add'), carController.saveManualRepairItems);
router.get('/:id/workers/history', access(['admin', 'giam_sat'], 'cars.add'), carController.getCarWorkersHistory);
router.get('/', access(['admin', 'giam_sat', 'ktv'], 'cars.today'), carController.getAllCars);
router.get('/:id', access(['admin', 'giam_sat', 'ktv'], 'cars.today'), carController.getCarById);
router.post('/', access(['admin', 'giam_sat'], 'cars.add'), carController.createCar);
router.put('/:id', access(['admin', 'giam_sat'], 'cars.add'), carController.updateCar);
router.post('/:id/sync-external', access(['admin', 'giam_sat'], 'cars.add'), carController.syncCarFromExternal);
router.put('/:id/status', access(['admin', 'giam_sat'], 'cars.add'), carController.updateCarStatus);
router.post('/:id/notify-admin', access(['ktv'], 'cars.manage'), carController.notifyAdminAboutCar);
router.delete('/:id', access(['admin'], 'cars.delete'), carController.deleteCar);

module.exports = router;
