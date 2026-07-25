const express = require('express');
const router = express.Router();

const {
  getPublicStatus,
  getSettings,
  updateSettings,
  getVersion,
  getOnlineClients,
  publishUpdate,
} = require('../controllers/systemController');
const { authenticate, access } = require('../middleware/auth');

router.get('/status', getPublicStatus);
router.get('/version', getVersion);

router.get('/settings', authenticate, access(['admin'], 'system.settings'), getSettings);
router.put('/settings', authenticate, access(['admin'], 'system.settings'), updateSettings);

router.get('/online-clients', authenticate, access(['admin'], 'system.settings'), getOnlineClients);
router.post('/publish-update', authenticate, access(['admin'], 'system.settings'), publishUpdate);

module.exports = router;
