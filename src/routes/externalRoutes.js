const express = require('express');
const router = express.Router();
const { authenticate, access } = require('../middleware/auth');
const { lookupCarOrRO } = require('../controllers/externalController');

router.use(authenticate);
router.get('/lookup/:keyword', access(['admin', 'giam_sat'], 'cars.add'), lookupCarOrRO);

module.exports = router;
