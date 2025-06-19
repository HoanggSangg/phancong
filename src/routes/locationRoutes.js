const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');

router.post('/', locationController.createLocation);
router.get('/', locationController.getAllLocations);
router.put('/:id', locationController.updateLocation);
router.delete('/:id', locationController.deleteLocation);

module.exports = router;
