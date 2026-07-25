const express = require('express');
const router = express.Router();

const {
  getPublicStatus,
  getSettings,
  updateSettings,
} = require('../controllers/systemController');
const { authenticate, access } = require('../middleware/auth');

router.get('/status', getPublicStatus);

router.get('/settings', authenticate, access(['admin'], 'system.settings'), getSettings);
router.put('/settings', authenticate, access(['admin'], 'system.settings'), updateSettings);

module.exports = router;
