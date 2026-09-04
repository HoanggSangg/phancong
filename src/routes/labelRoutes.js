const express = require('express');
const { authenticate, access } = require('../middleware/auth');
const { logLabelPrint, listLabelHistory } = require('../controllers/labelController');

const router = express.Router();

router.use(authenticate);
router.get('/history', access(['admin'], 'labels.qr'), listLabelHistory);
router.post('/print', access(['admin'], 'labels.qr'), logLabelPrint);

module.exports = router;
