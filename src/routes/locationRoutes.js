const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', authorize('admin', 'giam_sat', 'ktv'), locationController.getAllLocations);
router.post('/', authorize('admin'), locationController.createLocation);
router.put('/:id', authorize('admin'), locationController.updateLocation);
router.delete('/:id', authorize('admin'), locationController.deleteLocation);

module.exports = router;
