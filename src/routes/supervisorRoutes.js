const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getAllSupervisors,
  getSupervisorById,
  createSupervisor,
  updateSupervisor,
  deleteSupervisor,
} = require('../controllers/supervisorController');

router.use(authenticate);

router.get('/', authorize('admin', 'giam_sat'), getAllSupervisors);
router.get('/:id', authorize('admin', 'giam_sat'), getSupervisorById);
router.post('/', authorize('admin'), createSupervisor);
router.put('/:id', authorize('admin'), updateSupervisor);
router.delete('/:id', authorize('admin'), deleteSupervisor);

module.exports = router;
