const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { lookupCarOrRO } = require('../controllers/externalController');

router.use(authenticate);
router.get('/lookup/:keyword', authorize('admin', 'giam_sat'), lookupCarOrRO);

module.exports = router;
