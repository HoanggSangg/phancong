const express = require('express');
const router = express.Router();
const { authenticate, access } = require('../middleware/auth');

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

router.get('/', access(['admin', 'giam_sat'], 'teams.manage'), getAllTeams);
router.get('/:teamId', access(['admin', 'giam_sat'], 'teams.manage'), getTeamById);
router.post('/', access(['admin'], 'system.locations'), createTeam);
router.put('/:teamId', access(['admin'], 'system.locations'), updateTeam);
router.delete('/:teamId', access(['admin'], 'system.locations'), deleteTeam);
router.post('/:teamId/workers', access(['admin'], 'system.locations'), addWorkerToTeam);
router.delete('/:teamId/workers/:workerId', access(['admin'], 'system.locations'), removeWorkerFromTeam);

module.exports = router;
