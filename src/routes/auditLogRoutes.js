const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getOperationLogs } = require('../controllers/auditLogController');

const router = express.Router();

router.use(authenticate);
router.get('/', authorize('admin'), getOperationLogs);

module.exports = router;
