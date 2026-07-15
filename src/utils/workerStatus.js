const mongoose = require('mongoose');
const Car = require('../models/Car');
const Worker = require('../models/Worker');

// Chỉ các trạng thái xe đang cần thợ trực tiếp xử lý mới khiến thợ được coi là đang bận
const BUSY_CAR_STATUSES = ['working', 'waiting_wash', 'additional_repair'];

const normalizeWorkerId = (workerId) => {
  if (!workerId) return null;
  const id = String(workerId);
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
};

const buildWorkerCarQuery = (workerId) => {
  const oid = normalizeWorkerId(workerId);
  if (!oid) return null;

  const idStr = String(oid);
  return {
    $or: [
      { 'workers.worker': oid },
      { 'workers.worker': idStr },
    ],
  };
};

const getAssignedCarsForWorker = async (workerId) => {
  const query = buildWorkerCarQuery(workerId);
  if (!query) return [];

  return Car.find(query)
    .select('status plateNumber')
    .lean();
};

const getOtherCarsForWorker = async (workerId, excludeCarId = null) => {
  const query = buildWorkerCarQuery(workerId);
  if (!query) return [];

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
 * Tính trạng thái rảnh/bận thống nhất — dùng chung cho mọi API.
 */
const evaluateWorkerAvailability = async (workerId) => {
  const oid = normalizeWorkerId(workerId);
  if (!oid) {
    return {
      isBusy: false,
      status: 'available',
      hasManualJob: false,
      busyCars: [],
      pendingCars: [],
      assignedCars: [],
      busyCarsCount: 0,
      pendingCarsCount: 0,
    };
  }

  const worker = await Worker.findById(oid).select('manualJobs status').lean();
  if (!worker) {
    return {
      isBusy: false,
      status: 'available',
      hasManualJob: false,
      busyCars: [],
      pendingCars: [],
      assignedCars: [],
      busyCarsCount: 0,
      pendingCarsCount: 0,
    };
  }

  const assignedCars = await getAssignedCarsForWorker(oid);
  const busyCars = assignedCars.filter((car) => BUSY_CAR_STATUSES.includes(car.status));
  const pendingCars = assignedCars.filter((car) => car.status === 'pending');
  const hasManualJob = hasActiveManualJob(worker);
  const isBusy = hasManualJob || busyCars.length > 0;

  return {
    isBusy,
    status: isBusy ? 'busy' : 'available',
    hasManualJob,
    busyCars,
    pendingCars,
    assignedCars,
    busyCarsCount: busyCars.length,
    pendingCarsCount: pendingCars.length,
  };
};

/**
 * Kiểm tra thợ có đang bận thực tế không (xe + việc ghi tay), không chỉ dựa field status.
 */
const isWorkerBusy = async (workerId, { excludeCarId = null } = {}) => {
  if (excludeCarId) {
    const oid = normalizeWorkerId(workerId);
    if (!oid) return false;

    const worker = await Worker.findById(oid).select('manualJobs').lean();
    if (!worker) return false;
    if (hasActiveManualJob(worker)) return true;

    const otherCars = await getOtherCarsForWorker(oid, excludeCarId);
    return hasBusyCarAssignment(otherCars);
  }

  const availability = await evaluateWorkerAvailability(workerId);
  return availability.isBusy;
};

/**
 * Đồng bộ trạng thái thợ vào DB dựa trên xe đang gán + việc ghi tay.
 * Gọi sau khi car.save() hoặc thay đổi gán thợ / việc ghi tay.
 */
const syncWorkerStatus = async (workerId) => {
  const availability = await evaluateWorkerAvailability(workerId);
  const oid = normalizeWorkerId(workerId);
  if (!oid) return availability;

  await Worker.findByIdAndUpdate(oid, { $set: { status: availability.status } });
  return availability;
};

const syncWorkersStatus = async (workerIds = []) => {
  const uniqueIds = [...new Set(workerIds.map(String).filter(Boolean))];
  const results = [];
  for (const workerId of uniqueIds) {
    results.push(await syncWorkerStatus(workerId));
  }
  return results;
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
  getAssignedCarsForWorker,
  getOtherCarsForWorker,
  evaluateWorkerAvailability,
  isWorkerBusy,
  syncWorkerStatus,
  syncWorkersStatus,
  populateCarWorkers,
};
