const express = require('express');
const router = express.Router();
const { authenticate, access } = require('../middleware/auth');
const {
  getAllSupervisors,
  getSupervisorById,
  createSupervisor,
  updateSupervisor,
  deleteSupervisor,
} = require('../controllers/supervisorController');

router.use(authenticate);

router.get('/', access(['admin', 'giam_sat'], 'cars.add'), getAllSupervisors);
router.get('/:id', access(['admin', 'giam_sat'], 'cars.add'), getSupervisorById);
router.post('/', access(['admin'], 'system.supervisors'), createSupervisor);
router.put('/:id', access(['admin'], 'system.supervisors'), updateSupervisor);
router.delete('/:id', access(['admin'], 'system.supervisors'), deleteSupervisor);

module.exports = router;
