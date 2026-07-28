const Car = require('../models/Car');
const { isKtvLike } = require('./permissions');

const getKtvWorkerId = (user) => {
  if (!isKtvLike(user)) return null;
  return user.worker ? String(user.worker) : null;
};

const carAssignedToWorker = (car, workerId) =>
  Boolean(car?.workers?.some((assignment) => String(assignment.worker) === workerId));

const assertKtvOwnsCar = async (user, carId) => {
  const workerId = getKtvWorkerId(user);
  if (!workerId) return false;

  const car = await Car.findById(carId).select('workers.worker').lean();
  return carAssignedToWorker(car, workerId);
};

module.exports = {
  getKtvWorkerId,
  carAssignedToWorker,
  assertKtvOwnsCar,
};
