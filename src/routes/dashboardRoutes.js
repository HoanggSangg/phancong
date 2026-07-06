const express = require('express');
const { authenticate, access } = require('../middleware/auth');
const {
  getDashboardOverview,
  getRevenueSettings,
  updateRevenueSettings,
} = require('../controllers/dashboardController');

const router = express.Router();

router.use(authenticate);

router.get('/overview', access(['admin'], 'reports.dashboard'), getDashboardOverview);
router.get('/revenue-settings', access(['admin'], 'reports.dashboard'), getRevenueSettings);
router.put('/revenue-settings', access(['admin'], 'reports.dashboard'), updateRevenueSettings);

module.exports = router;
