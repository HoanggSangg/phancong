const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

const {
  getAllTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  addWorkerToTeam,
  removeWorkerFromTeam,
} = require('../controllers/teamController');

router.use(authenticate);

router.get('/', authorize('admin', 'giam_sat'), getAllTeams);
router.get('/:teamId', authorize('admin', 'giam_sat'), getTeamById);
router.post('/', authorize('admin'), createTeam);
router.put('/:teamId', authorize('admin'), updateTeam);
router.delete('/:teamId', authorize('admin'), deleteTeam);
router.post('/:teamId/workers', authorize('admin'), addWorkerToTeam);
router.delete('/:teamId/workers/:workerId', authorize('admin'), removeWorkerFromTeam);

module.exports = router;
