const Car = require('../models/Car');
const Worker = require('../models/Worker');
const Location = require('../models/Location');
const Supervisor = require('../models/Supervisor');
const Team = require('../models/Team');
const RepairOrderItem = require('../models/RepairOrderItem');
const OperationLog = require('../models/OperationLog');
const KtvMessage = require('../models/KtvMessage');
const KtvMessageSettings = require('../models/KtvMessageSettings');

const DEFAULT_MAX_KEEP = 5000;

const DEFAULTS = {
  skip: ['Worker', 'Location', 'Supervisor', 'Team', 'KtvMessageSettings'],
  carMax: 50_000,
  repairItemMax: 200_000,
  operationLogDays: 90,
  ktvMessageDays: 90,
  ktvMessageMax: 10_000,
  deliveredCarMonths: 12,
};

const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseSkipCollections = (value = '') =>
  value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

const buildDeleteFilter = (cutoff) => ({
  $or: [
    { createdAt: { $lt: cutoff.createdAt } },
    { createdAt: cutoff.createdAt, _id: { $lte: cutoff._id } },
  ],
});

const buildTrimConfig = (overrides = {}) => {
  const legacyMax = parsePositiveInt(
    process.env.COLLECTION_MAX_RECORDS,
    DEFAULT_MAX_KEEP,
  );

  return {
    skip: overrides.skip ?? parseSkipCollections(
      process.env.TRIM_SKIP_COLLECTIONS || DEFAULTS.skip.join(','),
    ),
    carMax: overrides.carMax ?? parsePositiveInt(
      process.env.TRIM_CAR_MAX,
      legacyMax > DEFAULT_MAX_KEEP ? legacyMax : DEFAULTS.carMax,
    ),
    repairItemMax: overrides.repairItemMax ?? parsePositiveInt(
      process.env.TRIM_REPAIR_ITEM_MAX,
      DEFAULTS.repairItemMax,
    ),
    operationLogDays: overrides.operationLogDays ?? parsePositiveInt(
      process.env.TRIM_OPERATION_LOG_DAYS,
      DEFAULTS.operationLogDays,
    ),
    ktvMessageDays: overrides.ktvMessageDays ?? parsePositiveInt(
      process.env.TRIM_KTV_MESSAGE_DAYS,
      DEFAULTS.ktvMessageDays,
    ),
    ktvMessageMax: overrides.ktvMessageMax ?? parsePositiveInt(
      process.env.TRIM_KTV_MESSAGE_MAX,
      DEFAULTS.ktvMessageMax,
    ),
    deliveredCarMonths: overrides.deliveredCarMonths ?? parsePositiveInt(
      process.env.TRIM_DELIVERED_CAR_MONTHS,
      DEFAULTS.deliveredCarMonths,
    ),
  };
};

const deleteRepairItemsForCars = async (carIds, dryRun) => {
  if (!carIds.length) {
    return 0;
  }

  const filter = { car: { $in: carIds } };
  const count = await RepairOrderItem.countDocuments(filter);

  if (!dryRun && count > 0) {
    await RepairOrderItem.deleteMany(filter);
  }

  return count;
};

const trimByAge = async (model, days, dryRun = true) => {
  const total = await model.countDocuments();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const filter = { createdAt: { $lt: cutoffDate } };
  const toDelete = await model.countDocuments(filter);

  if (!dryRun && toDelete > 0) {
    await model.deleteMany(filter);
  }

  return {
    total,
    deleted: toDelete,
    kept: total - toDelete,
    skipped: toDelete === 0,
    policy: `age>${days}d`,
    cutoffAt: cutoffDate,
  };
};

