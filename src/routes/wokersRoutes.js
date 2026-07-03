const express = require('express');
const router = express.Router();
const wokersController = require('../controllers/wokersController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', authorize('admin', 'giam_sat', 'ktv'), wokersController.getAllWokers);
router.get('/by-date', authorize('admin', 'giam_sat', 'ktv'), wokersController.getWokersByDate);
router.get('/:id', authorize('admin', 'giam_sat', 'ktv'), wokersController.getWokerById);
router.post('/create', authorize('admin', 'giam_sat'), wokersController.createWoker);
router.put('/:id', authorize('admin', 'giam_sat'), wokersController.updateWoker);
router.delete('/:id', authorize('admin', 'giam_sat'), wokersController.deleteWoker);

module.exports = router;
