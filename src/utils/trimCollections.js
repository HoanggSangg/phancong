const Car = require('../models/Car');
const Worker = require('../models/Worker');
const User = require('../models/User');
const Location = require('../models/Location');
const Supervisor = require('../models/Supervisor');
const Team = require('../models/Team');
const Wokers = require('../models/Wokers');
const RepairOrderItem = require('../models/RepairOrderItem');
const OperationLog = require('../models/OperationLog');

const DEFAULT_MAX_KEEP = 5000;

const COLLECTIONS = [
  { name: 'Car', model: Car },
  { name: 'Worker', model: Worker },
  { name: 'User', model: User },
  { name: 'Location', model: Location },
  { name: 'Supervisor', model: Supervisor },
  { name: 'Team', model: Team },
  { name: 'Wokers', model: Wokers },
  { name: 'RepairOrderItem', model: RepairOrderItem },
  { name: 'OperationLog', model: OperationLog },
];

const buildDeleteFilter = (cutoff) => ({
  $or: [
    { createdAt: { $lt: cutoff.createdAt } },
    { createdAt: cutoff.createdAt, _id: { $lte: cutoff._id } },
  ],
});

const trimCollection = async (model, maxKeep, dryRun = true) => {
  const total = await model.countDocuments();

  if (total <= maxKeep) {
    return {
      total,
      deleted: 0,
      kept: total,
      skipped: true,
    };
  }

  const [cutoff] = await model
    .find()
    .sort({ createdAt: -1, _id: -1 })
    .skip(maxKeep)
    .limit(1)
    .select('createdAt _id')
    .lean();

  if (!cutoff) {
    return {
      total,
      deleted: 0,
      kept: total,
      skipped: true,
    };
  }

  const filter = buildDeleteFilter(cutoff);
  const toDelete = await model.countDocuments(filter);

  if (!dryRun && toDelete > 0) {
    await model.deleteMany(filter);
  }

  return {
    total,
    deleted: toDelete,
    kept: total - toDelete,
    skipped: false,
    cutoffAt: cutoff.createdAt,
  };
};

const trimAllCollections = async ({
  maxKeep = DEFAULT_MAX_KEEP,
  dryRun = true,
} = {}) => {
  const results = [];

  for (const entry of COLLECTIONS) {
    const result = await trimCollection(entry.model, maxKeep, dryRun);
    results.push({
      collection: entry.name,
      ...result,
    });
  }

  return results;
};

module.exports = {
  COLLECTIONS,
  DEFAULT_MAX_KEEP,
  trimAllCollections,
  trimCollection,
};
