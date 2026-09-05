const express = require('express');
const { authenticate, access } = require('../middleware/auth');
const {
  logLabelPrint,
  listLabelHistory,
  deleteLabelHistory,
  deleteLabelHistoryBulk,
} = require('../controllers/labelController');

const router = express.Router();

router.use(authenticate);
router.get('/history', access(['admin'], 'labels.qr'), listLabelHistory);
router.post('/history/delete', access(['admin'], 'labels.qr'), deleteLabelHistoryBulk);
router.delete('/history/:id', access(['admin'], 'labels.qr'), deleteLabelHistory);
router.post('/print', access(['admin'], 'labels.qr'), logLabelPrint);

module.exports = router;
