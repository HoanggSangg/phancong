const express = require('express');
const router = express.Router();
const { authenticate, access } = require('../middleware/auth');
const ktvMessageController = require('../controllers/ktvMessageController');

router.use(authenticate);

router.get('/settings', access(['admin'], 'system.ktv-messages'), ktvMessageController.getSettings);
router.put('/settings', access(['admin'], 'system.ktv-messages'), ktvMessageController.updateSettings);
router.get('/sent', access(['ktv'], 'cars.manage'), ktvMessageController.getSentMessages);
router.get('/', access(['admin', 'giam_sat']), ktvMessageController.listMessages);
router.patch('/:id/read', access(['admin', 'giam_sat']), ktvMessageController.markMessageRead);
router.patch('/:id/acknowledge', access(['ktv'], 'cars.manage'), ktvMessageController.acknowledgeReadNotice);

module.exports = router;