const trimByCount = async (model, maxKeep, dryRun = true, extraFilter = null) => {
  const baseFilter = extraFilter || {};
  const total = await model.countDocuments(baseFilter);

  if (total <= maxKeep) {
    return {
      total,
      deleted: 0,
      kept: total,
      skipped: true,
      policy: `max=${maxKeep}`,
    };
  }

  const [cutoff] = await model
    .find(baseFilter)
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
      policy: `max=${maxKeep}`,
    };
  }

  const filter = {
    $and: [
      baseFilter,
      buildDeleteFilter(cutoff),
    ],
  };
  const toDelete = await model.countDocuments(filter);

  if (!dryRun && toDelete > 0) {
    await model.deleteMany(filter);
  }

  return {
    total,
    deleted: toDelete,
    kept: total - toDelete,
    skipped: false,
    policy: `max=${maxKeep}`,
    cutoffAt: cutoff.createdAt,
  };
};

const trimDeliveredCars = async ({ months, maxKeep, dryRun = true }) => {
  const total = await Car.countDocuments();
  const activeCount = await Car.countDocuments({ status: { $ne: 'delivered' } });

  const monthCutoff = new Date();
  monthCutoff.setMonth(monthCutoff.getMonth() - months);

  const ageFilter = {
    status: 'delivered',
    createdAt: { $lt: monthCutoff },
  };

  const agedCars = await Car.find(ageFilter).select('_id').lean();
  const agedCarIds = agedCars.map((car) => car._id);
  let deletedByAge = 0;
  let repairItemsDeleted = 0;

  if (agedCarIds.length > 0) {
    repairItemsDeleted = await deleteRepairItemsForCars(agedCarIds, dryRun);
    deletedByAge = agedCarIds.length;

    if (!dryRun) {
      await Car.deleteMany({ _id: { $in: agedCarIds } });
    }
  }

  const remaining = total - deletedByAge;
  const deliveredMax = Math.max(0, maxKeep - activeCount);
  const deliveredCount = await Car.countDocuments({ status: 'delivered' });

  let deletedByCount = 0;
  let countCutoffAt;

  if (deliveredCount > deliveredMax) {
    const [cutoff] = await Car
      .find({ status: 'delivered' })
      .sort({ createdAt: -1, _id: -1 })
      .skip(deliveredMax)
      .limit(1)
      .select('createdAt _id')
      .lean();

    if (cutoff) {
      const countFilter = {
        status: 'delivered',
        ...buildDeleteFilter(cutoff),
      };
      deletedByCount = await Car.countDocuments(countFilter);
      countCutoffAt = cutoff.createdAt;

      if (!dryRun && deletedByCount > 0) {
        const carsToDrop = await Car.find(countFilter).select('_id').lean();
        const dropIds = carsToDrop.map((car) => car._id);
        repairItemsDeleted += await deleteRepairItemsForCars(dropIds, dryRun);
        await Car.deleteMany(countFilter);
      }
    }
  }

  const deleted = deletedByAge + deletedByCount;
  const kept = total - deleted;

  return {
    total,
    deleted,
    kept,
    skipped: deleted === 0,
    policy: `delivered>${months}m + max=${maxKeep} (active=${activeCount})`,
    cutoffAt: monthCutoff,
    details: {
      deletedByAge,
      deletedByCount,
      repairItemsDeleted,
      activeCount,
      deliveredMax,
      countCutoffAt,
    },
  };
};

const trimOrphanRepairItems = async (dryRun = true) => {
  const total = await RepairOrderItem.countDocuments();

  const orphanIds = await RepairOrderItem.aggregate([
    {
      $lookup: {
        from: 'cars',
        localField: 'car',
        foreignField: '_id',
        as: 'carDoc',
      },
    },
    { $match: { carDoc: { $size: 0 } } },
    { $project: { _id: 1 } },
  ]);

  const toDelete = orphanIds.length;

  if (!dryRun && toDelete > 0) {
    await RepairOrderItem.deleteMany({ _id: { $in: orphanIds.map((row) => row._id) } });
  }

  return {
    total,
    deleted: toDelete,
    kept: total - toDelete,
    skipped: toDelete === 0,
    policy: 'orphan-cleanup',
  };
};

