const Worker = require('../models/Worker');

const REPAIR_ITEMS_WITH_WORKERS_QUERY = {
  $or: [
    { 'workerAssignments.0': { $exists: true } },
    { worker: { $ne: null } },
  ],
};

const repairItemsForWorkerQuery = (workerId) => ({
  $or: [
    { worker: workerId },
    { 'workerAssignments.worker': workerId },
    { 'workerRevenues.worker': workerId },
  ],
});

const buildCountRevenueMap = async (workerIds = []) => {
  const ids = [...new Set(workerIds.map(String))].filter(Boolean);
  if (!ids.length) return new Map();

  const workers = await Worker.find({ _id: { $in: ids } }).select('countRevenue');
  return new Map(
    workers.map((worker) => [worker._id.toString(), worker.countRevenue !== false])
  );
};

const resolveRepairHistoryWorkerFilter = (req, queryWorkerId) => {
  if (req.user.role === 'ktv') {
    if (!req.user.worker) return { blocked: true };
    return { workerId: req.user.worker.toString() };
  }

  if (queryWorkerId && ['admin', 'giam_sat'].includes(req.user.role)) {
    return { workerId: String(queryWorkerId) };
  }

  return { workerId: null };
};

module.exports = {
  REPAIR_ITEMS_WITH_WORKERS_QUERY,
  repairItemsForWorkerQuery,
  buildCountRevenueMap,
  resolveRepairHistoryWorkerFilter,
};
