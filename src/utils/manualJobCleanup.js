const moment = require('moment-timezone');
const Worker = require('../models/Worker');
const { syncWorkerStatus } = require('./workerStatus');

const getTodayStartVN = () =>
  moment().tz('Asia/Ho_Chi_Minh').startOf('day').toDate();

/**
 * Xóa việc ghi tay đã qua ngày (trước hôm nay theo giờ VN),
 * rồi đồng bộ lại trạng thái thợ (rảnh nếu không còn xe/việc bận).
 */
const cleanupExpiredManualJobs = async () => {
  const cutoff = getTodayStartVN();

  const workers = await Worker.find({
    'manualJobs.date': { $lt: cutoff },
  }).select('_id manualJobs');

  if (workers.length === 0) {
    return { deletedCount: 0, workersUpdated: 0 };
  }

  let deletedCount = 0;
  const workerIds = [];

  workers.forEach((worker) => {
    const expired = (worker.manualJobs || []).filter(
      (job) => new Date(job.date) < cutoff,
    );

    if (expired.length === 0) return;

    deletedCount += expired.length;
    workerIds.push(worker._id);
  });

  if (workerIds.length === 0) {
    return { deletedCount: 0, workersUpdated: 0 };
  }

  await Worker.updateMany(
    { _id: { $in: workerIds } },
    { $pull: { manualJobs: { date: { $lt: cutoff } } } },
  );

  for (const workerId of workerIds) {
    await syncWorkerStatus(workerId);
  }

  const todayStr = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');
  const workersWithActiveJobs = await Worker.find({
    'manualJobs.status': 'co_viec',
  }).select('_id manualJobs');

  for (const worker of workersWithActiveJobs) {
    const hasTodayJob = (worker.manualJobs || []).some((job) => {
      if (job.status !== 'co_viec') return false;
      return moment(job.date).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD') === todayStr;
    });

    if (hasTodayJob && !workerIds.some((id) => String(id) === String(worker._id))) {
      await syncWorkerStatus(worker._id);
    }
  }

  return { deletedCount, workersUpdated: workerIds.length };
};

module.exports = {
  cleanupExpiredManualJobs,
  getTodayStartVN,
};
