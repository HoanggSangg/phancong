const express = require('express');
const router = express.Router();
const {
    getAllSupervisors,
    getSupervisorById,
    createSupervisor,
    updateSupervisor,
    deleteSupervisor
} = require('../controllers/supervisorController');

router.get('/', getAllSupervisors);
router.get('/:id', getSupervisorById);
router.post('/', createSupervisor);
router.put('/:id', updateSupervisor);
router.delete('/:id', deleteSupervisor);

module.exports = router;