const trimRepairOrderItems = async (maxKeep, dryRun = true) => {
  const total = await RepairOrderItem.countDocuments();
  const orphanResult = await trimOrphanRepairItems(dryRun);
  const countResult = await trimByCount(RepairOrderItem, maxKeep, dryRun);

  return {
    total,
    deleted: orphanResult.deleted + countResult.deleted,
    kept: total - orphanResult.deleted - countResult.deleted,
    skipped: orphanResult.deleted === 0 && countResult.skipped,
    policy: `orphan + max=${maxKeep}`,
    details: {
      orphanDeleted: orphanResult.deleted,
      countDeleted: countResult.deleted,
      cutoffAt: countResult.cutoffAt,
    },
  };
};

const logMasterData = async (name, model) => {
  const total = await model.countDocuments();
  return {
    collection: name,
    total,
    deleted: 0,
    kept: total,
    skipped: true,
    policy: 'master-data (không trim)',
  };
};

const trimKtvMessages = async ({ days, maxKeep, dryRun = true }) => {
  const total = await KtvMessage.countDocuments();
  const ageResult = await trimByAge(KtvMessage, days, dryRun);
  const countResult = await trimByCount(KtvMessage, maxKeep, dryRun);
  const deleted = ageResult.deleted + countResult.deleted;

  return {
    total,
    deleted,
    kept: Math.max(0, total - deleted),
    skipped: deleted === 0,
    policy: `age>${days}d + max=${maxKeep}`,
    cutoffAt: ageResult.cutoffAt,
    details: {
      deletedByAge: ageResult.deleted,
      deletedByCount: countResult.deleted,
      countCutoffAt: countResult.cutoffAt,
    },
  };
};

const trimAllCollections = async ({
  maxKeep = DEFAULT_MAX_KEEP,
  dryRun = true,
  config: configOverrides = {},
} = {}) => {
  const config = buildTrimConfig(configOverrides);
  const results = [];

  results.push(await trimDeliveredCars({
    months: config.deliveredCarMonths,
    maxKeep: config.carMax,
    dryRun,
  }));
  results[results.length - 1].collection = 'Car';

  results.push(await trimRepairOrderItems(config.repairItemMax, dryRun));
  results[results.length - 1].collection = 'RepairOrderItem';

  const logResult = await trimByAge(OperationLog, config.operationLogDays, dryRun);
  results.push({
    collection: 'OperationLog',
    ...logResult,
  });

  const ktvMessageResult = await trimKtvMessages({
    days: config.ktvMessageDays,
    maxKeep: config.ktvMessageMax,
    dryRun,
  });
  results.push({
    collection: 'KtvMessage',
    ...ktvMessageResult,
  });

  if (config.skip.includes('KtvMessageSettings')) {
    results.push(await logMasterData('KtvMessageSettings', KtvMessageSettings));
  } else {
    const settingsResult = await trimByCount(KtvMessageSettings, 1, dryRun);
    results.push({
      collection: 'KtvMessageSettings',
      ...settingsResult,
      policy: 'singleton',
    });
  }

  const masterModels = [
    { name: 'Worker', model: Worker },
    { name: 'Location', model: Location },
    { name: 'Supervisor', model: Supervisor },
    { name: 'Team', model: Team },
  ];

  for (const entry of masterModels) {
    if (config.skip.includes(entry.name)) {
      results.push(await logMasterData(entry.name, entry.model));
    } else {
      const countResult = await trimByCount(entry.model, maxKeep, dryRun);
      results.push({
        collection: entry.name,
        ...countResult,
      });
    }
  }

  return results;
};

const getTrimSummary = (config = buildTrimConfig()) => ({
  skip: config.skip,
  carMax: config.carMax,
  repairItemMax: config.repairItemMax,
  operationLogDays: config.operationLogDays,
  ktvMessageDays: config.ktvMessageDays,
  ktvMessageMax: config.ktvMessageMax,
  deliveredCarMonths: config.deliveredCarMonths,
});

module.exports = {
  DEFAULTS,
  DEFAULT_MAX_KEEP,
  buildTrimConfig,
  getTrimSummary,
  trimAllCollections,
  trimCollection: trimByCount,
};
