const express = require('express');
const router = express.Router();
const { authenticate, access } = require('../middleware/auth');

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

router.get('/', access(['admin', 'giam_sat', 'ktv'], 'workers.available'), getAllWorkers);
router.post('/import', access(['admin', 'giam_sat'], 'workers.main'), bulkImportWorkers);
router.get('/available', access(['admin', 'giam_sat', 'ktv'], 'workers.available'), getAvailableWorkers);
router.get('/busy', access(['admin', 'giam_sat'], 'workers.main'), getBusyWorkersWithCars);
router.get('/kpi', access(['admin', 'giam_sat', 'ktv'], 'workers.kpi'), getWorkerKpi);
router.get('/kpi/all', access(['admin', 'giam_sat'], 'workers.main'), getAllWorkersKpi);
router.get('/revenue/chart', access(['admin', 'giam_sat'], 'reports.revenue'), getWorkerRevenueChart);
router.get('/revenue/weekly-summary', access(['admin', 'giam_sat'], 'reports.revenue'), getWorkerWeeklyRevenueSummary);
router.patch('/:id/count-revenue', access(['admin', 'giam_sat'], 'workers.main'), toggleWorkerCountRevenue);
router.post('/:id/manual-jobs', access(['admin', 'giam_sat'], 'workers.main'), addManualJobToWorker);
router.delete('/:id/manual-jobs/:jobId', access(['admin', 'giam_sat'], 'workers.main'), removeManualJobFromWorker);
router.get('/:workerId/performance', access(['admin', 'giam_sat'], 'workers.main'), getWorkerPerformance);
router.get('/:workerId/performance/daily', access(['admin', 'giam_sat'], 'workers.main'), getWorkerDailyPerformancePercentage);
router.get('/:id', access(['admin', 'giam_sat', 'ktv'], 'workers.available'), getWorkerById);
router.post('/', access(['admin'], 'system.users'), createWorker);
router.put('/:id', access(['admin'], 'system.users'), updateWorker);
router.delete('/:id', access(['admin'], 'system.users'), deleteWorker);

module.exports = router;
