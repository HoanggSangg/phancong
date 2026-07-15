const mongoose = require('mongoose');
const Car = require('../models/Car');
const Worker = require('../models/Worker');

// Chỉ các trạng thái xe đang cần thợ trực tiếp xử lý mới giữ thợ ở trạng thái bận
const BUSY_CAR_STATUSES = ['working', 'waiting_wash', 'additional_repair'];

const normalizeWorkerId = (workerId) => {
  if (!workerId) return null;
  const id = String(workerId);
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
};

const getOtherCarsForWorker = async (workerId, excludeCarId = null) => {
  const oid = normalizeWorkerId(workerId);
  if (!oid) return [];

  const query = { 'workers.worker': oid };
  if (excludeCarId) {
    query._id = { $ne: excludeCarId };
  }
  return Car.find(query).select('status').lean();
};

const hasActiveManualJob = (worker) =>
  worker?.manualJobs?.some((job) => job.status === 'co_viec');

const hasBusyCarAssignment = (cars = []) =>
  cars.some((car) => BUSY_CAR_STATUSES.includes(car.status));

/**
 * Kiểm tra thợ có đang bận thực tế không (xe + việc ghi tay), không chỉ dựa field status.
 */
const isWorkerBusy = async (workerId, { excludeCarId = null } = {}) => {
  const oid = normalizeWorkerId(workerId);
  if (!oid) return false;

  const worker = await Worker.findById(oid).select('manualJobs').lean();
  if (!worker) return false;

  if (hasActiveManualJob(worker)) return true;

  const otherCars = await getOtherCarsForWorker(oid, excludeCarId);
  return hasBusyCarAssignment(otherCars);
};

/**
 * Đồng bộ trạng thái thợ dựa trên xe đang gán + việc ghi tay.
 * Luôn gọi sau khi car.save() để dữ liệu xe đã phản ánh trạng thái mới.
 */
const syncWorkerStatus = async (workerId) => {
  const oid = normalizeWorkerId(workerId);
  if (!oid) return;

  const worker = await Worker.findById(oid).select('manualJobs status').lean();
  if (!worker) return;

  const assignedCars = await Car.find({ 'workers.worker': oid }).select('status').lean();
  const shouldBeBusy = hasActiveManualJob(worker) || hasBusyCarAssignment(assignedCars);
  const nextStatus = shouldBeBusy ? 'busy' : 'available';

  await Worker.findByIdAndUpdate(oid, { $set: { status: nextStatus } });
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
