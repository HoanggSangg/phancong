const express = require('express');
const router = express.Router();
const cateCarController = require('../controllers/catecarController');

router.post('/create', cateCarController.createCateCar);
router.get('/', cateCarController.getAllCateCars);
router.put('/:id', cateCarController.updateCateCar);
router.delete('/:id', cateCarController.deleteCateCar);

module.exports = router;
