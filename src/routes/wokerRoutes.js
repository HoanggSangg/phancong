const express = require('express');
const router = express.Router();
const {
    getAllWorkers,
    getWorkerById,
    createWorker,
    updateWorker,
    deleteWorker,
    getMainWorkers,
    getAssistantWorkers
} = require('../controllers/wokerController');

router.get('/', getAllWorkers);
router.get('/main', getMainWorkers);
router.get('/assistant', getAssistantWorkers);
router.get('/:id', getWorkerById);
router.post('/', createWorker);
router.put('/:id', updateWorker);
router.delete('/:id', deleteWorker);

module.exports = router;
