const Car = require('../models/Car');
const Worker = require('../models/Worker');

// Trạng thái xe khiến thợ được coi là đang bận (đồng bộ với wokerController)
const BUSY_CAR_STATUSES = ['working', 'waiting_wash', 'waiting_handover', 'additional_repair'];

const getOtherCarsForWorker = async (workerId, excludeCarId = null) => {
  const query = { 'workers.worker': workerId };
  if (excludeCarId) {
    query._id = { $ne: excludeCarId };
  }
  return Car.find(query).select('status');
};

const hasActiveManualJob = (worker) =>
  worker?.manualJobs?.some((job) => job.status === 'co_viec');

const hasBusyCarAssignment = (cars = []) =>
  cars.some((car) => BUSY_CAR_STATUSES.includes(car.status));

/**
 * Kiểm tra thợ có đang bận thực tế không (xe + việc ghi tay), không chỉ dựa field status.
 */
const isWorkerBusy = async (workerId, { excludeCarId = null } = {}) => {
  const worker = await Worker.findById(workerId).select('manualJobs');
  if (!worker) return false;

  if (hasActiveManualJob(worker)) return true;

  const otherCars = await getOtherCarsForWorker(workerId, excludeCarId);
  return hasBusyCarAssignment(otherCars);
};

/**
 * Đồng bộ trạng thái thợ dựa trên xe đang gán + việc ghi tay.
 * Luôn gọi sau khi car.save() để dữ liệu xe đã phản ánh trạng thái mới.
 */
const syncWorkerStatus = async (workerId) => {
  if (!workerId) return;

  const worker = await Worker.findById(workerId).select('manualJobs status');
  if (!worker) return;

  const assignedCars = await Car.find({ 'workers.worker': workerId }).select('status');
  const shouldBeBusy = hasActiveManualJob(worker) || hasBusyCarAssignment(assignedCars);
  const nextStatus = shouldBeBusy ? 'busy' : 'available';

  if (worker.status !== nextStatus) {
    worker.status = nextStatus;
    await worker.save();
  }
};

const syncWorkersStatus = async (workerIds = []) => {
  const uniqueIds = [...new Set(workerIds.map(String).filter(Boolean))];
  for (const workerId of uniqueIds) {
    await syncWorkerStatus(workerId);
  }
};

const populateCarWorkers = async (carId) =>
  Car.findById(carId)
    .select('-workerLogs -statusHistory')
    .populate([
      { path: 'workers.worker', select: 'name' },
      { path: 'supervisor', select: 'name' },
      { path: 'location', select: 'name' },
    ]);

module.exports = {
  BUSY_CAR_STATUSES,
  getOtherCarsForWorker,
  isWorkerBusy,
  syncWorkerStatus,
  syncWorkersStatus,
  populateCarWorkers,
};
