const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

const {
  getAllWorkers,
  getWorkerById,
  createWorker,
  updateWorker,
  deleteWorker,
  getAvailableWorkers,
  getBusyWorkersWithCars,
  getWorkerPerformance,
  getWorkerDailyPerformancePercentage,
  getWorkerRevenueChart,
  getWorkerWeeklyRevenueSummary,
  addManualJobToWorker,
  removeManualJobFromWorker,
  bulkImportWorkers,
  toggleWorkerCountRevenue,
  getWorkerKpi,
  getAllWorkersKpi,
} = require('../controllers/wokerController');

router.use(authenticate);

router.get('/', authorize('admin', 'giam_sat', 'ktv'), getAllWorkers);
router.post('/import', authorize('admin', 'giam_sat'), bulkImportWorkers);
router.get('/available', authorize('admin', 'giam_sat', 'ktv'), getAvailableWorkers);
router.get('/busy', authorize('admin', 'giam_sat'), getBusyWorkersWithCars);
router.get('/kpi', authorize('admin', 'giam_sat', 'ktv'), getWorkerKpi);
router.get('/kpi/all', authorize('admin', 'giam_sat'), getAllWorkersKpi);
router.get('/revenue/chart', authorize('admin', 'giam_sat'), getWorkerRevenueChart);
router.get('/revenue/weekly-summary', authorize('admin', 'giam_sat'), getWorkerWeeklyRevenueSummary);
router.patch('/:id/count-revenue', authorize('admin', 'giam_sat'), toggleWorkerCountRevenue);
router.post('/:id/manual-jobs', authorize('admin', 'giam_sat'), addManualJobToWorker);
router.delete('/:id/manual-jobs/:jobId', authorize('admin', 'giam_sat'), removeManualJobFromWorker);
router.get('/:workerId/performance', authorize('admin', 'giam_sat'), getWorkerPerformance);
router.get('/:workerId/performance/daily', authorize('admin', 'giam_sat'), getWorkerDailyPerformancePercentage);
router.get('/:id', authorize('admin', 'giam_sat', 'ktv'), getWorkerById);
router.post('/', authorize('admin'), createWorker);
router.put('/:id', authorize('admin'), updateWorker);
router.delete('/:id', authorize('admin'), deleteWorker);

module.exports = router;
