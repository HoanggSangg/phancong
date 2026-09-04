const express = require('express');
const { authenticate, access } = require('../middleware/auth');
const { logLabelPrint } = require('../controllers/labelController');

const router = express.Router();

router.use(authenticate);
router.post('/print', access(['admin'], 'labels.qr'), logLabelPrint);

module.exports = router;
