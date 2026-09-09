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

const repairItemsForWorkersQuery = (workerIds = []) => {
  const ids = [...new Set((workerIds || []).map(String))].filter(Boolean);
  if (!ids.length) return null;
  if (ids.length === 1) return repairItemsForWorkerQuery(ids[0]);
  return {
    $or: [
      { worker: { $in: ids } },
      { 'workerAssignments.worker': { $in: ids } },
      { 'workerRevenues.worker': { $in: ids } },
    ],
  };
};

const resolveRepairHistoryWorkerFilter = async (req, queryWorkerId) => {
  const { isKtvLike } = require('./permissions');
  const { isGiamSat, getGiamSatWorkerIds } = require('./teamScope');

  if (isKtvLike(req.user)) {
    const workerId = req.user.worker?._id || req.user.worker;
    if (!workerId) return { blocked: true };
    return { workerIds: [String(workerId)] };
  }

  if (isGiamSat(req.user)) {
    const teamIds = await getGiamSatWorkerIds(req.user);
    if (!teamIds.length) return { blocked: true };
    if (queryWorkerId) {
      const id = String(queryWorkerId);
      if (!teamIds.includes(id)) return { blocked: true };
      return { workerIds: [id] };
    }
    return { workerIds: teamIds };
  }

  if (queryWorkerId) {
    return { workerIds: [String(queryWorkerId)] };
  }

  return { workerIds: null };
};

module.exports = {
  REPAIR_ITEMS_WITH_WORKERS_QUERY,
  repairItemsForWorkerQuery,
  repairItemsForWorkersQuery,
  buildCountRevenueMap,
  resolveRepairHistoryWorkerFilter,
};
