const express = require('express');
const router = express.Router();
const insuranceController = require('../controllers/insuranceController');
const { authenticate, access } = require('../middleware/auth');

router.use(authenticate);

router.get('/', access(['admin'], 'system.insurance'), insuranceController.listInsuranceCars);
router.get('/:id', access(['admin'], 'system.insurance'), insuranceController.getInsuranceCar);
router.post('/', access(['admin'], 'system.insurance'), insuranceController.createInsuranceCar);
router.put('/:id', access(['admin'], 'system.insurance'), insuranceController.updateInsuranceCar);
router.delete('/:id', access(['admin'], 'system.insurance'), insuranceController.deleteInsuranceCar);

module.exports = router;
