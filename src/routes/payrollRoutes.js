const express = require('express');
const router = express.Router();
const { authenticate, access } = require('../middleware/auth');
const {
  getSettings,
  updateSettings,
  getWorkerProfiles,
  updateWorkerProfile,
  getMonthlyPayroll,
  saveMonthlyPayroll,
  refreshRevenue,
  recalculatePayroll,
  getAnnualPayroll,
} = require('../controllers/payrollController');

router.use(authenticate);

router.get('/settings', access(['admin'], 'payroll.manage'), getSettings);
router.put('/settings', access(['admin'], 'payroll.manage'), updateSettings);

router.get('/workers/profiles', access(['admin'], 'payroll.manage'), getWorkerProfiles);
router.put('/workers/:id/profile', access(['admin'], 'payroll.manage'), updateWorkerProfile);

router.get('/annual/:year', access(['admin'], 'payroll.manage'), getAnnualPayroll);

router.get('/:year/:month', access(['admin'], 'payroll.manage'), getMonthlyPayroll);
router.put('/:year/:month', access(['admin'], 'payroll.manage'), saveMonthlyPayroll);
router.post('/:year/:month/refresh-revenue', access(['admin'], 'payroll.manage'), refreshRevenue);
router.post('/:year/:month/recalculate', access(['admin'], 'payroll.manage'), recalculatePayroll);

module.exports = router;
