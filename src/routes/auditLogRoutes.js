const express = require('express');
const { authenticate, access } = require('../middleware/auth');
const { getOperationLogs } = require('../controllers/auditLogController');

const router = express.Router();

router.use(authenticate);
router.get('/', access(['admin', 'giam_sat'], 'system.audit-logs'), getOperationLogs);

module.exports = router;
