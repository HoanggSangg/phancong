const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { authenticate, access } = require('../middleware/auth');

router.use(authenticate);

router.get('/', access(['admin', 'giam_sat', 'ktv'], 'cars.today'), locationController.getAllLocations);
router.post('/', access(['admin'], 'system.locations'), locationController.createLocation);
router.put('/:id', access(['admin'], 'system.locations'), locationController.updateLocation);
router.delete('/:id', access(['admin'], 'system.locations'), locationController.deleteLocation);

module.exports = router;
