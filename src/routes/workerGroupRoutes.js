const express = require('express');
const router = express.Router();
const { authenticate, access } = require('../middleware/auth');
const {
  getAllWorkerGroups,
  getWorkerGroupById,
  createWorkerGroup,
  updateWorkerGroup,
  deleteWorkerGroup,
} = require('../controllers/workerGroupController');

router.use(authenticate);

router.get('/', access(['admin', 'giam_sat', 'cvdv'], 'cars.manage'), getAllWorkerGroups);
router.get('/:id', access(['admin', 'giam_sat', 'cvdv'], 'cars.manage'), getWorkerGroupById);
router.post('/', access(['admin'], 'worker-groups.manage'), createWorkerGroup);
router.put('/:id', access(['admin'], 'worker-groups.manage'), updateWorkerGroup);
router.delete('/:id', access(['admin'], 'worker-groups.manage'), deleteWorkerGroup);

module.exports = router;
