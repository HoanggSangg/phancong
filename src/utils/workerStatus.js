const Car = require('../models/Car');
const Worker = require('../models/Worker');

const getOtherCarsForWorker = async (workerId, excludeCarId = null) => {
  const query = { 'workers.worker': workerId };
  if (excludeCarId) {
    query._id = { $ne: excludeCarId };
  }
  return Car.find(query);
};

const releaseWorkerExtended = async (workerId, excludeCarId) => {
  const allCarsOfOldWorker = await getOtherCarsForWorker(workerId, excludeCarId);
  const hasWorking = allCarsOfOldWorker.some((c) => c.status === 'working');
  const hasWaitingWash = allCarsOfOldWorker.some((c) => c.status === 'waiting_wash');
  const hasAdditionalRepair = allCarsOfOldWorker.some((c) => c.status === 'additional_repair');
  const hasWaitingHandover = allCarsOfOldWorker.some((c) => c.status === 'waiting_handover');

  await Worker.findByIdAndUpdate(workerId, {
    status: (hasWorking || hasWaitingWash || hasAdditionalRepair || hasWaitingHandover)
      ? 'busy'
      : 'available',
  });
};

const releaseWorkerWorkingOnly = async (workerId, excludeCarId) => {
  const otherCars = await getOtherCarsForWorker(workerId, excludeCarId);
  const hasWorking = otherCars.some((c) => c.status === 'working');

  await Worker.findByIdAndUpdate(workerId, {
    status: hasWorking ? 'busy' : 'available',
  });
};

const releaseWorkerDeliveredStyle = async (workerId, excludeCarId) => {
  const allCarsOfWorker = await getOtherCarsForWorker(workerId, excludeCarId);
  const hasWorking = allCarsOfWorker.some((c) => c.status === 'working');
  const hasPending = allCarsOfWorker.some((c) => c.status === 'pending');

  if (hasWorking) {
    await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
  } else if (hasPending) {
    await Worker.findByIdAndUpdate(workerId, { status: 'available' });
  } else {
    await Worker.findByIdAndUpdate(workerId, { status: 'available' });
  }
};

const updateWorkerStatusDefault = async (workerId) => {
  const allCarsOfWorker = await Car.find({ 'workers.worker': workerId });
  const hasWorking = allCarsOfWorker.some((c) => c.status === 'working');
  const hasPending = allCarsOfWorker.some((c) => c.status === 'pending');
  const hasWaitingWash = allCarsOfWorker.some((c) => c.status === 'waiting_wash');
  const hasAdditionalRepair = allCarsOfWorker.some((c) => c.status === 'additional_repair');

  if (hasWorking || hasWaitingWash || hasAdditionalRepair) {
    await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
  } else if (hasPending) {
    await Worker.findByIdAndUpdate(workerId, { status: 'available' });
  } else {
    await Worker.findByIdAndUpdate(workerId, { status: 'available' });
  }
};

const releaseWorkers = async (workerIds, excludeCarId, mode) => {
  const updater = {
    extended: releaseWorkerExtended,
    workingOnly: releaseWorkerWorkingOnly,
    deliveredStyle: releaseWorkerDeliveredStyle,
  }[mode];

  for (const workerId of workerIds) {
    await updater(workerId, excludeCarId);
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
  getOtherCarsForWorker,
  releaseWorkerExtended,
  releaseWorkerWorkingOnly,
  releaseWorkerDeliveredStyle,
  updateWorkerStatusDefault,
  releaseWorkers,
  populateCarWorkers,
};
