const express = require('express');
const router = express.Router();

const {
  createMessage,
  getSettings,
  updateSettings,
  listMessages,
  markMessageRead,
  getSentMessages,
  acknowledgeReadNotice,
} = require('../controllers/ktvMessageController');

const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.post('/', createMessage);

router.get('/settings', getSettings);
router.put('/settings', updateSettings);

router.get('/', listMessages);
router.get('/sent', getSentMessages);

router.patch('/:id/read', markMessageRead);
router.patch('/:id/acknowledge', acknowledgeReadNotice);

module.exports = router;
