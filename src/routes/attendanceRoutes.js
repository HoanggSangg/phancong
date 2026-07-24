const express = require('express');
const router = express.Router();
const { authenticate, access } = require('../middleware/auth');
const {
  getStatuses,
  getSettings,
  updateSettings,
  getMonthMeta,
  getWorkerMonth,
  upsertDays,
  deleteDay,
  listWorkers,
  getDayWorkPayroll,
  syncDayWorkPayroll,
  saveDayWorkPayroll,
} = require('../controllers/attendanceController');

router.use(authenticate);

const guard = access(['admin'], 'payroll.day-work');

router.get('/statuses', guard, getStatuses);
router.get('/settings', guard, getSettings);
router.put('/settings', guard, updateSettings);

router.get('/workers', guard, listWorkers);
router.get('/meta/:year/:month', guard, getMonthMeta);
router.get('/calendar/:workerId/:year/:month', guard, getWorkerMonth);
router.put('/calendar/:workerId/:year/:month', guard, upsertDays);
router.delete('/calendar/:workerId/:date', guard, deleteDay);

router.get('/payroll/:year/:month', guard, getDayWorkPayroll);
router.post('/payroll/:year/:month/sync', guard, syncDayWorkPayroll);
router.put('/payroll/:year/:month', guard, saveDayWorkPayroll);

module.exports = router;
