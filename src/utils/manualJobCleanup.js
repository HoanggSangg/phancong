const moment = require('moment-timezone');
const Worker = require('../models/Worker');
const { syncWorkerStatus } = require('./workerStatus');

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getCleanupHour = () => {
  const parsed = parseInt(process.env.MANUAL_JOB_CLEANUP_HOUR ?? '12', 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 12;
};

/** Xóa việc ghi tay có ngày <= hôm nay (giờ VN). */
const getManualJobCleanupCutoff = () =>
  moment().tz(TIMEZONE).add(1, 'day').startOf('day').toDate();

/**
 * 12:00 hàng ngày (VN): xóa việc ghi tay đến hết hôm nay, đồng bộ thợ về rảnh nếu không còn bận xe.
 */
const cleanupExpiredManualJobs = async () => {
  const cutoff = getManualJobCleanupCutoff();

  const workers = await Worker.find({
    manualJobs: { $exists: true, $ne: [] },
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

  return { deletedCount, workersUpdated: workerIds.length };
};

/**
 * Chạy cleanup đúng một giờ mỗi ngày (mặc định 12:00 VN), không quét định kỳ.
 */
const scheduleDailyManualJobCleanup = (runCleanup) => {
  const hour = getCleanupHour();

  const scheduleNext = () => {
    const now = moment().tz(TIMEZONE);
    let nextRun = now.clone().startOf('day').hour(hour).minute(0).second(0).millisecond(0);
    if (!now.isBefore(nextRun)) {
      nextRun.add(1, 'day');
    }

    const delayMs = nextRun.diff(now);

    const timer = setTimeout(() => {
      runCleanup();
      setInterval(runCleanup, MS_PER_DAY);
    }, delayMs);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    return nextRun.format('YYYY-MM-DD HH:mm');
  };

  return scheduleNext();
};

module.exports = {
  cleanupExpiredManualJobs,
  getManualJobCleanupCutoff,
  getCleanupHour,
  scheduleDailyManualJobCleanup,
};
