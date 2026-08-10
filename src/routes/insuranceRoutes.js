const express = require('express');
const router = express.Router();
const insuranceController = require('../controllers/insuranceController');
const { authenticate, access } = require('../middleware/auth');

router.use(authenticate);

const canInsurance = access(['admin'], 'system.insurance');

// Phụ tùng giá vốn BH — khai báo trước /:id
router.get('/parts', canInsurance, insuranceController.listInsuranceParts);
router.post('/parts', canInsurance, insuranceController.createInsurancePart);
router.put('/parts/:id', canInsurance, insuranceController.updateInsurancePart);
router.delete('/parts/:id', canInsurance, insuranceController.deleteInsurancePart);

router.get('/', canInsurance, insuranceController.listInsuranceCars);
router.get('/:id', canInsurance, insuranceController.getInsuranceCar);
router.post('/', canInsurance, insuranceController.createInsuranceCar);
router.put('/:id', canInsurance, insuranceController.updateInsuranceCar);
router.delete('/:id', canInsurance, insuranceController.deleteInsuranceCar);

module.exports = router;
